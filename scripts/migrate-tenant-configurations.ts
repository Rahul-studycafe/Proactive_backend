import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../src/config/db';
import { Organization } from '../src/modules/auth/schemas';
import { TenantConfigurationService } from '../src/services/tenant-configuration.service';
import { TenantConfiguration } from '../src/models/TenantConfiguration';
import { PhysicalDocument } from '../src/models/PhysicalDocument';
import { DSC } from '../src/models/DSC';
import { Receipt } from '../src/models/Receipt';
import { Expense } from '../src/models/Expense';
import { Client } from '../src/modules/clients/schemas/client.schema';

async function migrate() {
  console.log('--- Starting Tenant Configuration Migration ---');
  await connectDB();

  const organizations = await Organization.find({}).select('_id name');
  console.log(`Found ${organizations.length} organizations to process.`);

  let totalSeeded = 0;
  let totalBackfilled = 0;

  for (const org of organizations) {
    console.log(`Processing org: ${org.name} (${org._id})...`);
    
    // 1. Seed standard defaults
    const seededCount = await TenantConfigurationService.seedDefaultsForTenant(org._id);
    totalSeeded += seededCount;

    // 2. Backfill existing custom values from PhysicalDocument
    const docTypes = await PhysicalDocument.distinct('documentType', { tenantId: org._id });
    for (const dt of docTypes) {
      if (dt && typeof dt === 'string' && dt.trim()) {
        const added = await TenantConfigurationService.addOption(org._id, undefined, 'document_types', { label: dt.trim() });
        if (added) totalBackfilled++;
      }
    }

    const docLocations = await PhysicalDocument.distinct('location', { tenantId: org._id });
    for (const loc of docLocations) {
      if (loc && typeof loc === 'string' && loc.trim()) {
        const added = await TenantConfigurationService.addOption(org._id, undefined, 'office_storage_locations', { label: loc.trim() });
        if (added) totalBackfilled++;
      }
    }

    // 3. Backfill from DSC
    const dscLocations = await DSC.distinct('physicalLocation', { tenantId: org._id });
    for (const loc of dscLocations) {
      if (loc && typeof loc === 'string' && loc.trim()) {
        const added = await TenantConfigurationService.addOption(org._id, undefined, 'office_storage_locations', { label: loc.trim() });
        if (added) totalBackfilled++;
      }
    }

    const dscTokens = await DSC.distinct('tokenType', { tenantId: org._id });
    for (const tt of dscTokens) {
      if (tt && typeof tt === 'string' && tt.trim()) {
        const added = await TenantConfigurationService.addOption(org._id, undefined, 'usb_token_types', { label: tt.trim() });
        if (added) totalBackfilled++;
      }
    }

    const dscCas = await DSC.distinct('issuingAuthority', { tenantId: org._id });
    for (const ca of dscCas) {
      if (ca && typeof ca === 'string' && ca.trim()) {
        const added = await TenantConfigurationService.addOption(org._id, undefined, 'issuing_authorities', { label: ca.trim() });
        if (added) totalBackfilled++;
      }
    }

    // 4. Backfill from Receipt & Expense
    const rctModes = await Receipt.distinct('paymentMode', { tenantId: org._id });
    for (const pm of rctModes) {
      if (pm && typeof pm === 'string' && pm.trim()) {
        const added = await TenantConfigurationService.addOption(org._id, undefined, 'payment_modes', { label: pm.trim() });
        if (added) totalBackfilled++;
      }
    }

    const expModes = await Expense.distinct('paymentMode', { tenantId: org._id });
    for (const pm of expModes) {
      if (pm && typeof pm === 'string' && pm.trim()) {
        const added = await TenantConfigurationService.addOption(org._id, undefined, 'payment_modes', { label: pm.trim() });
        if (added) totalBackfilled++;
      }
    }

    // 5. Backfill from Client entityTypes and tags
    const clientEntityTypes = await Client.distinct('entityType', { tenantId: org._id });
    for (const et of clientEntityTypes) {
      if (et && typeof et === 'string' && et.trim()) {
        const added = await TenantConfigurationService.addOption(org._id, undefined, 'client_entity_types', { label: et.trim() });
        if (added) totalBackfilled++;
      }
    }

    const clientDocs = await Client.find({ tenantId: org._id }).select('tags');
    const tagsSet = new Set<string>();
    clientDocs.forEach((c) => {
      (c.tags || []).forEach((t: string) => {
        if (t && t.trim()) tagsSet.add(t.trim());
      });
    });

    for (const tag of tagsSet) {
      const added = await TenantConfigurationService.addOption(org._id, undefined, 'tags', { label: tag });
      if (added) totalBackfilled++;
    }
  }

  const finalCount = await TenantConfiguration.countDocuments({ isDeleted: false });
  console.log(`\nMigration completed successfully!`);
  console.log(`Default options seeded: ${totalSeeded}`);
  console.log(`Legacy options backfilled: ${totalBackfilled}`);
  console.log(`Total active configuration records: ${finalCount}`);

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

