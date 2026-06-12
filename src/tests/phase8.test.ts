import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../models/Organization';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { BillingEntity } from '../models/BillingEntity';
import { TenantSettings } from '../models/TenantSettings';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 8: Registration Endpoint', () => {
  
  beforeAll(async () => {
    await connectDB();
    // Clean up
    await Organization.deleteMany({ slug: { $regex: 'test-saas' } });
    await User.deleteMany({ username: 'test_founder' });
  });

  afterAll(async () => {
    await Organization.deleteMany({ slug: { $regex: 'test-saas' } });
    await User.deleteMany({ username: 'test_founder' });
    await mongoose.connection.close();
  });

  it('should register a new organization and orchestrate all 5 models', async () => {
    const payload = {
      orgName: 'Test SaaS Inc',
      name: 'Founder Bob',
      username: 'test_founder',
      password: 'superSecretPassword',
      email: 'bob@testsaas.com'
    };

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('accessToken');
    expect(response.body.data).toHaveProperty('refreshToken');
    expect(response.body.data.user.username).toBe(payload.username);
    expect(response.body.data.organization.name).toBe(payload.orgName);

    const orgId = response.body.data.organization._id;

    // Verify all 5 documents exist in DB
    const org = await Organization.findById(orgId);
    expect(org).toBeTruthy();
    expect(org?.name).toBe(payload.orgName);

    const role = await Role.findOne({ tenantId: orgId, isSuperAdmin: true });
    expect(role).toBeTruthy();

    const user = await User.findOne({ tenantId: orgId, username: payload.username });
    expect(user).toBeTruthy();
    expect(user?.roleId.toString()).toBe(role?._id.toString());

    const billing = await BillingEntity.findOne({ tenantId: orgId });
    expect(billing).toBeTruthy();
    expect(billing?.name).toBe(payload.orgName);

    const settings = await TenantSettings.findOne({ tenantId: orgId });
    expect(settings).toBeTruthy();
  });

  it('should fail if validation fails', async () => {
    const payload = {
      orgName: 'T', // too short
      name: 'Founder Bob',
      username: 'usr', // too short
      password: '123', // too short
      email: 'not-an-email'
    };

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

});
