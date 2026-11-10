import mongoose from 'mongoose';
import connectDB from '../src/config/db';
import { TenantConfigurationService } from '../src/services/tenant-configuration.service';
import { TenantConfiguration } from '../src/models/TenantConfiguration';
import { Organization } from '../src/modules/auth/schemas';
import { PhysicalDocument } from '../src/models/PhysicalDocument';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function runVerification() {
  console.log('Connecting via connectDB()...');
  await connectDB();
  console.log('Connected to MongoDB successfully.');

  const org = await Organization.findOne({ isDeleted: { $ne: true } });
  if (!org) {
    console.error('No active organization found to verify with.');
    process.exit(1);
  }

  const tenantId = org._id.toString();
  console.log(`Verifying Tenant Configuration System for Organization: "${org.name}" (${tenantId})\n`);

  // 1. Get Categories
  console.log('1. Testing getCategories...');
  const categories = await TenantConfigurationService.getCategories(tenantId);
  console.log(`   Found ${categories.length} categories.`);
  if (categories.length < 11) {
    throw new Error(`Expected at least 11 categories, got ${categories.length}`);
  }
  const docTypeCat = categories.find((c) => c.key === 'document_types');
  console.log(`   document_types: ${docTypeCat?.activeCount} active options.`);

  // 2. Get Options for category
  console.log('2. Testing getOptionsForCategory (document_types)...');
  const docTypes = await TenantConfigurationService.getOptionsForCategory(tenantId, 'document_types', false);
  console.log(`   Active document types: ${docTypes.map((d) => d.label).join(', ')}`);
  if (docTypes.length === 0) {
    throw new Error('Expected at least 1 active document type');
  }

  // 3. Add Custom Option
  console.log('3. Testing addOption (custom option)...');
  const customLabel = 'E2E Test Working Papers ' + Date.now();
  const created = await TenantConfigurationService.addOption(tenantId, undefined, 'document_types', {
    label: customLabel,
    description: 'Created during automated end-to-end verification',
    color: '#3B82F6',
  });
  console.log(`   Successfully created option: "${created.label}" (ID: ${created._id})`);

  // 4. Test Idempotency
  console.log('4. Testing Idempotent addOption...');
  const duplicate = await TenantConfigurationService.addOption(tenantId, undefined, 'document_types', {
    label: customLabel,
  });
  if (duplicate._id.toString() !== created._id.toString()) {
    throw new Error('Idempotent addOption failed: created duplicate ID instead of returning existing');
  }
  console.log('   Idempotency verified: duplicate creation prevented.');

  // 5. Test Update
  console.log('5. Testing updateOption...');
  const updated = await TenantConfigurationService.updateOption(tenantId, undefined, created._id.toString(), {
    description: 'Updated description for E2E verification',
  });
  if (updated.description !== 'Updated description for E2E verification') {
    throw new Error('updateOption did not persist updated description');
  }
  console.log('   Update verified successfully.');

  // 6. Test Toggle Status
  console.log('6. Testing toggleOptionStatus...');
  const toggledOff = await TenantConfigurationService.toggleOptionStatus(tenantId, created._id.toString());
  if (toggledOff.isActive !== false) {
    throw new Error('toggleOptionStatus failed to deactivate option');
  }
  console.log('   Option deactivated successfully.');

  const toggledOn = await TenantConfigurationService.toggleOptionStatus(tenantId, created._id.toString());
  if (toggledOn.isActive !== true) {
    throw new Error('toggleOptionStatus failed to reactivate option');
  }
  console.log('   Option reactivated successfully.');

  // 7. Test Hard Delete for Unused Option
  console.log('7. Testing hard delete on unreferenced option...');
  const deleteResult = await TenantConfigurationService.deleteOption(tenantId, created._id.toString());
  if (deleteResult.deactivated) {
    throw new Error('Expected hard delete for unreferenced option');
  }
  console.log(`   Hard delete verified: ${deleteResult.message}`);

  // 8. Test Reference-Safe Soft Deactivation on Historical Record
  console.log('8. Testing reference-safe deactivation for in-use option...');
  // Find a document type actually used in PhysicalDocument
  const existingDoc = await PhysicalDocument.findOne({ tenantId: org._id, isDeleted: { $ne: true } });
  if (existingDoc && existingDoc.documentType) {
    const configOption = await TenantConfiguration.findOne({
      tenantId: org._id,
      categoryKey: 'document_types',
      $or: [{ value: existingDoc.documentType }, { label: existingDoc.documentType }],
    });

    if (configOption) {
      console.log(`   Found in-use option: "${configOption.label}" used in PhysicalDocument ${existingDoc._id}`);
      const safeResult = await TenantConfigurationService.deleteOption(tenantId, configOption._id.toString());
      if (!safeResult.deactivated) {
        throw new Error('Expected deactivated=true for in-use option');
      }
      console.log(`   Reference-safety verified: ${safeResult.message}`);

      // Reactivate it to preserve state
      await TenantConfiguration.updateOne({ _id: configOption._id }, { $set: { isActive: true, isDeleted: false } });
      console.log('   Reactivated historical option to restore original state.');
    }
  } else {
    console.log('   No existing PhysicalDocument found to test cross-collection reference; skipping reference test.');
  }

  console.log('\n=============================================');
  console.log('ALL E2E CONFIGURATION TESTS PASSED PERFECTLY!');
  console.log('=============================================\n');

  await mongoose.disconnect();
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
