import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { exec } from 'child_process';
import { promisify } from 'util';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { runBackup } from './db-backup';

dotenv.config();

const execAsync = promisify(exec);

const MONGO_URI = process.env.MONGO_URI || 'mongodb://root:secret@localhost:27017/proactive?authSource=admin';
const BACKUP_DIR = path.resolve(__dirname, '../backups');

async function hasCommand(cmd: string): Promise<boolean> {
  try {
    await execAsync(`${cmd} --version`);
    return true;
  } catch {
    return false;
  }
}

/**
 * List available backups in reverse chronological order
 */
function getAvailableBackups(): { name: string; fullPath: string; sizeMb: string; date: Date }[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('proactive-backup-') || f.startsWith('safety-pre-restore-'))
    .map((file) => {
      const fullPath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(fullPath);
      return {
        name: file,
        fullPath,
        sizeMb: (stat.size / (1024 * 1024)).toFixed(2),
        date: stat.mtime
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Fallback restore from JSON.gz
 */
async function fallbackMongooseRestore(uri: string, inputPath: string) {
  console.log('[Restore] Decompressing backup archive...');
  const compressedBuffer = fs.readFileSync(inputPath);
  const decompressedBuffer = zlib.gunzipSync(compressedBuffer);
  const json = JSON.parse(decompressedBuffer.toString('utf-8'));

  const conn = await mongoose.createConnection(uri).asPromise();

  try {
    const data: Record<string, any[]> = json.data;
    const collections = Object.keys(data);
    console.log(`[Restore] Restoring ${collections.length} collection(s) into database "${conn.name}"...`);

    for (const colName of collections) {
      const docs = data[colName];
      const col = conn.db!.collection(colName);

      // Clean existing data in collection
      await col.deleteMany({});

      if (docs && docs.length > 0) {
        // Deserialize dates and ObjectIds if needed
        const processedDocs = docs.map((doc) => {
          for (const key of Object.keys(doc)) {
            if (key === '_id' && doc[key] && typeof doc[key] === 'string' && /^[0-9a-fA-F]{24}$/.test(doc[key])) {
              doc[key] = new mongoose.Types.ObjectId(doc[key]);
            }
          }
          return doc;
        });

        await col.insertMany(processedDocs, { ordered: false });
      }
      console.log(`  âžœ Restored ${colName}: ${docs.length} document(s)`);
    }

    console.log(`[Restore] Data restoration completed successfully.`);
  } finally {
    await conn.close();
  }
}

/**
 * Main Restore Runner
 */
export async function runRestore(targetFileName?: string) {
  const startTime = Date.now();
  console.log('======================================================');
  console.log('   Pillar 3: Database Restore & Disaster Recovery');
  console.log('======================================================');

  const backups = getAvailableBackups();
  if (backups.length === 0) {
    throw new Error(`No backup archives found in ${BACKUP_DIR}. Please run "npm run db:backup" first.`);
  }

  let selectedBackup: { name: string; fullPath: string; sizeMb: string; date: Date };

  if (targetFileName) {
    const match = backups.find((b) => b.name === targetFileName || b.fullPath === targetFileName);
    if (!match) {
      throw new Error(`Backup file "${targetFileName}" not found in ${BACKUP_DIR}`);
    }
    selectedBackup = match;
  } else {
    // Default to latest
    selectedBackup = backups[0];
  }

  console.log(`Selected Backup File: ${selectedBackup.name}`);
  console.log(`Backup Timestamp:     ${selectedBackup.date.toISOString()}`);
  console.log(`File Size:            ${selectedBackup.sizeMb} MB`);
  console.log('------------------------------------------------------');

  // Step 1: ALWAYS take an automatic safety pre-restore backup first!
  console.log('[Safety Guard] Creating pre-restore snapshot of current database state...');
  try {
    await runBackup();
    console.log('[Safety Guard] Pre-restore snapshot secured.');
  } catch (err) {
    console.warn('[Safety Guard Warning] Could not take pre-restore snapshot, proceeding with restore:', err);
  }

  // Step 2: Perform the restore
  const mongorestoreAvailable = await hasCommand('mongorestore');

  if (selectedBackup.name.endsWith('.archive.gz') && mongorestoreAvailable) {
    console.log('[Restore] Running high-speed native mongorestore...');
    const cmd = `mongorestore --uri="${MONGO_URI}" --archive="${selectedBackup.fullPath}" --gzip --drop`;
    await execAsync(cmd);
  } else if (selectedBackup.name.endsWith('.json.gz')) {
    await fallbackMongooseRestore(MONGO_URI, selectedBackup.fullPath);
  } else {
    // If it's an archive file but mongorestore isn't in PATH
    throw new Error(
      `Cannot restore "${selectedBackup.name}": "mongorestore" command not found in system PATH. Please install MongoDB Database Tools or use a .json.gz backup file.`
    );
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('------------------------------------------------------');
  console.log(`âœ… Database restored successfully from: ${selectedBackup.name}`);
  console.log(`   Time Taken: ${durationSec}s`);
  console.log('======================================================');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let fileArg: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      fileArg = arg.replace('--file=', '');
    } else if (arg === '--latest') {
      fileArg = undefined; // defaults to latest
    }
  }

  runRestore(fileArg)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('â Œ Restore failed with error:', err.message || err);
      process.exit(1);
    });
}
