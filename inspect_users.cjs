const dns = require('node:dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');

async function inspectDb(label, uri) {
  console.log(`\n=== INSPECTING ${label} ===`);
  try {
    const conn = await mongoose.createConnection(uri).asPromise();
    const db = conn.db;

    const emails = ['developer@studycafe.in', 'info@studycafe.in'];

    // Platform users
    const platformUsers = await db.collection('platformusers').find({
      email: { $in: emails }
    }).toArray();
    console.log(`[${label}] PlatformUsers:`, platformUsers.map(u => ({ _id: u._id, email: u.email, name: u.name, organizationId: u.organizationId })));

    // Tenant users
    const tenantUsers = await db.collection('users').find({
      email: { $in: emails }
    }).toArray();
    console.log(`[${label}] Tenant Users:`, tenantUsers.map(u => ({ _id: u._id, email: u.email, name: u.name, tenantId: u.tenantId, role: u.role })));

    // Organizations owned or linked
    const puIds = platformUsers.map(u => u._id);
    const orgIdsFromUsers = [
      ...platformUsers.map(u => u.organizationId).filter(Boolean),
      ...tenantUsers.map(u => u.tenantId).filter(Boolean)
    ];

    const orgs = await db.collection('organizations').find({
      $or: [
        { ownerId: { $in: puIds } },
        { _id: { $in: orgIdsFromUsers } }
      ]
    }).toArray();
    console.log(`[${label}] Organizations linked to targets:`, orgs.map(o => ({ _id: o._id, name: o.name, slug: o.slug, ownerId: o.ownerId })));

    // All orgs
    const allOrgs = await db.collection('organizations').find({}).toArray();
    console.log(`[${label}] All Organizations:`, allOrgs.map(o => ({ _id: o._id, name: o.name, slug: o.slug, ownerId: o.ownerId })));

    await conn.close();
  } catch (err) {
    console.error(`[${label}] Error:`, err.message);
  }
}

async function main() {
  await inspectDb('LOCAL MONGODB', 'mongodb://localhost:27017/proactive');
  await inspectDb('ATLAS MONGODB', 'mongodb+srv://developer_db_user:qFncLT7ZLOWjBKbJ@cluster0.hgo8nya.mongodb.net/proactive?retryWrites=true&w=majority');
}

main().catch(console.error);

