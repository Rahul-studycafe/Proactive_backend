import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../models/Organization';
import { BillingEntity } from '../models/BillingEntity';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 4: Organization and Billing Models', () => {
  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: 'test-org-slug' });
    await BillingEntity.deleteMany({ gstin: '22AAAAA0000A1Z5' }).setOptions({ skipTenantPlugin: true });
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: 'test-org-slug' });
    await BillingEntity.deleteMany({ gstin: '22AAAAA0000A1Z5' }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should save Organization and BillingEntity successfully', async () => {
    const newOrg = new Organization({
      name: 'Test Organization',
      slug: 'test-org-slug',
      email: 'test@example.com',
      plan: { maxUsers: 5 }
    });
    
    const savedOrg = await newOrg.save();
    expect(savedOrg._id).toBeDefined();

    const newBilling = new BillingEntity({
      tenantId: savedOrg._id,
      name: 'Test Billing LLC', // Should be overwritten by hook to 'Test Organization'
      gstin: '22AAAAA0000A1Z5'
    });

    const savedBilling = await newBilling.save();
    expect(savedBilling._id).toBeDefined();
    
    // BillingEntity validate hook syncs name from Organization
    expect(savedBilling.name).toBe('Test Organization');
  });
});
