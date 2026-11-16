const mongoose = require('mongoose');

async function inspectLocalPlatformUsers() {
  const conn = await mongoose.createConnection('mongodb://root:secret@localhost:27017/proactive?authSource=admin').asPromise();
  const db = conn.db;

  const users = await db.collection('platformusers').find({}).toArray();
  console.log('LOCAL PLATFORM USERS:');
  for (const u of users) {
    console.log(`- _id: ${u._id}, email: ${u.email}, name: ${u.name}`);
  }

  const orgs = await db.collection('organizations').find({}).toArray();
  console.log('\nLOCAL ORGANIZATIONS:');
  for (const o of orgs) {
    console.log(`- _id: ${o._id}, name: ${o.name}, slug: ${o.slug}, ownerId: ${o.ownerId}`);
  }

  await conn.close();
}

inspectLocalPlatformUsers().catch(console.error);

