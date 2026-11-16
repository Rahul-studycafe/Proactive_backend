import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { exec } from 'child_process';
import { promisify } from 'util';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

const MONGO_URI = process.env.MONGO_URI || 'mongodb://root:secret@localhost:27017/proactive?authSource=admin';
const BACKUP_DIR = path.resolve(__dirname, '../backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '14', 10);

/**
 * Check if binary is installed and callable
 */
async function hasCommand(cmd: string): Promise<boolean> {
  try {
    await execAsync(`${cmd} --version`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean up old backups based on retention policy
 */
function cleanupOldBackups(backupDir: string, retentionDays: number) {
  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;

  if (!fs.existsSync(backupDir)) return;

  const files = fs.readdirSync(backupDir);
  let deletedCount = 0;

  for (const file of files) {
    if (!file.startsWith('proactive-backup-') && !file.startsWith('safety-pre-restore-')) continue;
    const filePath = path.join(backupDir, file);
    try {
      const stats = fs.statSync(filePath);
      const ageMs = now - stats.mtimeMs;
      if (ageMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`[Retention] Removed old backup file: ${file}`);
      }
    } catch (err) {
      console.warn(`[Retention] Could not check/remove ${file}:`, err);
    }
  }

  if (deletedCount > 0) {
    console.log(`[Retention] Successfully purged ${deletedCount} backup(s) older than ${retentionDays} days.`);
  }
}

/**
 * Format timestamp for file names
 */
function getTimestampString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());
  return `${year}-${month}-${day}_${hours}-${mins}-${secs}`;
}

/**
 * Fallback backup: Streams all collections using Mongoose + Gzip compression
 */
async function fallbackMongooseBackup(uri: string, outputPath: string) {
  console.log('[Backup] mongodump binary not detected. Using seamless Mongoose stream exporter...');
  const conn = await mongoose.createConnection(uri).asPromise();

  try {
    const collections = await conn.db!.listCollections().toArray();
    console.log(`[Backup] Discovered ${collections.length} database collection(s).`);

    const dumpData: Record<string, any[]> = {};
    let totalDocs = 0;

    for (const col of collections) {
      const colName = col.name;
      if (colName.startsWith('system.')) continue;

      const docs = await conn.db!.collection(colName).find({}).toArray();
      dumpData[colName] = docs;
      totalDocs += docs.length;
      console.log(`  âžœ Exported ${colName}: ${docs.length} document(s)`);
    }

    const jsonString = JSON.stringify({
      database: conn.name,
      exportedAt: new Date().toISOString(),
      collectionCount: Object.keys(dumpData).length,
      totalDocumentCount: totalDocs,
      data: dumpData
    });

    const compressed = zlib.gzipSync(Buffer.from(jsonString, 'utf-8'));
    fs.writeFileSync(outputPath, compressed);
    console.log(`[Backup] Successfully exported and compressed ${totalDocs} document(s).`);
  } finally {
    await conn.close();
  }
}

/**
 * Main Backup Runner
 */
export async function runBackup(): Promise<string> {
  const startTime = Date.now();
  console.log('======================================================');
  console.log('   Pillar 3: Automated Database Backup Utility');
  console.log('======================================================');
  console.log(`Date: ${new Date().toISOString()}`);

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = getTimestampString();
  const mongodumpAvailable = await hasCommand('mongodump');

  let targetFile: string;

  if (mongodumpAvailable) {
    targetFile = path.join(BACKUP_DIR, `proactive-backup-${timestamp}.archive.gz`);
    console.log(`[Backup] Using high-performance native mongodump binary...`);
    const cmd = `mongodump --uri="${MONGO_URI}" --archive="${targetFile}" --gzip`;
    await execAsync(cmd);
  } else {
    targetFile = path.join(BACKUP_DIR, `proactive-backup-${timestamp}.json.gz`);
    await fallbackMongooseBackup(MONGO_URI, targetFile);
  }

  const stats = fs.statSync(targetFile);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('------------------------------------------------------');
  console.log(`âœ… Backup completed successfully!`);
  console.log(`   File: ${targetFile}`);
  console.log(`   Size: ${sizeMb} MB (${stats.size} bytes)`);
  console.log(`   Time Taken: ${durationSec}s`);
  console.log('------------------------------------------------------');

  // Enforce retention policy
  cleanupOldBackups(BACKUP_DIR, RETENTION_DAYS);

  return targetFile;
}

if (require.main === module) {
  runBackup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('â Œ Backup failed with error:', err);
      process.exit(1);
    });
}
