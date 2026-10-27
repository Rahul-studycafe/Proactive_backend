import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import {
  getTasksReport,
  getServicesReport,
  getDscRenewalsReport,
  getInvoicesReport,
  getReceiptsReport,
  getGstSummaryReportHandler,
  getDebtorsAgingReportHandler,
  exportReportExcelHandler
} from '../controllers/report.controller';

const router = Router();

router.use(authenticate);

// Phase 112: Operational & Task Reporting
router.get('/tasks', getTasksReport);
router.get('/services', getServicesReport);
router.get('/dsc-renewals', getDscRenewalsReport);

// Phase 113: Financial & Revenue Reporting
router.get('/invoices', getInvoicesReport);
router.get('/receipts', getReceiptsReport);
router.get('/gst-summary', getGstSummaryReportHandler);

// Phase 114: Debtors Aging Outstandings Report
router.get('/debtors-aging', getDebtorsAgingReportHandler);

// Phase 115: Streaming Excel Export Engine
router.get('/:reportType/export', exportReportExcelHandler);

export default router;
