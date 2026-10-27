import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { exportTallyXmlHandler } from '../controllers/accounting.controller';

const router = Router();

router.use(authenticate);

// Phase 118: Tally XML Accounting Synchronization Export
router.get('/tally-export', exportTallyXmlHandler);

export default router;
