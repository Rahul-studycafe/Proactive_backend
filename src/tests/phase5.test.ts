import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { TenantSettings } from '../modules/masters/schemas';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 5: TenantSettings Model', () => {
  let orgId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: 'phase5-org' });
    
    const newOrg = new Organization({
      name: 'Phase 5 Org',
      slug: 'phase5-org',
      plan: { maxUsers: 5 }
    });
    const savedOrg = await newOrg.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    await TenantSettings.deleteOne({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: 'phase5-org' });
    await TenantSettings.deleteOne({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should save TenantSettings successfully', async () => {
    const newSettings = new TenantSettings({
      tenantId: orgId,
      clientCustomFields: [
        { label: 'GSTIN', fieldType: 'text', isRequired: true, orderIndex: 1 },
        { label: 'Client Category', fieldType: 'select', options: ['A', 'B', 'C'], isRequired: false, orderIndex: 2 }
      ],
      allowDuplicateClientNames: true,
      defaultGstPercentage: 18
    });

    const savedSettings = await newSettings.save();
    expect(savedSettings._id).toBeDefined();
    expect(savedSettings.clientCustomFields.length).toBe(2);
    expect(savedSettings.allowDuplicateClientNames).toBe(true);

    const retrievedSettings = await TenantSettings.findOne({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    expect(retrievedSettings).not.toBeNull();
  });
});
