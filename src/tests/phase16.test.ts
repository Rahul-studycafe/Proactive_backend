import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { User } from '../modules/auth/schemas';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 16: Rate Limiting Middleware', () => {
  const orgSlug = 'phase16-org';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'dummy_user_16' }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'Org 16', slug: orgSlug, plan: { maxUsers: 5 } });
    await org.save();
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'dummy_user_16' }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should block after 10 requests', async () => {
    let statusCode = 200;
    let errorCode = '';

    for (let i = 0; i < 11; i++) {
      const res = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'dummy_user_16', password: 'wrong' });
      statusCode = res.status;
      if (statusCode === 429) {
        errorCode = res.body.error.code;
        break;
      }
    }

    expect(statusCode).toBe(429);
    expect(errorCode).toBe('TOO_MANY_REQUESTS');
  });
});
