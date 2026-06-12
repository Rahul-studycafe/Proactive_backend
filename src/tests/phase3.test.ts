import { describe, it, expect, jest } from '@jest/globals';
import { ApiError } from '../utils/ApiError';
import { sendSuccess, sendError } from '../utils/ApiResponse';
import { Response } from 'express';

describe('Phase 3: API Utility Classes', () => {
  
  describe('ApiError utility', () => {
    it('should correctly construct an ApiError instance', () => {
      const error = new ApiError(403, 'Permission denied', 'FORBIDDEN', ['User lacks admin role']);
      
      expect(error).toBeInstanceOf(Error);
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Permission denied');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.details).toContain('User lacks admin role');
    });
  });

  describe('ApiResponse utility (sendSuccess & sendError)', () => {
    // Mock Express Response object
    const mockRes = () => {
      const res = {} as Response;
      res.status = jest.fn().mockReturnValue(res) as any;
      res.json = jest.fn().mockReturnValue(res) as any;
      res.locals = { requestId: 'req-123' };
      return res;
    };

    it('should properly format sendSuccess response', () => {
      const res = mockRes();
      sendSuccess(res, 201, 'Created Successfully', { id: 1 });
      
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Created Successfully',
        data: { id: 1 },
        meta: expect.objectContaining({
          requestId: 'req-123'
        })
      }));
    });

    it('should properly format sendError response', () => {
      const res = mockRes();
      sendError(res, 500, 'INTERNAL_SERVER', 'Something broke');
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'INTERNAL_SERVER',
          message: 'Something broke'
        })
      }));
    });
  });
});
