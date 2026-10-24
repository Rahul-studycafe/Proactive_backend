import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../utils/ApiResponse';
import { calculateClientLedger } from '../services/ledger.service';
import mongoose from 'mongoose';

/**
 * Get chronological client ledger with running balance (Phase 47).
 */
export const getClientLedger = asyncHandler(
  async (req: Request, res: Response) => {
    const clientId = req.params.clientId as string;
    const { from, to } = req.query;

    const ledger = await calculateClientLedger(
      req.tenantId as mongoose.Types.ObjectId,
      clientId,
      {
        from: from as string,
        to: to as string
      }
    );

    sendSuccess(res, 200, 'Success', ledger);
  }
);
