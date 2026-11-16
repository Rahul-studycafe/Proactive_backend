const dns = require('node:dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}
const mongoose = require('mongoose');

async function listAtlas() {
  const uri = 'mongodb+srv://developer_db_user:qFncLT7ZLOWjBKbJ@cluster0.hgo8nya.mongodb.net/proactive?retryWrites=true&w=majority';
  const conn = await mongoose.createConnection(uri).asPromise();
  const db = conn.db;

  const collections = await db.listCollections().toArray();
  console.log(`Found ${collections.length} collections in ATLAS:`);

  const summary = [];
  for (const c of collections) {
    if (c.name.startsWith('system.')) continue;
    const count = await db.collection(c.name).countDocuments();
    if (count > 0) {
      summary.push({ name: c.name, count });
    }
  }

  summary.sort((a, b) => b.count - a.count);
  for (const item of summary) {
    console.log(`- ${item.name}: ${item.count} documents`);
  }

  await conn.close();
}

listAtlas().catch(console.error);

