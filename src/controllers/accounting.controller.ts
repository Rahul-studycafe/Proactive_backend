import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/async-handler';
import { ApiError } from '../common/errors/api-error';
import { generateTallyXml } from '../services/tally.service';

/**
 * Phase 118: Tally XML Accounting Synchronization Export
 */
export const exportTallyXmlHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const xml = await generateTallyXml(
    req.tenantId as Types.ObjectId,
    req.query
  );

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="tally_export_${Date.now()}.xml"`
  );

  return res.status(200).send(xml);
});
