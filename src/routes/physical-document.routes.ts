import { Router } from 'express';
import {
  createPhysicalDocument,
  getPhysicalDocumentList,
  getPhysicalDocumentById,
  updatePhysicalDocument,
  deletePhysicalDocument,
  returnPhysicalDocument,
  getStorageLocations,
  triggerOverdueScan,
  exportPhysicalDocumentsCsv,
  getHandoverSlip
} from '../controllers/physical-document.controller';
import { authorize } from '../middlewares/authorize';

const router = Router();

// Master directory & batch operations (defined before /:id)
router.get('/locations', authorize('docsInOut', 'view'), getStorageLocations);
router.get('/export', authorize('docsInOut', 'view'), exportPhysicalDocumentsCsv);
router.post('/trigger-scan', authorize('docsInOut', 'edit'), triggerOverdueScan);

// CRUD & Query APIs
router.post('/', authorize('docsInOut', 'create'), createPhysicalDocument);
router.get('/', authorize('docsInOut', 'view'), getPhysicalDocumentList);
router.get('/:id', authorize('docsInOut', 'view'), getPhysicalDocumentById);
router.put('/:id', authorize('docsInOut', 'edit'), updatePhysicalDocument);
router.delete('/:id', authorize('docsInOut', 'delete'), deletePhysicalDocument);

// Physical Return Acknowledgment & Handover Slip Receipt
router.post('/:id/return', authorize('docsInOut', 'edit'), returnPhysicalDocument);
router.get('/:id/handover-slip', authorize('docsInOut', 'view'), getHandoverSlip);

export default router;
