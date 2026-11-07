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
router.post('/trigger-scan', authorize('document:request'), triggerExpiredScan);

// Staff Document Request CRUD & Lifecycle
router.post('/', authorize('document:request'), createDocumentRequest);
router.get('/', authorize('document:request'), getDocumentRequestList);
router.get('/:id', authorize('document:request'), getDocumentRequestById);
router.post('/:id/resend', authorize('document:request'), resendDocumentRequest);
router.delete('/:id', authorize('document:request'), cancelDocumentRequest);

export default router;
