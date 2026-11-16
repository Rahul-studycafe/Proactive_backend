const dns = require('node:dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}
const mongoose = require('mongoose');

async function checkIndexes() {
  const conn = await mongoose.createConnection('mongodb+srv://developer_db_user:qFncLT7ZLOWjBKbJ@cluster0.hgo8nya.mongodb.net/proactive?retryWrites=true&w=majority').asPromise();
  const db = conn.db;

  const puIndexes = await db.collection('platformusers').indexes();
  console.log('ATLAS platformusers indexes:', JSON.stringify(puIndexes, null, 2));

  const uIndexes = await db.collection('users').indexes();
  console.log('ATLAS users indexes:', JSON.stringify(uIndexes, null, 2));

  const oIndexes = await db.collection('organizations').indexes();
  console.log('ATLAS organizations indexes:', JSON.stringify(oIndexes, null, 2));

  await conn.close();l̥l̥
}

checkIndexes().catch(console.error);