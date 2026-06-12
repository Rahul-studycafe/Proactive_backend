import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../app';

describe('Phase 1: Project Initialization & Express Setup', () => {
  it('should return 200 OK health check on GET /', async () => {
    const response = await request(app).get('/');
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('API is running');
    expect(response.body.meta).toBeDefined();
    expect(response.body.meta.service).toBe('Proactive-backend');
  });

  it('should return 404 for an unknown route', async () => {
    const response = await request(app).get('/some-unknown-route');
    
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
