import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../models/Organization';
import { TenantSettings } from '../models/TenantSettings';
import dotenv from 'dotenv';

dotenv.config();

const runTest = async () => {
  try {
    await connectDB();
    console.log('--- Starting Phase 5 Test ---');

    // Clean up previous runs
    await Organization.deleteOne({ slug: 'phase5-org' });
    
    // Create a dummy Organization
    const newOrg = new Organization({
      name: 'Phase 5 Org',
      slug: 'phase5-org',
      plan: { maxUsers: 5 }
    });
    const savedOrg = await newOrg.save();
    console.log('✅ Dummy Organization created with ID:', savedOrg._id);

    // Clean up TenantSettings if it existed
    await TenantSettings.deleteOne({ tenantId: savedOrg._id });

    // Create TenantSettings
    const newSettings = new TenantSettings({
      tenantId: savedOrg._id,
      clientCustomFields: [
        { label: 'GSTIN', fieldType: 'text', isRequired: true, orderIndex: 1 },
        { label: 'Client Category', fieldType: 'select', options: ['A', 'B', 'C'], isRequired: false, orderIndex: 2 }
      ],
      allowDuplicateClientNames: true,
      defaultGstPercentage: 18
    });

    const savedSettings = await newSettings.save();
    console.log('✅ TenantSettings saved successfully!');
    console.log(`   - Custom Fields count: ${savedSettings.clientCustomFields.length}`);
    console.log(`   - Allow Duplicates: ${savedSettings.allowDuplicateClientNames}`);
    
    // Retrieve TenantSettings
    const retrievedSettings = await TenantSettings.findOne({ tenantId: savedOrg._id });
    if (retrievedSettings) {
       console.log('✅ Retrieved TenantSettings successfully from database.');
    } else {
       console.error('❌ Failed to retrieve TenantSettings.');
    }

  } catch (error) {
    console.error('❌ Phase 5 Test Failed:', error);
  } finally {
    await Organization.deleteOne({ slug: 'phase5-org' });
    console.log('--- Cleanup Finished ---');
    await mongoose.disconnect();
    process.exit(0);
  }
};

runTest();
