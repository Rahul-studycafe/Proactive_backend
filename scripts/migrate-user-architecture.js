const mongoose = require('mongoose');

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect('mongodb://root:secret@localhost:27017/proactive?authSource=admin');
  const db = mongoose.connection.db;

  console.log('\n--- STEP 1: Inspect Indexes on "users" collection ---');
  const userIndexes = await db.collection('users').indexes();
  console.log('Current user indexes:', userIndexes.map(i => i.name));

  const emailIndex = userIndexes.find(i => i.name === 'email_1');
  if (emailIndex) {
    console.log('Dropping global email_1 index on users...');
    await db.collection('users').dropIndex('email_1');
    console.log('Global email_1 index dropped.');
  }

  console.log('\n--- STEP 2: Ensuring Roles in Organizations ---');
  const orgs = await db.collection('organizations').find({}).toArray();
  for (const org of orgs) {
    console.log(`Checking org: ${org.name} (${org._id})`);

    // Ensure Super Admin role exists
    let superAdminRole = await db.collection('roles').findOne({
      tenantId: org._id,
      isSuperAdmin: true
    });
    if (!superAdminRole) {
      console.log(`Creating Super Admin role for ${org.name}...`);
      const insertResult = await db.collection('roles').insertOne({
        tenantId: org._id,
        name: 'Super Admin',
        description: 'System generated super admin role',
        isSuperAdmin: true,
        permissions: {},
        createdAt: new Date(),
        updatedAt: new Date()
      });
      superAdminRole = { _id: insertResult.insertedId };
    }

    // Ensure Staff / Accountant role exists
    let staffRole = await db.collection('roles').findOne({
      tenantId: org._id,
      name: { $in: ['Staff', 'Accountant', 'Employee'] },
      isSuperAdmin: false
    });
    if (!staffRole) {
      console.log(`Creating Staff role for ${org.name}...`);
      const insertStaff = await db.collection('roles').insertOne({
        tenantId: org._id,
        name: 'Staff',
        description: 'Standard practice team member',
        isSuperAdmin: false,
        permissions: {
          client: { view: { allowed: true, scope: 'everything' } },
          task: { view: { allowed: true, scope: 'assigned_only' }, edit: { allowed: true, scope: 'assigned_only' } }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });
      staffRole = { _id: insertStaff.insertedId };
    }

    console.log(`\n--- STEP 3: Establishing Platform User & Owner for ${org.name} ---`);
    let ownerUser = null;
    if (org.slug === 'rahul-and-co') {
      ownerUser = await db.collection('users').findOne({ tenantId: org._id, email: 'rahulchauhah50@gmail.com' });
    } else if (org.slug === 'pd-gupta') {
      ownerUser = await db.collection('users').findOne({ tenantId: org._id, email: 'info@studycafe.in' });
    } else {
      ownerUser = await db.collection('users').findOne({ tenantId: org._id });
    }

    if (ownerUser) {
      console.log(`Identified Owner for ${org.name}: ${ownerUser.name} (${ownerUser.email})`);

      // Check if PlatformUser already exists
      let platformUser = await db.collection('platformusers').findOne({ email: ownerUser.email.toLowerCase() });
      if (!platformUser) {
        console.log(`Creating PlatformUser record for ${ownerUser.email}...`);
        const pResult = await db.collection('platformusers').insertOne({
          name: ownerUser.name,
          email: ownerUser.email.toLowerCase(),
          mobile: ownerUser.mobile || '',
          password: ownerUser.password, // preserve existing hashed password
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
          status: 'active',
          tokenVersion: ownerUser.tokenVersion || 0,
          createdAt: ownerUser.createdAt || new Date(),
          updatedAt: new Date()
        });
        platformUser = { _id: pResult.insertedId };
      }

      // Bind ownerId on Organization
      await db.collection('organizations').updateOne(
        { _id: org._id },
        { $set: { ownerId: platformUser._id } }
      );
      console.log(`Updated Organization ${org.name} with ownerId: ${platformUser._id}`);

      // Mark owner User record with isOwner: true, roleId: superAdminRole._id, platformUserId: platformUser._id
      await db.collection('users').updateOne(
        { _id: ownerUser._id },
        {
          $set: {
            isOwner: true,
            platformUserId: platformUser._id,
            roleId: superAdminRole._id,
            invitationStatus: 'active'
          }
        }
      );
      console.log(`Updated owner User ${ownerUser.name} with isOwner: true, platformUserId: ${platformUser._id}`);

      // Step 4: Reclassify other staff members in this organization
      const staffUpdateResult = await db.collection('users').updateMany(
        { tenantId: org._id, _id: { $ne: ownerUser._id } },
        {
          $set: {
            isOwner: false,
            roleId: staffRole._id,
            invitationStatus: 'active'
          }
        }
      );
      console.log(`Reclassified ${staffUpdateResult.modifiedCount} staff members in ${org.name} to role: Staff`);
    } else {
      console.warn(`WARNING: No users found for organization ${org.name}`);
    }
  }

  // Check orphaned users where tenantId does not match any organization
  const validOrgIds = orgs.map(o => o._id);
  const orphanedUsers = await db.collection('users').find({ tenantId: { $nin: validOrgIds } }).toArray();
  if (orphanedUsers.length > 0) {
    console.log(`Found ${orphanedUsers.length} orphaned test users. Cleaning up...`);
    await db.collection('users').deleteMany({ tenantId: { $nin: validOrgIds } });
    console.log('Orphaned test users deleted.');
  }

  // Create new compound indexes on users collection
  console.log('\n--- STEP 4: Creating new scoped indexes on users ---');
  await db.collection('users').createIndex({ tenantId: 1, username: 1 }, { unique: true });
  await db.collection('users').createIndex({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
  await db.collection('users').createIndex({ tenantId: 1, isActive: 1 });
  await db.collection('users').createIndex({ tenantId: 1, isOwner: 1 });
  await db.collection('platformusers').createIndex({ email: 1 }, { unique: true });

  console.log('\nMigration completed successfully!');
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

