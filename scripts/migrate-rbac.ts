import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Organization, User } from '../src/modules/auth/schemas';
import { Role } from '../src/modules/roles/schemas';
import { RoleSeederService } from '../src/services/role-seeder.service';

async function runRbacMigration() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://root:secret@localhost:27017/proactive?authSource=admin';
  console.log('Connecting to database...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  const organizations = await Organization.find();
  console.log(`Found ${organizations.length} organizations to process.`);

  let totalTenantsSeeded = 0;
  let totalUsersUpdated = 0;

  for (const org of organizations) {
    console.log(`\nProcessing organization: ${org.name} (${org._id})`);
    
    // Seed the 4 default roles (Super Admin, Admin, Accountant, Staff)
    const seededRoles = await RoleSeederService.seedDefaultRolesForTenant(org._id);
    totalTenantsSeeded++;
    console.log(`  Seeded/Verified default roles: Super Admin, Admin, Accountant, Staff.`);

    // Check users belonging to this tenant
    const users = await User.find({ tenantId: org._id }).setOptions({ skipTenantPlugin: true });
    for (const user of users) {
      let modified = false;

      if (user.isOwner) {
        // Practice Owner must always be assigned Super Admin
        if (!user.roleId || user.roleId.toString() !== seededRoles.superAdminRole._id.toString()) {
          user.roleId = seededRoles.superAdminRole._id as any;
          modified = true;
        }
        if (!user.roleIds || user.roleIds.length === 0 || !user.roleIds.some((id: any) => id.toString() === seededRoles.superAdminRole._id.toString())) {
          user.roleIds = [seededRoles.superAdminRole._id as any];
          modified = true;
        }
      } else {
        // Non-owner staff users: ensure roleId and roleIds are set
        if (!user.roleId) {
          // Default to Staff role if unset
          user.roleId = seededRoles.staffRole._id as any;
          modified = true;
        }
        if (!user.roleIds || user.roleIds.length === 0) {
          user.roleIds = [user.roleId];
          modified = true;
        }
      }

      if (modified) {
        await user.save();
        totalUsersUpdated++;
        console.log(`  Updated user ${user.name} (${user.email || user.username}) with roles: ${user.roleIds.join(', ')}`);
      }
    }
  }

  console.log('\n=======================================');
  console.log(`RBAC Migration Summary:`);
  console.log(`Tenants seeded/verified: ${totalTenantsSeeded}`);
  console.log(`Users updated with canonical roleIds: ${totalUsersUpdated}`);
  console.log('=======================================\n');

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

runRbacMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

