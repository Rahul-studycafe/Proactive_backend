import { Router } from 'express';
import {
  createDocumentRequest,
  getDocumentRequestList,
  getDocumentRequestById,
  resendDocumentRequest,
  cancelDocumentRequest,
  triggerExpiredScan
} from '../controllers/document-request.controller';
import { authorize } from '../middlewares/authorize';

const router = Router();

// Scanning & Batch Operations (before /:id)
router.post('/trigger-scan', authorize('client', 'edit'), triggerExpiredScan);

// Staff Document Request CRUD & Lifecycle
router.post('/', authorize('client', 'create'), createDocumentRequest);
router.get('/', authorize('client', 'view'), getDocumentRequestList);
router.get('/:id', authorize('client', 'view'), getDocumentRequestById);
router.post('/:id/resend', authorize('client', 'edit'), resendDocumentRequest);
router.delete('/:id', authorize('client', 'delete'), cancelDocumentRequest);

export default router;
