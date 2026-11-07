import { Router } from 'express';
import {
  createPhysicalDocument,
  getPhysicalDocumentList,
  getPhysicalDocumentById,
  updatePhysicalDocument,
  deletePhysicalDocument,
  returnPhysicalDocument,
  getStorageLocations,
  createStorageLocation,
  updateStorageLocation,
  deleteStorageLocation,
  triggerOverdueScan,
  exportPhysicalDocumentsCsv,
  getHandoverSlip,
  getAvailablePhysicalDocsForMovement,
  getDocumentMovementHistory
} from '../controllers/physical-document.controller';
import { authorize } from '../middlewares/authorize';

const router = Router();

// Master directory & batch operations (defined before /:id)
router.get('/locations', authorize('document:physical_manage'), getStorageLocations);
router.post('/locations', authorize('document:physical_manage'), createStorageLocation);
router.put('/locations/:id', authorize('document:physical_manage'), updateStorageLocation);
router.delete('/locations/:id', authorize('document:physical_manage'), deleteStorageLocation);
router.get('/export', authorize('document:physical_manage'), exportPhysicalDocumentsCsv);
router.get('/available-for-movement', authorize('document:physical_manage'), getAvailablePhysicalDocsForMovement);
router.post('/trigger-scan', authorize('document:physical_manage'), triggerOverdueScan);

// CRUD & Query APIs
router.post('/', authorize('document:physical_manage'), createPhysicalDocument);
router.get('/', authorize('document:physical_manage'), getPhysicalDocumentList);
router.get('/:id', authorize('document:physical_manage'), getPhysicalDocumentById);
router.get('/:id/history', authorize('document:physical_manage'), getDocumentMovementHistory);
router.put('/:id', authorize('document:physical_manage'), updatePhysicalDocument);
router.delete('/:id', authorize('document:physical_manage'), deletePhysicalDocument);

// Physical Return Acknowledgment & Handover Slip Receipt
router.post('/:id/return', authorize('document:physical_manage'), returnPhysicalDocument);
router.get('/:id/handover-slip', authorize('document:physical_manage'), getHandoverSlip);

export default router;
