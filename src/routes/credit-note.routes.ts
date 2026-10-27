import { Router } from 'express';
import {
  createCreditNote,
  getCreditNoteList,
  getCreditNoteById,
  applyUnallocatedCredit,
  refundCreditNote
} from '../controllers/credit-note.controller';
import { authorize } from '../middlewares/authorize';

const router = Router();

// Issuance & Query
router.post('/', authorize('invoice', 'create'), createCreditNote);
router.get('/', authorize('invoice', 'view'), getCreditNoteList);
router.get('/:id', authorize('invoice', 'view'), getCreditNoteById);

// Allocation & Cash Refund Actions
router.post('/:id/apply', authorize('invoice', 'create'), applyUnallocatedCredit);
router.post('/:id/refund', authorize('invoice', 'create'), refundCreditNote);

export default router;
