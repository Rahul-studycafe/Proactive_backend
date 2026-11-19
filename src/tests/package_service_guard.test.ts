import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Service } from '../modules/services/schemas';
import { Package } from '../modules/services/schemas/package.schema';
import dotenv from 'dotenv';

dotenv.config();

describe('Package & Service Deletion Dependency Guards', () => {
  let orgId: mongoose.Types.ObjectId;
  let adminToken: string;
  let serviceAId: string;
  let serviceBId: string;
  let packageId: string;

  const orgSlug = 'guard-test-org';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'guardadmin' }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'Guard Test Org', slug: orgSlug });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    const superRole = new Role({ tenantId: orgId, name: 'Super Admin', isSuperAdmin: true, permissions: {} });
    await superRole.save();

    const adminUser = new User({ tenantId: orgId, name: 'Guard Admin', username: 'guardadmin', password: 'password', roleId: superRole._id });
    await adminUser.save();

    const loginRes = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'guardadmin', password: 'password' });
    adminToken = loginRes.body.data.accessToken;

    // Create Service A and Service B
    const sARes = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Service A - Accounting', frequency: { type: 'monthly' } });
    serviceAId = sARes.body.data._id;

    const sBRes = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Service B - Tax Filing', frequency: { type: 'monthly' } });
    serviceBId = sBRes.body.data._id;

    // Create Package bundling Service A and Service B
    const pkgRes = await request(app)
      .post('/api/v1/services/packages')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Full Compliance Bundle',
        frequency: 'monthly',
        defaultBillingAmount: 15000,
        gstPercentage: 18,
        serviceIds: [serviceAId, serviceBId]
      });
    packageId = pkgRes.body.data._id;
  });

  afterAll(async () => {
    await Service.deleteMany({ tenantId: orgId });
    await Package.deleteMany({ tenantId: orgId });
    await User.deleteMany({ tenantId: orgId });
    await Role.deleteMany({ tenantId: orgId });
    await Organization.deleteOne({ _id: orgId });
  });

  it('should block deletion of Service A because it is part of a package', async () => {
    const res = await request(app)
      .delete(`/api/v1/services/${serviceAId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('bundled inside 1 package(s)');
    expect(res.body.message).toContain('Full Compliance Bundle');
  });

  it('should list packagesCount for services in getServices', async () => {
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const serviceA = res.body.data.find((s: any) => s._id === serviceAId);
    expect(serviceA).toBeDefined();
    expect(serviceA.packagesCount).toBe(1);
  });

  it('should successfully delete Service A when force=true, removing it from package.serviceIds', async () => {
    const res = await request(app)
      .delete(`/api/v1/services/${serviceAId}?force=true`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    // Verify package serviceIds no longer contains serviceAId
    const pkg = await Package.findById(packageId);
    expect(pkg?.serviceIds.map(id => id.toString())).not.toContain(serviceAId);
    expect(pkg?.serviceIds.map(id => id.toString())).toContain(serviceBId);
  });
});
