const dns = require('node:dns');
const path = require('path');
const fs = require('fs');

// 1. Resolve SRV DNS reliably across environments & cloud providers
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Fallback to system DNS
}

// 2. Load environment variables
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const mongoose = require('mongoose');

// Determine whether to load from dist (compiled) or src (via ts-node)
let Organization, Role, getDefaultRoleBlueprints, RoleSeederService;

if (fs.existsSync(path.resolve(__dirname, '../dist/modules/auth/schemas/organization.schema.js'))) {
  Organization = require('../dist/modules/auth/schemas/organization.schema').Organization;
  Role = require('../dist/modules/roles/schemas/role.schema').Role;
  getDefaultRoleBlueprints = require('../dist/config/permissions-catalogue').getDefaultRoleBlueprints;
  RoleSeederService = require('../dist/services/role-seeder.service').RoleSeederService;
} else {
  // Try dynamic registration of ts-node if dist doesn't exist
  try {
    require('ts-node/register/transpile-only');
    Organization = require('../src/modules/auth/schemas/organization.schema').Organization;
    Role = require('../src/modules/roles/schemas/role.schema').Role;
    getDefaultRoleBlueprints = require('../src/config/permissions-catalogue').getDefaultRoleBlueprints;
    RoleSeederService = require('../src/services/role-seeder.service').RoleSeederService;
  } catch (e) {
    console.error('Could not load modules. Please run "npm run build" first or use ts-node.');
    process.exit(1);
  }
}

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

  const mongoUri =
    process.env.MONGO_URI ||
    'mongodb://root:secret@localhost:27017/proactive?authSource=admin';

  console.log('Connecting to MongoDB...');
  try {
    await mongoose.connect(mongoUri);
    console.log(`✅ Connected successfully to: ${mongoose.connection.name || 'database'}\n`);
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  const stats = {
    totalOrganizations: 0,
    organizationsProcessed: 0,
    rolesAlreadyExisting: 0,
    rolesSeeded: 0,
    errors: 0,
  };

  try {
    const query = {};
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
        const existingRoles = await Role.find({ tenantId: org._id }).setOptions({
          skipTenantPlugin: true,
        });

        const existingRoleNames = new Set(existingRoles.map((r) => r.name.trim()));
        const missingRoles = [];
        const existingCount = [];

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

            // Backfill any missing system defaults safely
            await RoleSeederService.seedDefaultRolesForTenant(org._id);

            console.log(`    ✅ Successfully seeded ${missingRoles.length} roles.\n`);
          }
        }

        stats.organizationsProcessed++;
      } catch (orgErr) {
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
  } catch (err) {
    console.error('Fatal migration error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

runRoleMigration().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
