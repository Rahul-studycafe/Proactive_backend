import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { getClientLedger } from '../controllers/ledger.controller';

const router = Router();

router.use(authenticate);

// Client Ledger route (Requires client viewLedger permission)
router.get('/:clientId', authorize('client', 'viewLedger'), getClientLedger);

export default router;
