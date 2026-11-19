import dns from 'node:dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// 1. Resolve SRV DNS reliably across environments & cloud providers
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Fallback to system DNS
}

// 2. Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config(); // fallback to current working directory .env

import { Organization } from '../src/modules/auth/schemas/organization.schema';
import { Role } from '../src/modules/roles/schemas/role.schema';
import { getDefaultRoleBlueprints } from '../src/config/permissions-catalogue';
import { RoleSeederService } from '../src/services/role-seeder.service';

// Target roles requested for all organizations
const TARGET_ROLES = [
  'Senior Manager',
  'Manager',
  'Senior Associate',
  'Associate',
  'Qualified Chartered Accountant',
  'Semi-Qualified CA',
  'Article Assistant',
  'Accountant',
  'Office Administrator',
  'HR Executive',
];

interface MigrationStats {
  totalOrganizations: number;
  organizationsProcessed: number;
  rolesAlreadyExisting: number;
  rolesSeeded: number;
  errors: number;
}

async function runRoleMigration() {
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');
  const orgFilterArg = process.argv.find((arg) => arg.startsWith('--org='));
  const targetOrgId = orgFilterArg ? orgFilterArg.split('=')[1].trim() : null;

  console.log('\n=============================================================');
  console.log('  🛡️   SAFE ORGANIZATION DEFAULT ROLES BACKFILL MIGRATION');
  console.log('=============================================================');
  console.log(` Mode:        ${isDryRun ? '🔍 DRY RUN (Preview only - NO database writes)' : '🚀 LIVE EXECUTION (Writing missing roles)'}`);
  console.log(` Target Roles: ${TARGET_ROLES.length} professional practice roles:`);
  TARGET_ROLES.forEach((r, idx) => console.log(`   ${idx + 1}. ${r}`));
  console.log('-------------------------------------------------------------');
  console.log(' [Safeguards Active]');
  console.log('  ✅ Non-destructive: Existing roles are NEVER deleted or overwritten');
  console.log('  ✅ Zero user impact: No user accounts, sessions, or role IDs modified');
  console.log('  ✅ Idempotent: Can be run multiple times safely without duplicates');
  console.log('=============================================================\n');

  // Resolve MongoDB URI
  const mongoUri =
    process.env.MONGO_URI ||
    'mongodb://root:secret@localhost:27017/proactive?authSource=admin';

  console.log('Connecting to MongoDB...');
  try {
    await mongoose.connect(mongoUri);
    console.log(`✅ Connected successfully to: ${mongoose.connection.name || 'database'}\n`);
  } catch (err: any) {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  const stats: MigrationStats = {
    totalOrganizations: 0,
    organizationsProcessed: 0,
    rolesAlreadyExisting: 0,
    rolesSeeded: 0,
    errors: 0,
  };

  try {
    // Query organizations
    const query: any = {};
    if (targetOrgId) {
      query._id = new mongoose.Types.ObjectId(targetOrgId);
      console.log(`Filtering for single organization ID: ${targetOrgId}\n`);
    }

    const organizations = await Organization.find(query).sort({ createdAt: 1 });
    stats.totalOrganizations = organizations.length;

    if (organizations.length === 0) {
      console.log('⚠️ No organizations found matching query. Nothing to migrate.');
      await mongoose.disconnect();
      return;
    }

    console.log(`Found ${organizations.length} organization(s) to evaluate.\n`);

    const blueprints = getDefaultRoleBlueprints();
    const blueprintMap = new Map(blueprints.map((bp) => [bp.name, bp]));

    for (let i = 0; i < organizations.length; i++) {
      const org = organizations[i];
      const orgName = org.name || org.company || 'Unnamed Organization';
      const orgIdStr = org._id.toString();

      console.log(`[${i + 1}/${organizations.length}] 🏢 Organization: "${orgName}" (ID: ${orgIdStr})`);

      try {
        // Find all existing roles for this organization
        const existingRoles = await Role.find({ tenantId: org._id }).setOptions({
          skipTenantPlugin: true,
        });

        const existingRoleNames = new Set(existingRoles.map((r) => r.name.trim()));
        const missingRoles: string[] = [];
        const existingCount: string[] = [];

        for (const targetRole of TARGET_ROLES) {
          if (existingRoleNames.has(targetRole)) {
            existingCount.push(targetRole);
            stats.rolesAlreadyExisting++;
          } else {
            missingRoles.push(targetRole);
          }
        }

        console.log(`    ℹ️  Existing target roles: ${existingCount.length}/${TARGET_ROLES.length}`);
        if (existingCount.length > 0) {
          console.log(`       Preserved: ${existingCount.join(', ')}`);
        }

        if (missingRoles.length === 0) {
          console.log(`    ✅ All 10 roles are already present. No action needed.\n`);
        } else {
          console.log(`    ⚡ Missing roles to seed (${missingRoles.length}): ${missingRoles.join(', ')}`);

          if (isDryRun) {
            console.log(`    🔍 [DRY RUN] Would seed ${missingRoles.length} new roles.\n`);
            stats.rolesSeeded += missingRoles.length;
          } else {
            // Live execution: seed missing roles safely using blueprints
            for (const roleName of missingRoles) {
              const bp = blueprintMap.get(roleName);
              if (!bp) {
                console.warn(`    ⚠️ No blueprint found for role: ${roleName}`);
                continue;
              }

              await Role.create({
                tenantId: org._id,
                name: bp.name,
                description: bp.description,
                isSuperAdmin: bp.isSuperAdmin,
                isSystemDefault: bp.isSystemDefault,
                permissions: bp.permissions,
              });

              stats.rolesSeeded++;
            }

            // Also backfill any missing system defaults (Super Admin / Admin / Staff)
            await RoleSeederService.seedDefaultRolesForTenant(org._id);

            console.log(`    ✅ Successfully seeded ${missingRoles.length} roles.\n`);
          }
        }

        stats.organizationsProcessed++;
      } catch (orgErr: any) {
        stats.errors++;
        console.error(`    ❌ Error processing org "${orgName}":`, orgErr.message, '\n');
      }
    }

    console.log('=============================================================');
    console.log('  🏁   MIGRATION COMPLETED');
    console.log('=============================================================');
    console.log(` Total Organizations Evaluated:   ${stats.totalOrganizations}`);
    console.log(` Organizations Processed Cleanly: ${stats.organizationsProcessed}`);
    console.log(` Target Roles Already Present:    ${stats.rolesAlreadyExisting}`);
    console.log(` Target Roles Seeded:             ${stats.rolesSeeded} ${isDryRun ? '(simulated)' : '(created in DB)'}`);
    console.log(` Errors Encountered:              ${stats.errors}`);
    console.log('=============================================================\n');
  } catch (err: any) {
    console.error('Fatal migration error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

// Execute
runRoleMigration().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
