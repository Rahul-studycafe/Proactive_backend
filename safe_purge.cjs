const dns = require('node:dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');

const TARGET_EMAILS = ['developer@studycafe.in', 'info@studycafe.in'];

async function purgeFromAtlas() {
  console.log('\n========================================');
  console.log(' PURGING FROM ATLAS MONGODB');
  console.log('========================================');
  const uri = 'mongodb+srv://developer_db_user:qFncLT7ZLOWjBKbJ@cluster0.hgo8nya.mongodb.net/proactive?retryWrites=true&w=majority';
  const conn = await mongoose.createConnection(uri).asPromise();
  const db = conn.db;

  // 1. Locate PlatformUsers
  const platformUsers = await db.collection('platformusers').find({
    email: { $in: TARGET_EMAILS }
  }).toArray();
  const puIds = platformUsers.map(u => u._id);
  console.log('Found PlatformUsers:', platformUsers.map(u => ({ id: u._id, email: u.email, name: u.name })));

  // 2. Locate Tenant Users
  const tenantUsers = await db.collection('users').find({
    email: { $in: TARGET_EMAILS }
  }).toArray();
  console.log('Found Tenant Users:', tenantUsers.map(u => ({ id: u._id, email: u.email, tenantId: u.tenantId })));

  // 3. Locate Orgs owned by these users
  const userTenantIds = tenantUsers.map(u => u.tenantId).filter(Boolean);
  const targetOrgs = await db.collection('organizations').find({
    $or: [
      { ownerId: { $in: puIds } },
      { _id: { $in: userTenantIds } }
    ]
  }).toArray();

  const orgIds = targetOrgs.map(o => o._id);
  console.log('Target Organizations to delete:', targetOrgs.map(o => ({ id: o._id, name: o.name })));

  // Safety check: ensure Rahul and co is NEVER targeted
  const containsProtected = targetOrgs.some(o => /rahul and co/i.test(o.name));
  if (containsProtected) {
    throw new Error('CRITICAL SAFETY CHECK FAILED: "Rahul and co" matched target organizations! Aborting.');
  }

  // 4. Delete tenant-scoped collections
  if (orgIds.length > 0) {
    const colls = await db.listCollections().toArray();
    for (const c of colls) {
      if (c.name.startsWith('system.')) continue;
      try {
        const res = await db.collection(c.name).deleteMany({ tenantId: { $in: orgIds } });
        if (res.deletedCount > 0) {
          console.log(`Deleted ${res.deletedCount} documents from collection "${c.name}"`);
        }
      } catch (err) {
        // collection might not have tenantId field
      }
    }

    // Delete the organizations
    const orgDel = await db.collection('organizations').deleteMany({ _id: { $in: orgIds } });
    console.log(`Deleted ${orgDel.deletedCount} organization(s) from "organizations"`);
  }

  // 5. Delete platform users, tenant users, and SSO tickets
  const puDel = await db.collection('platformusers').deleteMany({ email: { $in: TARGET_EMAILS } });
  console.log(`Deleted ${puDel.deletedCount} platform user(s)`);

  const tuDel = await db.collection('users').deleteMany({ email: { $in: TARGET_EMAILS } });
  console.log(`Deleted ${tuDel.deletedCount} tenant user(s)`);

  const tktDel = await db.collection('ssotickets').deleteMany({ email: { $in: TARGET_EMAILS } });
  console.log(`Deleted ${tktDel.deletedCount} sso ticket(s)`);

  // 6. Verify remaining state
  const remainingOrgs = await db.collection('organizations').find({}).toArray();
  console.log('Remaining Organizations in Atlas:', remainingOrgs.map(o => ({ id: o._id, name: o.name })));

  const remainingUsers = await db.collection('platformusers').find({}).toArray();
  console.log('Remaining PlatformUsers in Atlas:', remainingUsers.map(u => ({ id: u._id, email: u.email })));

  await conn.close();
}

async function purgeFromLocal() {
  console.log('\n========================================');
  console.log(' PURGING FROM LOCAL MONGODB (developer@studycafe.in)');
  console.log('========================================');
  try {
    const conn = await mongoose.createConnection('mongodb://root:secret@localhost:27017/proactive?authSource=admin').asPromise();
    const db = conn.db;

    const emails = ['developer@studycafe.in'];

    const platformUsers = await db.collection('platformusers').find({ email: { $in: emails } }).toArray();
    const puIds = platformUsers.map(u => u._id);

    const targetOrgs = await db.collection('organizations').find({
      $or: [
        { ownerId: { $in: puIds } },
        { name: /chauhan's practice/i }
      ]
    }).toArray();

    // Verify Rahul and co or PD Gupta are not touched
    const safeTargetOrgs = targetOrgs.filter(o => !/rahul and co/i.test(o.name) && !/pd gupta/i.test(o.name) && !/deepak gupta/i.test(o.name));
    const orgIds = safeTargetOrgs.map(o => o._id);
    console.log('Local target organizations to delete:', safeTargetOrgs.map(o => ({ id: o._id, name: o.name })));

    if (orgIds.length > 0) {
      const colls = await db.listCollections().toArray();
      for (const c of colls) {
        if (c.name.startsWith('system.')) continue;
        try {
          const res = await db.collection(c.name).deleteMany({ tenantId: { $in: orgIds } });
          if (res.deletedCount > 0) {
            console.log(`[Local] Deleted ${res.deletedCount} docs from "${c.name}"`);
          }
        } catch {}
      }
      await db.collection('organizations').deleteMany({ _id: { $in: orgIds } });
      console.log(`[Local] Deleted ${orgIds.length} organization(s)`);
    }

    await db.collection('platformusers').deleteMany({ email: { $in: emails } });
    await db.collection('users').deleteMany({ email: { $in: emails } });
    await db.collection('ssotickets').deleteMany({ email: { $in: emails } });
    console.log('[Local] Purged developer@studycafe.in');

    const remainingOrgs = await db.collection('organizations').find({}).toArray();
    console.log('[Local] Remaining Orgs:', remainingOrgs.map(o => ({ id: o._id, name: o.name })));

    await conn.close();
  } catch (err) {
    console.error('[Local] Error:', err.message);
  }
}

async function main() {
  await purgeFromAtlas();
  await purgeFromLocal();
  console.log('\n=== PURGE COMPLETED SUCCESSFULLY ===\n');
}

main().catch(console.error);

