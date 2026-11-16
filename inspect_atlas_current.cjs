const dns = require('node:dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}
const mongoose = require('mongoose');

async function inspectAtlasCurrent() {
  const uri = 'mongodb+srv://developer_db_user:qFncLT7ZLOWjBKbJ@cluster0.hgo8nya.mongodb.net/proactive?retryWrites=true&w=majority';
  const conn = await mongoose.createConnection(uri).asPromise();
  const db = conn.db;

  const orgs = await db.collection('organizations').find({}).toArray();
  const users = await db.collection('users').find({}).toArray();
  const platformUsers = await db.collection('platformusers').find({}).toArray();

  console.log('ATLAS ORGS:', orgs.map(o => ({ _id: o._id, name: o.name, slug: o.slug, ownerId: o.ownerId })));
  console.log('ATLAS USERS:', users.map(u => ({ _id: u._id, email: u.email, name: u.name, tenantId: u.tenantId })));
  console.log('ATLAS PLATFORM USERS:', platformUsers.map(u => ({ _id: u._id, email: u.email, name: u.name })));

  await conn.close();
}

inspectAtlasCurrent().catch(console.error);

