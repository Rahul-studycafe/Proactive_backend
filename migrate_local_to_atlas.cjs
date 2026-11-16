const dns = require('node:dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');

const LOCAL_URI = 'mongodb://root:secret@localhost:27017/proactive?authSource=admin';
const ATLAS_URI = 'mongodb+srv://developer_db_user:qFncLT7ZLOWjBKbJ@cluster0.hgo8nya.mongodb.net/proactive?retryWrites=true&w=majority';

async function migrate() {
  console.log('Connecting to LOCAL and ATLAS MongoDB databases...');
  const localConn = await mongoose.createConnection(LOCAL_URI).asPromise();
  const atlasConn = await mongoose.createConnection(ATLAS_URI).asPromise();

  const localDb = localConn.db;
  const atlasDb = atlasConn.db;

  console.log('Connected successfully!');

  // 1. Preserve Atlas ssoclients configuration
  console.log('\n--- 1. Backing up Atlas ssoclients ---');
  const existingAtlasSso = await atlasDb.collection('ssoclients').find({}).toArray();
  console.log(`Backed up ${existingAtlasSso.length} ssoclient(s) from Atlas.`);

  // 2. Retrieve all local collections
  const localCollections = await localDb.listCollections().toArray();
  const collNames = localCollections
    .map(c => c.name)
    .filter(name => !name.startsWith('system.'));

  console.log(`\n--- 2. Starting migration of ${collNames.length} collections from LOCAL to ATLAS ---`);

  const results = [];

  for (const name of collNames) {
    const localColl = localDb.collection(name);
    const atlasColl = atlasDb.collection(name);

    const docCount = await localColl.countDocuments();
    const indexes = await localColl.indexes();

    if (name === 'ssoclients') {
      // For ssoclients, we keep the live Atlas record which contains the live secret and live redirect URIs!
      console.log(`[ssoclients] Keeping live Atlas configuration intact.`);
      results.push({ name, localCount: docCount, atlasCount: existingAtlasSso.length, status: 'Preserved Live' });
      continue;
    }

    // Read all docs from local
    const docs = await localColl.find({}).toArray();

    // Clear destination in Atlas
    await atlasColl.deleteMany({});

    // Insert docs in batches of 500
    if (docs.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize);
        await atlasColl.insertMany(batch, { ordered: true });
      }
    }

    // Recreate indexes (skip _id_)
    for (const idx of indexes) {
      if (idx.name === '_id_') continue;
      try {
        const options = { name: idx.name };
        if (idx.unique) options.unique = true;
        if (idx.sparse) options.sparse = true;
        if (idx.expireAfterSeconds !== undefined) options.expireAfterSeconds = idx.expireAfterSeconds;
        await atlasColl.createIndex(idx.key, options);
      } catch (idxErr) {
        // Some indexes might already exist or conflict slightly
        console.warn(`  [${name}] Index ${idx.name} note: ${idxErr.message}`);
      }
    }

    const verifiedCount = await atlasColl.countDocuments();
    results.push({ name, localCount: docCount, atlasCount: verifiedCount, status: 'Success' });
    console.log(`✔ [${name}] Migrated ${verifiedCount}/${docCount} documents.`);
  }

  // 3. Ensure ssoclients in Atlas has the correct live clientSecret and redirect URIs
  if (existingAtlasSso.length > 0) {
    await atlasDb.collection('ssoclients').deleteMany({});
    await atlasDb.collection('ssoclients').insertMany(existingAtlasSso);
    console.log(`✔ [ssoclients] Verified live Atlas SSO client restored.`);
  }

  // 4. Print Summary
  console.log('\n========================================');
  console.log(' MIGRATION SUMMARY (LOCAL -> ATLAS)');
  console.log('========================================');
  let totalLocal = 0;
  let totalAtlas = 0;
  for (const r of results) {
    totalLocal += r.localCount;
    totalAtlas += r.atlasCount;
    if (r.localCount > 0) {
      console.log(`${r.name.padEnd(30)} Local: ${String(r.localCount).padStart(4)} | Atlas: ${String(r.atlasCount).padStart(4)} | ${r.status}`);
    }
  }
  console.log('----------------------------------------');
  console.log(`Total Documents Migrated: ${totalAtlas} (Local: ${totalLocal})`);

  // 5. Final sanity check: verify key collections in Atlas
  console.log('\n--- Final Verification in Atlas ---');
  const orgs = await atlasDb.collection('organizations').find({}).toArray();
  console.log('Organizations in Atlas:');
  for (const o of orgs) {
    console.log(`  - [${o._id}] "${o.name}" (slug: ${o.slug})`);
  }

  const users = await atlasDb.collection('platformusers').find({}).toArray();
  console.log('Platform Users in Atlas:');
  for (const u of users) {
    console.log(`  - [${u._id}] ${u.email} (${u.name})`);
  }

  const tenantUsers = await atlasDb.collection('users').find({}).toArray();
  console.log(`Tenant Users in Atlas: ${tenantUsers.length} users`);

  await localConn.close();
  await atlasConn.close();
  console.log('\nMigration completed successfully!');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

