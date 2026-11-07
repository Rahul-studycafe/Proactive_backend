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
router.post('/', authorize('credit_note:create'), createCreditNote);
router.get('/', authorize('credit_note:view'), getCreditNoteList);
router.get('/:id', authorize('credit_note:view'), getCreditNoteById);

// Allocation & Cash Refund Actions
router.post('/:id/apply', authorize('credit_note:create'), applyUnallocatedCredit);
router.post('/:id/refund', authorize('credit_note:create'), refundCreditNote);

export default router;
