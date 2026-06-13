import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import dotenv from 'dotenv';

dotenv.config();

describe('Health Metrics API', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it('should return 200 OK and system metrics when database is connected', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('OK');
    expect(res.body.data.database.state).toBe('connected');
    expect(res.body.data.memory).toBeDefined();
    expect(res.body.data.system).toBeDefined();
    expect(res.body.data.uptime).toBeDefined();
  });
});
