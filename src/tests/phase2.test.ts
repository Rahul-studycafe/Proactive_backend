import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../app';

describe('Phase 2: Database Connection & Global Error Handler', () => {
  it('should format errors using the global error handler', async () => {
    // The /error-test route intentionally throws an ApiError to trigger the errorHandler
    const response = await request(app).get('/error-test');
    
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBeDefined();
    
    // Validating the standard JSON format returned by errorHandler
    expect(response.body.error.code).toBe('TEST_ERROR');
    expect(response.body.error.message).toBe('This is a test error to verify the global error handler');
    
    // Meta fields injected by the ApiResponse format
    expect(response.body.meta).toBeDefined();
  });
});
