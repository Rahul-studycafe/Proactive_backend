import { Router } from 'express';
import {
  verifyPan,
  verifyGstin,
  autoFillClientFromGstin,
  getComplianceLogs
} from '../controllers/compliance.controller';
import { authorize } from '../middlewares/authorize';

const router = Router();

// PAN verification
router.post('/verify-pan', authorize('client', 'view'), verifyPan);

// GSTIN verification
router.post('/verify-gstin', authorize('client', 'view'), verifyGstin);

// 1-Click Client Onboarding Auto-Fill
router.post('/auto-fill-client', authorize('client', 'create'), autoFillClientFromGstin);

// Compliance audit trail & cache logs
router.get('/logs', authorize('client', 'view'), getComplianceLogs);

export default router;
