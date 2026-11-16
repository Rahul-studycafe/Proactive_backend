const mongoose = require('mongoose');

async function listLocal() {
  const uri = 'mongodb://root:secret@localhost:27017/proactive?authSource=admin';
  const conn = await mongoose.createConnection(uri).asPromise();
  const db = conn.db;

  const collections = await db.listCollections().toArray();
  console.log(`Found ${collections.length} collections in LOCAL:`);

  const summary = [];
  for (const c of collections) {
    if (c.name.startsWith('system.')) continue;
    const count = await db.collection(c.name).countDocuments();
    summary.push({ name: c.name, count });
  }

  summary.sort((a, b) => b.count - a.count);
  for (const item of summary) {
    console.log(`- ${item.name}: ${item.count} documents`);
  }

  await conn.close();
}

listLocal().catch(console.error);

