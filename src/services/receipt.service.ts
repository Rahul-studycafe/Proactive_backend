import mongoose from 'mongoose';
import { Receipt, IReceiptSettlement } from '../models/Receipt';
import { Invoice } from '../models/Invoice';
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

      invoice.totals.amountPaid =
        Math.round((invoice.totals.amountPaid + item.settledAmount) * 100) / 100;
      invoice.totals.amountDue = Math.max(
        0,
        Math.round((invoice.totals.grandTotal - invoice.totals.amountPaid) * 100) / 100
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
