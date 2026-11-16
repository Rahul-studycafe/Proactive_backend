const dns = require('node:dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}
const mongoose = require('mongoose');

async function checkSsoClients() {
  const localConn = await mongoose.createConnection('mongodb://root:secret@localhost:27017/proactive?authSource=admin').asPromise();
  const atlasConn = await mongoose.createConnection('mongodb+srv://developer_db_user:qFncLT7ZLOWjBKbJ@cluster0.hgo8nya.mongodb.net/proactive?retryWrites=true&w=majority').asPromise();

  const localSso = await localConn.db.collection('ssoclients').find({}).toArray();
  const atlasSso = await atlasConn.db.collection('ssoclients').find({}).toArray();

  console.log('LOCAL SSO CLIENTS:', JSON.stringify(localSso, null, 2));
  console.log('ATLAS SSO CLIENTS:', JSON.stringify(atlasSso, null, 2));

  await localConn.close();
  await atlasConn.close();
}

checkSsoClients().catch(console.error);

