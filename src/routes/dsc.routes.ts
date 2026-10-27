import { Router } from 'express';
import {
  createDsc,
  getDscList,
  getDscById,
  updateDsc,
  deleteDsc,
  logDscHandover,
  getDscHistory,
  triggerDscScan,
  getDscSummaryKpi
} from '../controllers/dsc.controller';
import { authorize } from '../middlewares/authorize';

const router = Router();

// KPI & Expiry Scan Actions
router.get('/kpi', authorize('dsc', 'view'), getDscSummaryKpi);
router.post('/trigger-scan', authorize('dsc', 'edit'), triggerDscScan);

// Inventory CRUD
router.post('/', authorize('dsc', 'create'), createDsc);
router.get('/', authorize('dsc', 'view'), getDscList);
router.get('/:id', authorize('dsc', 'view'), getDscById);
router.put('/:id', authorize('dsc', 'edit'), updateDsc);
router.delete('/:id', authorize('dsc', 'delete'), deleteDsc);

// Handover & Custody Movement History
router.post('/:id/handover', authorize('dsc', 'edit'), logDscHandover);
router.get('/:id/history', authorize('dsc', 'view'), getDscHistory);

export default router;
