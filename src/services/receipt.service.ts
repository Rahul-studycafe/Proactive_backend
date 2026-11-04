import mongoose from 'mongoose';
import { Receipt, IReceiptSettlement } from '../models/Receipt';
import { Invoice } from '../models/Invoice';
import { CreditNote } from '../models/CreditNote';
import { getNextReceiptNumber } from './sequence.service';
import { ApiError } from '../common/errors/api-error';

export interface CreateReceiptInput {
  clientId: string;
  date?: string | Date;
  paymentMode?: 'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI' | 'Other';
  referenceNumber?: string;
  totalAmount: number;
  tdsAmount?: number;
  discountAmount?: number;
  notes?: string;
  settlements?: Array<{
    invoiceId: string;
    settledAmount: number;
    tdsDeducted?: number;
  }>;
  autoSettle?: boolean;
}

/**
 * Calculates FIFO waterfall allocation for lump-sum receipts against oldest invoices.
 */
export const calculateAutoSettle = async (
  tenantId: mongoose.Types.ObjectId,
  clientId: string,
  totalAmount: number,
  tdsAmount: number = 0,
  discountAmount: number = 0
) => {
  const unpaidInvoices = await Invoice.find({
    tenantId,
    clientId,
    status: { $in: ['Unpaid', 'Partially Paid'] }
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  let remainingPool = totalAmount + (tdsAmount || 0) + (discountAmount || 0);
  const allocations: Array<{
    invoiceId: any;
    invoiceNo: string;
    date: Date;
    grandTotal: number;
    currentDue: number;
    settledAmount: number;
    newDue: number;
    newStatus: 'Paid' | 'Partially Paid';
  }> = [];

  for (const inv of unpaidInvoices) {
    if (remainingPool <= 0) break;

    const due = inv.totals?.amountDue ?? (inv.totals?.grandTotal - (inv.totals?.amountPaid || 0));
    if (due <= 0) continue;

    const settle = Math.min(due, remainingPool);
    const newDue = due - settle;
    allocations.push({
      invoiceId: inv._id,
      invoiceNo: inv.invoiceNo,
      date: inv.date,
      grandTotal: inv.totals?.grandTotal || 0,
      currentDue: due,
      settledAmount: settle,
      newDue,
      newStatus: newDue <= 0 ? 'Paid' : 'Partially Paid'
    });

    remainingPool -= settle;
  }

  const totalPool = totalAmount + (tdsAmount || 0) + (discountAmount || 0);
  const unallocatedAmount = Math.max(0, Math.round(remainingPool * 100) / 100);
  const totalSettled = Math.round((totalPool - unallocatedAmount) * 100) / 100;

  return {
    allocations,
    totalSettled,
    unallocatedAmount
  };
};

/**
 * Creates a receipt and settles invoices atomically using MongoDB multi-document transactions.
 */
export const createReceiptWithTransaction = async (
  tenantId: mongoose.Types.ObjectId,
  data: CreateReceiptInput
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let settlementsToApply: IReceiptSettlement[] = [];

    // Auto-settle if requested and no settlements provided
    if (data.autoSettle && (!data.settlements || data.settlements.length === 0)) {
      const autoResult = await calculateAutoSettle(
        tenantId,
        data.clientId,
        data.totalAmount,
        data.tdsAmount || 0,
        data.discountAmount || 0
      );
      settlementsToApply = autoResult.allocations.map((a) => ({
        invoiceId: new mongoose.Types.ObjectId(a.invoiceId.toString()),
        settledAmount: a.settledAmount,
        tdsDeducted: 0
      }));
    } else if (data.settlements && data.settlements.length > 0) {
      settlementsToApply = data.settlements.map((s) => ({
        invoiceId: new mongoose.Types.ObjectId(s.invoiceId),
        settledAmount: s.settledAmount,
        tdsDeducted: s.tdsDeducted || 0
      }));
    }

    // Validate settlement totals against payment capacity
    const totalCapacity =
      data.totalAmount + (data.tdsAmount || 0) + (data.discountAmount || 0);
    const settlementSum = settlementsToApply.reduce(
      (acc, s) => acc + s.settledAmount,
      0
    );

    if (settlementSum > totalCapacity + 0.005) {
      throw new ApiError(
        400,
        `Settlement total (${settlementSum}) exceeds received amount + TDS + discount (${totalCapacity})`
      );
    }

    // 1. Generate sequence receipt number within the transaction session
    const receiptNo = await getNextReceiptNumber(tenantId, 'RCT-', session);

    // 2. Process each invoice settlement atomically
    for (const item of settlementsToApply) {
      const invoice = await Invoice.findOne({
        _id: item.invoiceId,
        tenantId
      }).session(session);

      if (!invoice) {
        throw new ApiError(404, `Invoice ${item.invoiceId} not found`);
      }

      if (invoice.status === 'Draft' || invoice.status === 'Cancelled') {
        throw new ApiError(
          400,
          `Cannot settle invoice ${invoice.invoiceNo} in '${invoice.status}' status`
        );
      }

      const currentDue = invoice.totals.amountDue;
      if (item.settledAmount > currentDue + 0.005) {
        throw new ApiError(
          400,
          `Settled amount (${item.settledAmount}) exceeds balance due (${currentDue}) for invoice ${invoice.invoiceNo}`
        );
      }

      // Factor in applied credit notes
      const creditNotes = await CreditNote.find({
        tenantId,
        invoiceId: invoice._id,
        status: { $ne: 'Cancelled' }
      });
      const totalCreditApplied = creditNotes.reduce(
        (sum, cn) => sum + (cn.creditAppliedToInvoice || cn.totals?.grandTotal || 0),
        0
      );

      invoice.totals.amountPaid =
        Math.round((invoice.totals.amountPaid + item.settledAmount) * 100) / 100;
      invoice.totals.amountDue = Math.max(
        0,
        Math.round((invoice.totals.grandTotal - invoice.totals.amountPaid - totalCreditApplied) * 100) / 100
      );

      invoice.status = invoice.totals.amountDue <= 0 ? 'Paid' : 'Partially Paid';
      await invoice.save({ session });
    }

    // 3. Create the receipt document within the transaction
    const unallocatedAmount = Math.max(0, Math.round((totalCapacity - settlementSum) * 100) / 100);

    const [receipt] = await Receipt.create(
      [
        {
          tenantId,
          clientId: new mongoose.Types.ObjectId(data.clientId),
          receiptNo,
          date: data.date ? new Date(data.date) : new Date(),
          paymentMode: data.paymentMode || 'Bank Transfer',
          referenceNumber: data.referenceNumber,
          totalAmount: data.totalAmount,
          tdsAmount: data.tdsAmount || 0,
          discountAmount: data.discountAmount || 0,
          notes: data.notes,
          settlements: settlementsToApply,
          unallocatedAmount
        }
      ],
      { session }
    );

    // 4. Commit transaction
    await session.commitTransaction();
    return receipt;
  } catch (error) {
    // Abort transaction on any failure to guarantee ACID rollback
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Applies unallocated advance receipts towards an unpaid/partially-paid invoice.
 */
export const applyAdvanceToInvoiceService = async (
  tenantId: mongoose.Types.ObjectId,
  invoiceId: string,
  clientId?: mongoose.Types.ObjectId,
  specificReceiptId?: string,
  amountToApply?: number
) => {
  const query: any = { _id: invoiceId, tenantId };
  if (clientId) {
    query.clientId = clientId;
  }
  const invoice = await Invoice.findOne(query);
  if (!invoice) {
    throw new ApiError(404, 'Invoice not found');
  }

  if (invoice.totals.amountDue <= 0 || invoice.status === 'Paid') {
    throw new ApiError(400, 'Invoice is already settled');
  }

  // Find unallocated advance receipts for this client
  const receiptQuery: any = {
    tenantId,
    clientId: invoice.clientId,
    unallocatedAmount: { $gt: 0 }
  };
  if (specificReceiptId) {
    receiptQuery._id = specificReceiptId;
  }

  const advanceReceipts = await Receipt.find(receiptQuery).sort({ date: 1, createdAt: 1 });
  const totalAdvanceAvailable = advanceReceipts.reduce(
    (sum, r) => sum + (r.unallocatedAmount || 0),
    0
  );

  if (totalAdvanceAvailable <= 0) {
    throw new ApiError(400, 'No unallocated advance payments available for this client');
  }

  let remainingDue = invoice.totals.amountDue;
  if (amountToApply && amountToApply > 0) {
    remainingDue = Math.min(remainingDue, amountToApply);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let totalSettledFromAdvance = 0;

    for (const receipt of advanceReceipts) {
      if (remainingDue <= 0) break;

      const allocate = Math.min(receipt.unallocatedAmount, remainingDue);
      if (allocate > 0) {
        receipt.unallocatedAmount = Math.round((receipt.unallocatedAmount - allocate) * 100) / 100;
        receipt.settlements.push({
          invoiceId: invoice._id as mongoose.Types.ObjectId,
          settledAmount: allocate
        });
        await receipt.save({ session });

        remainingDue -= allocate;
        totalSettledFromAdvance += allocate;
      }
    }

    // Factor in applied credit notes
    const creditNotes = await CreditNote.find({
      tenantId,
      invoiceId: invoice._id,
      status: { $ne: 'Cancelled' }
    });
    const totalCreditApplied = creditNotes.reduce(
      (sum, cn) => sum + (cn.creditAppliedToInvoice || cn.totals?.grandTotal || 0),
      0
    );

    invoice.totals.amountPaid = Math.round(((invoice.totals.amountPaid || 0) + totalSettledFromAdvance) * 100) / 100;
    invoice.totals.amountDue = Math.max(
      0,
      Math.round((invoice.totals.grandTotal - invoice.totals.amountPaid - totalCreditApplied) * 100) / 100
    );
    invoice.status = invoice.totals.amountDue <= 0 ? 'Paid' : 'Partially Paid';
    await invoice.save({ session });

    await session.commitTransaction();

    return {
      invoice,
      settledAmount: totalSettledFromAdvance,
      remainingAdvance: totalAdvanceAvailable - totalSettledFromAdvance
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
