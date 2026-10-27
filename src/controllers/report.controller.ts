import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import {
  getTaskReport,
  getServiceReport,
  getDscReport,
  getInvoiceReport,
  getReceiptReport,
  getGstSummaryReport,
  getDebtorsAgingReport,
  streamReportExcel
} from '../services/report.service';

/**
 * Phase 112: Task Operational Intelligence Report
 */
export const getTasksReport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const report = await getTaskReport(req.tenantId as Types.ObjectId, req.query);
  return sendSuccess(res, 200, 'Task operational report retrieved', report);
});

/**
 * Phase 112: Service Subscriptions & Yield Report
 */
export const getServicesReport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const report = await getServiceReport(req.tenantId as Types.ObjectId, req.query);
  return sendSuccess(res, 200, 'Service operational report retrieved', report);
});

/**
 * Phase 112: DSC Renewals Timeline Report
 */
export const getDscRenewalsReport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const report = await getDscReport(req.tenantId as Types.ObjectId, req.query);
  return sendSuccess(res, 200, 'DSC renewals report retrieved', report);
});

/**
 * Phase 113: Invoices & Revenue Breakdown Report
 */
export const getInvoicesReport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const report = await getInvoiceReport(req.tenantId as Types.ObjectId, req.query);
  return sendSuccess(res, 200, 'Invoices financial report retrieved', report);
});

/**
 * Phase 113: Cash Flow & Collections Receipts Report
 */
export const getReceiptsReport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const report = await getReceiptReport(req.tenantId as Types.ObjectId, req.query);
  return sendSuccess(res, 200, 'Receipts cashflow report retrieved', report);
});

/**
 * Phase 113: GSTR-1 Summary & Tax Breakdown Report
 */
export const getGstSummaryReportHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const report = await getGstSummaryReport(req.tenantId as Types.ObjectId, req.query);
  return sendSuccess(res, 200, 'GSTR-1 summary report retrieved', report);
});

/**
 * Phase 114: Debtors Aging Outstandings Report
 */
export const getDebtorsAgingReportHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const report = await getDebtorsAgingReport(req.tenantId as Types.ObjectId, req.query);
  return sendSuccess(res, 200, 'Debtors aging report retrieved', report);
});

const reportTypeEnum = z.enum([
  'tasks',
  'services',
  'dsc-renewals',
  'invoices',
  'receipts',
  'gst-summary',
  'debtors-aging'
]);

/**
 * Phase 115: High-Performance Streaming Excel Export
 */
export const exportReportExcelHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const parsed = reportTypeEnum.safeParse(req.params.reportType);
  if (!parsed.success) {
    throw new ApiError(
      400,
      `Invalid report type: ${req.params.reportType}. Supported types: ${reportTypeEnum.options.join(', ')}`,
      'INVALID_REPORT_TYPE'
    );
  }

  await streamReportExcel(
    req.tenantId as Types.ObjectId,
    parsed.data,
    req.query,
    res
  );
});
