import mongoose from 'mongoose';
import { CreditNote, ICreditNote, ICreditNoteItem } from '../models/CreditNote';
import { Invoice } from '../models/Invoice';
import { Client } from '../modules/clients/schemas/client.schema';
import { ApiError } from '../common/errors/api-error';
import { getNextCreditNoteNumber } from './sequence.service';

export interface CreateCreditNoteInput {
  clientId: string;
  invoiceId: string;
  date: string | Date;
  reason?: 'Overcharge Correction' | 'Service Cancellation' | 'Goodwill Discount' | 'Deficiency of Service' | 'Other';
  items: {
    description: string;
    sacCode?: string;
    quantity: number;
    rate: number;
    amount?: number;
    gstPercentage?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    total?: number;
  }[];
  totals?: {
    subtotal?: number;
    taxTotal?: number;
    cgstTotal?: number;
    sgstTotal?: number;
    igstTotal?: number;
    roundOff?: number;
    grandTotal?: number;
  };
  notes?: string;
}

export interface GetCreditNoteListQuery {
  clientId?: string;
  invoiceId?: string;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ApplyCreditInput {
  targetInvoiceId: string;
  amountToApply?: number;
}

export interface RefundCreditInput {
  refundMode: 'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI' | 'Other';
  refundDate?: string | Date;
  referenceNo?: string;
  refundedAmount?: number;
  notes?: string;
}

/**
 * 1. Phase 76 & 77: Atomic Credit Note Issuance with MongoDB ACID Multi-Document Transaction
 */
export const createCreditNoteService = async (
  tenantId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  data: CreateCreditNoteInput
): Promise<ICreditNote> => {
  if (!mongoose.Types.ObjectId.isValid(data.invoiceId)) {
    throw new ApiError(400, 'Invalid invoice identifier', 'INVALID_INVOICE_ID');
  }

  const invoice = await Invoice.findOne({
    _id: new mongoose.Types.ObjectId(data.invoiceId),
    tenantId
  });

  if (!invoice) {
    throw new ApiError(404, 'Invoice not found in this organization', 'INVOICE_NOT_FOUND');
  }

  if (invoice.status === 'Cancelled' || invoice.status === 'Draft') {
    throw new ApiError(
      400,
      `Cannot issue credit note for an invoice in '${invoice.status}' status`,
      'INVALID_INVOICE_STATUS'
    );
  }

  if (data.clientId && invoice.clientId.toString() !== data.clientId) {
    throw new ApiError(400, 'Invoice does not belong to the specified client', 'CLIENT_MISMATCH');
  }

  // Calculate and normalize line items
  let subtotal = 0;
  let taxTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  const normalizedItems: ICreditNoteItem[] = data.items.map((it) => {
    const qty = Number(it.quantity) || 1;
    const rate = Number(it.rate) || 0;
    const amount = it.amount !== undefined ? Number(it.amount) : Math.round(qty * rate * 100) / 100;
    const gstRate = it.gstPercentage !== undefined ? Number(it.gstPercentage) : 18;
    const totalGst = Math.round((amount * gstRate) / 100 * 100) / 100;

    // Check if intra-state or inter-state, or default split
    const cgst = it.cgst !== undefined ? Number(it.cgst) : Math.round((totalGst / 2) * 100) / 100;
    const sgst = it.sgst !== undefined ? Number(it.sgst) : Math.round((totalGst / 2) * 100) / 100;
    const igst = it.igst !== undefined ? Number(it.igst) : 0;
    const total = it.total !== undefined ? Number(it.total) : Math.round((amount + cgst + sgst + igst) * 100) / 100;

    subtotal += amount;
    taxTotal += cgst + sgst + igst;
    cgstTotal += cgst;
    sgstTotal += sgst;
    igstTotal += igst;

    return {
      description: it.description.trim(),
      sacCode: it.sacCode?.trim(),
      quantity: qty,
      rate,
      amount,
      gstPercentage: gstRate,
      cgst,
      sgst,
      igst,
      total
    };
  });

  const calculatedGrandTotal = Math.round((subtotal + taxTotal) * 100) / 100;
  const grandTotal = data.totals?.grandTotal !== undefined ? Number(data.totals.grandTotal) : calculatedGrandTotal;

  if (grandTotal <= 0) {
    throw new ApiError(400, 'Credit Note total amount must be greater than zero', 'INVALID_CREDIT_AMOUNT');
  }

  // Verify credit note amount does not exceed invoice total
  const existingCreditNotes = await CreditNote.find({
    tenantId,
    invoiceId: invoice._id,
    status: { $ne: 'Cancelled' }
  });

  const alreadyCredited = existingCreditNotes.reduce((sum, cn) => sum + (cn.totals?.grandTotal || 0), 0);
  const maxAllowedCredit = Math.round((invoice.totals.grandTotal - alreadyCredited) * 100) / 100;

  if (grandTotal > maxAllowedCredit) {
    throw new ApiError(
      400,
      `Credit Note amount (₹${grandTotal}) exceeds maximum allowable invoice credit (₹${maxAllowedCredit})`,
      'CREDIT_LIMIT_EXCEEDED'
    );
  }

  // MongoDB Multi-Document ACID Transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const creditNoteNo = await getNextCreditNoteNumber(tenantId, 'CN-', session);

    // Calculate allocation against linked invoice balance due
    const currentDue = invoice.totals.amountDue || 0;
    const adjustedDue = Math.max(0, Math.round((currentDue - grandTotal) * 100) / 100);
    const creditAppliedToInvoice = Math.round((currentDue - adjustedDue) * 100) / 100;
    const unallocatedCredit = Math.round((grandTotal - creditAppliedToInvoice) * 100) / 100;

    const initialStatus = unallocatedCredit === 0 ? 'Applied' : 'Issued';

    const creditNote = new CreditNote({
      tenantId,
      clientId: invoice.clientId,
      invoiceId: invoice._id,
      creditNoteNo,
      date: new Date(data.date),
      reason: data.reason || 'Overcharge Correction',
      items: normalizedItems,
      totals: {
        subtotal: Math.round(subtotal * 100) / 100,
        taxTotal: Math.round(taxTotal * 100) / 100,
        cgstTotal: Math.round(cgstTotal * 100) / 100,
        sgstTotal: Math.round(sgstTotal * 100) / 100,
        igstTotal: Math.round(igstTotal * 100) / 100,
        roundOff: 0,
        grandTotal
      },
      creditAppliedToInvoice,
      unallocatedCredit,
      status: initialStatus,
      notes: data.notes?.trim(),
      createdBy: userId
    });

    await creditNote.save({ session });

    // Update invoice balance and linkage
    invoice.totals.amountDue = adjustedDue;
    if (adjustedDue === 0 && (invoice.status === 'Unpaid' || invoice.status === 'Partially Paid')) {
      invoice.status = 'Paid';
    }
    if (!invoice.creditNoteIds) {
      invoice.creditNoteIds = [];
    }
    invoice.creditNoteIds.push(creditNote._id as mongoose.Types.ObjectId);

    await invoice.save({ session });

    await session.commitTransaction();

    return creditNote;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * 2. Phase 79: Get filterable & paginated Credit Note directory
 */
export const getCreditNoteListService = async (
  tenantId: mongoose.Types.ObjectId,
  query: GetCreditNoteListQuery = {}
): Promise<{ creditNotes: ICreditNote[]; total: number; page: number; limit: number; totalPages: number }> => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter: any = { tenantId };

  if (query.clientId && mongoose.Types.ObjectId.isValid(query.clientId)) {
    filter.clientId = new mongoose.Types.ObjectId(query.clientId);
  }

  if (query.invoiceId && mongoose.Types.ObjectId.isValid(query.invoiceId)) {
    filter.invoiceId = new mongoose.Types.ObjectId(query.invoiceId);
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.search && query.search.trim()) {
    const searchRegex = new RegExp(query.search.trim(), 'i');
    filter.$or = [{ creditNoteNo: searchRegex }, { notes: searchRegex }];
  }

  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = new Date(query.from);
    if (query.to) {
      const toDate = new Date(query.to);
      if (typeof query.to === 'string' && query.to.length === 10) {
        toDate.setHours(23, 59, 59, 999);
      }
      filter.date.$lte = toDate;
    }
  }

  const [creditNotes, total] = await Promise.all([
    CreditNote.find(filter)
      .populate('clientId', 'name email mobile pan gstin entityType')
      .populate('invoiceId', 'invoiceNo date totals status')
      .populate('createdBy', 'name username email')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    CreditNote.countDocuments(filter)
  ]);

  return {
    creditNotes,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1
  };
};

/**
 * 3. Phase 79: Get single Credit Note detail
 */
export const getCreditNoteByIdService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string
): Promise<ICreditNote> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid credit note identifier', 'INVALID_ID');
  }

  const creditNote = await CreditNote.findOne({
    _id: new mongoose.Types.ObjectId(id),
    tenantId
  })
    .populate('clientId', 'name email mobile pan gstin address city state pincode entityType')
    .populate('invoiceId', 'invoiceNo date dueDate totals status items')
    .populate('createdBy', 'name username email');

  if (!creditNote) {
    throw new ApiError(404, 'Credit Note not found', 'CREDIT_NOTE_NOT_FOUND');
  }

  return creditNote;
};

/**
 * 4. Phase 80: Apply unallocated credit against another unpaid invoice (ACID Transaction)
 */
export const applyUnallocatedCreditService = async (
  tenantId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  creditNoteId: string,
  data: ApplyCreditInput
): Promise<{ creditNote: ICreditNote; targetInvoice: any; amountApplied: number }> => {
  if (!mongoose.Types.ObjectId.isValid(creditNoteId) || !mongoose.Types.ObjectId.isValid(data.targetInvoiceId)) {
    throw new ApiError(400, 'Invalid identifier provided', 'INVALID_ID');
  }

  const creditNote = await CreditNote.findOne({
    _id: new mongoose.Types.ObjectId(creditNoteId),
    tenantId
  });

  if (!creditNote) {
    throw new ApiError(404, 'Credit Note not found', 'CREDIT_NOTE_NOT_FOUND');
  }

  if (creditNote.status === 'Cancelled' || creditNote.status === 'Refunded') {
    throw new ApiError(400, `Cannot apply credit from a credit note in '${creditNote.status}' status`, 'INVALID_STATUS');
  }

  if (creditNote.unallocatedCredit <= 0) {
    throw new ApiError(400, 'Credit Note has zero unallocated credit balance', 'NO_UNALLOCATED_CREDIT');
  }

  const targetInvoice = await Invoice.findOne({
    _id: new mongoose.Types.ObjectId(data.targetInvoiceId),
    tenantId
  });

  if (!targetInvoice) {
    throw new ApiError(404, 'Target invoice not found in this organization', 'TARGET_INVOICE_NOT_FOUND');
  }

  if (targetInvoice.clientId.toString() !== creditNote.clientId.toString()) {
    throw new ApiError(400, 'Target invoice must belong to the same client', 'CLIENT_MISMATCH');
  }

  if (targetInvoice.totals.amountDue <= 0 || targetInvoice.status === 'Paid') {
    throw new ApiError(400, 'Target invoice is already fully paid', 'INVOICE_ALREADY_PAID');
  }

  const maxApplicable = Math.min(creditNote.unallocatedCredit, targetInvoice.totals.amountDue);
  const requestedAmount = data.amountToApply !== undefined ? Number(data.amountToApply) : maxApplicable;

  if (requestedAmount <= 0) {
    throw new ApiError(400, 'Amount to apply must be greater than zero', 'INVALID_AMOUNT');
  }

  if (requestedAmount > creditNote.unallocatedCredit) {
    throw new ApiError(400, `Requested amount (₹${requestedAmount}) exceeds available credit (₹${creditNote.unallocatedCredit})`, 'EXCEEDS_CREDIT');
  }

  if (requestedAmount > targetInvoice.totals.amountDue) {
    throw new ApiError(400, `Requested amount (₹${requestedAmount}) exceeds target invoice amount due (₹${targetInvoice.totals.amountDue})`, 'EXCEEDS_DUE');
  }

  // ACID Transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const updatedUnallocated = Math.round((creditNote.unallocatedCredit - requestedAmount) * 100) / 100;
    creditNote.unallocatedCredit = updatedUnallocated;
    if (updatedUnallocated === 0) {
      creditNote.status = 'Applied';
    }
    await creditNote.save({ session });

    const newAmountDue = Math.round((targetInvoice.totals.amountDue - requestedAmount) * 100) / 100;
    targetInvoice.totals.amountDue = newAmountDue;
    if (newAmountDue === 0) {
      targetInvoice.status = 'Paid';
    } else {
      targetInvoice.status = 'Partially Paid';
    }

    if (!targetInvoice.creditNoteIds) targetInvoice.creditNoteIds = [];
    targetInvoice.creditNoteIds.push(creditNote._id as mongoose.Types.ObjectId);

    await targetInvoice.save({ session });

    await session.commitTransaction();

    return { creditNote, targetInvoice, amountApplied: requestedAmount };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * 5. Phase 80: Refund excess unallocated credit back to client
 */
export const refundCreditNoteService = async (
  tenantId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  creditNoteId: string,
  data: RefundCreditInput
): Promise<ICreditNote> => {
  if (!mongoose.Types.ObjectId.isValid(creditNoteId)) {
    throw new ApiError(400, 'Invalid credit note identifier', 'INVALID_ID');
  }

  const creditNote = await CreditNote.findOne({
    _id: new mongoose.Types.ObjectId(creditNoteId),
    tenantId
  });

  if (!creditNote) {
    throw new ApiError(404, 'Credit Note not found', 'CREDIT_NOTE_NOT_FOUND');
  }

  if (creditNote.unallocatedCredit <= 0) {
    throw new ApiError(400, 'Credit note has zero unallocated credit to refund', 'NO_UNALLOCATED_CREDIT');
  }

  const refundAmount = data.refundedAmount !== undefined ? Number(data.refundedAmount) : creditNote.unallocatedCredit;

  if (refundAmount <= 0) {
    throw new ApiError(400, 'Refund amount must be greater than zero', 'INVALID_AMOUNT');
  }

  if (refundAmount > creditNote.unallocatedCredit) {
    throw new ApiError(400, `Refund amount (₹${refundAmount}) exceeds available credit (₹${creditNote.unallocatedCredit})`, 'EXCEEDS_CREDIT');
  }

  const remainingCredit = Math.round((creditNote.unallocatedCredit - refundAmount) * 100) / 100;
  creditNote.unallocatedCredit = remainingCredit;

  if (remainingCredit === 0) {
    creditNote.status = 'Refunded';
  }

  creditNote.refundDetails = {
    refundDate: data.refundDate ? new Date(data.refundDate) : new Date(),
    refundMode: data.refundMode,
    referenceNo: data.referenceNo?.trim(),
    refundedAmount: refundAmount,
    notes: data.notes?.trim()
  };

  await creditNote.save();
  return creditNote;
};
