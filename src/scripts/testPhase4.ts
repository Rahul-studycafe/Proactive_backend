import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../models/Organization';
import { BillingEntity } from '../models/BillingEntity';
import dotenv from 'dotenv';

dotenv.config();

const runTest = async () => {
  try {
    await connectDB();
    console.log('--- Starting Phase 4 Test ---');

    // Clean up if it already exists
    await Organization.deleteOne({ slug: 'test-org-slug' });

    // Save Organization
    const newOrg = new Organization({
      name: 'Test Organization',
      slug: 'test-org-slug',
      email: 'test@example.com',
      plan: { type: 'free', maxUsers: 5 }
    });
    
    const savedOrg = await newOrg.save();
    console.log('✅ Organization Saved Successfully:', savedOrg.name);

    // Save Billing Entity
    const newBilling = new BillingEntity({
      tenantId: savedOrg._id,
      name: 'Test Billing LLC',
      gstin: '22AAAAA0000A1Z5',
      address: '123 Tech Street'
    });

    const savedBilling = await newBilling.save();
    console.log('✅ BillingEntity Saved Successfully:', savedBilling.name);

    // Retrieve Data
    const retrievedOrg = await Organization.findOne({ slug: 'test-org-slug' });
    if (retrievedOrg) {
      console.log('✅ Retrieved Organization:', retrievedOrg.slug);
    } else {
      console.error('❌ Failed to retrieve Organization');
    }

    const retrievedBilling = await BillingEntity.findOne({ tenantId: savedOrg._id });
    if (retrievedBilling) {
      console.log('✅ Retrieved BillingEntity matching tenantId:', retrievedBilling.tenantId);
    } else {
      console.error('❌ Failed to retrieve BillingEntity');
    }

  } catch (error) {
    console.error('❌ Test Failed:', error);
  } finally {
    // Cleanup the database to keep it clean
    await Organization.deleteOne({ slug: 'test-org-slug' });
    await BillingEntity.deleteMany({ name: 'Test Billing LLC' });
    console.log('--- Cleanup Finished ---');
    await mongoose.disconnect();
    process.exit(0);
  }
};

runTest();
