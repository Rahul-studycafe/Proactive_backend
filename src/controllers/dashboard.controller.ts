import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../utils/ApiResponse';
import {
  getDashboardMetrics,
  getClientSummaryMetrics
} from '../services/dashboard.service';
import mongoose from 'mongoose';

/**
 * Get aggregated dashboard overview data (Phase 48).
 */
export const getDashboardOverview = asyncHandler(
  async (req: Request, res: Response) => {
    const data = await getDashboardMetrics(
      req.tenantId as mongoose.Types.ObjectId,
      req.user
    );
    sendSuccess(res, 200, 'Success', data);
  }
);

/**
 * Get client summary metrics via MongoDB $facet (Phase 48).
 */
export const getClientSummary = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const summary = await getClientSummaryMetrics(
      req.tenantId as mongoose.Types.ObjectId,
      id
    );
    sendSuccess(res, 200, 'Success', summary);
  }
);
