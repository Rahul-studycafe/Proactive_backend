import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import {
  createQuotation,
  getQuotations,
  getQuotationById,
  updateQuotation,
  deleteQuotation,
  updateQuotationStatus,
  sendQuotationEmail,
  convertToInvoice,
  getPrintLayout,
  getQuotationPipelineAnalytics
} from '../controllers/quotation.controller';

const router = Router();

router.use(authenticate);

// Pipeline Analytics
router.get('/analytics/pipeline', authorize('quotation', 'view'), getQuotationPipelineAnalytics);

// Conversion & Actions
router.post('/:id/convert-to-invoice', authorize('quotation', 'edit'), convertToInvoice);
router.post('/:id/send', authorize('quotation', 'edit'), sendQuotationEmail);
router.patch('/:id/status', authorize('quotation', 'edit'), updateQuotationStatus);
router.get('/:id/print', authorize('quotation', 'view'), getPrintLayout);

// Standard CRUD
router.post('/', authorize('quotation', 'create'), createQuotation);
router.get('/', authorize('quotation', 'view'), getQuotations);
router.get('/:id', authorize('quotation', 'view'), getQuotationById);
router.put('/:id', authorize('quotation', 'edit'), updateQuotation);
router.delete('/:id', authorize('quotation', 'delete'), deleteQuotation);

export default router;
