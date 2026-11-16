const mongoose = require('mongoose');

async function inspectLocal() {
  try {
    const conn = await mongoose.createConnection('mongodb://root:secret@localhost:27017/proactive?authSource=admin').asPromise();
    const db = conn.db;

    const emails = ['developer@studycafe.in', 'info@studycafe.in'];

    const platformUsers = await db.collection('platformusers').find({ email: { $in: emails } }).toArray();
    console.log('[LOCAL] PlatformUsers:', platformUsers.map(u => ({ _id: u._id, email: u.email, name: u.name })));

    const tenantUsers = await db.collection('users').find({ email: { $in: emails } }).toArray();
    console.log('[LOCAL] Tenant Users:', tenantUsers.map(u => ({ _id: u._id, email: u.email, name: u.name, tenantId: u.tenantId })));

    const allOrgs = await db.collection('organizations').find({}).toArray();
    console.log('[LOCAL] All Organizations:', allOrgs.map(o => ({ _id: o._id, name: o.name, slug: o.slug, ownerId: o.ownerId })));

    await conn.close();
  } catch (err) {
    console.error('[LOCAL] Error:', err.message);
  }
}

inspectLocal().catch(console.error);

