import mongoose from 'mongoose';
import { Invoice } from '../models/Invoice';
import { Receipt } from '../models/Receipt';
import { CreditNote } from '../models/CreditNote';
import { Client } from '../modules/clients/schemas';
import { ApiError } from '../common/errors/api-error';

export interface LedgerOptions {
  from?: string | Date;
  to?: string | Date;
}

export const calculateClientLedger = async (
  tenantId: mongoose.Types.ObjectId,
  clientId: string,
  options: LedgerOptions = {}
) => {
  const client = await Client.findOne({ _id: clientId, tenantId }).lean();
  if (!client) {
    throw new ApiError(404, 'Client not found');
  }

  const baseOpeningBalance = client.openingBalance || 0;
  let effectiveOpeningBalance = baseOpeningBalance;

  const invoiceQuery: any = {
    tenantId,
    clientId,
    status: { $ne: 'Cancelled' }
  };

  const receiptQuery: any = {
    tenantId,
    clientId
  };

  const creditNoteQuery: any = {
    tenantId,
    clientId,
    status: { $ne: 'Cancelled' }
  };

  // If a 'from' date filter is provided, calculate rolling balance of prior records
  if (options.from) {
    const fromDate = new Date(options.from);

    const [priorInvoices, priorReceipts, priorCreditNotes] = await Promise.all([
      Invoice.find({
        tenantId,
        clientId,
        status: { $ne: 'Cancelled' },
        date: { $lt: fromDate }
      }).lean(),
      Receipt.find({
        tenantId,
        clientId,
        date: { $lt: fromDate }
      }).lean(),
      CreditNote.find({
        tenantId,
        clientId,
        status: { $ne: 'Cancelled' },
        date: { $lt: fromDate }
      }).lean()
    ]);

    const priorDebits = priorInvoices.reduce(
      (sum, inv) => sum + (inv.totals?.grandTotal || 0),
      0
    );
    const priorCredits =
      priorReceipts.reduce((sum, rct) => sum + (rct.totalAmount || 0), 0) +
      priorCreditNotes.reduce((sum, cn) => sum + (cn.totals?.grandTotal || 0), 0);

    effectiveOpeningBalance =
      Math.round((baseOpeningBalance + priorDebits - priorCredits) * 100) / 100;

    invoiceQuery.date = { $gte: fromDate };
    receiptQuery.date = { $gte: fromDate };
    creditNoteQuery.date = { $gte: fromDate };
  }

  if (options.to) {
    const toDate = new Date(options.to);
    // Include the entire 'to' day if passed as YYYY-MM-DD
    if (typeof options.to === 'string' && options.to.length === 10) {
      toDate.setHours(23, 59, 59, 999);
    }
    invoiceQuery.date = { ...(invoiceQuery.date || {}), $lte: toDate };
    receiptQuery.date = { ...(receiptQuery.date || {}), $lte: toDate };
    creditNoteQuery.date = { ...(creditNoteQuery.date || {}), $lte: toDate };
  }

  // Fetch period entries
  const [invoices, receipts, creditNotes] = await Promise.all([
    Invoice.find(invoiceQuery).lean(),
    Receipt.find(receiptQuery).lean(),
    CreditNote.find(creditNoteQuery).populate('invoiceId', 'invoiceNo').lean()
  ]);

  // Unify entries into single stream
  const entries: Array<{
    date: Date;
    createdAt?: Date;
    type: 'Invoice' | 'Receipt' | 'Credit Note';
    referenceNo: string;
    referenceId: any;
    invoiceNo?: string;
    debit: number;
    credit: number;
    status: string;
    particulars: string;
    items?: any[];
    paymentMode?: string;
    referenceNumber?: string;
    unallocatedCredit?: number;
    balance?: number;
  }> = [
    ...invoices.map((inv) => ({
      date: inv.date,
      createdAt: inv.createdAt,
      type: 'Invoice' as const,
      referenceNo: inv.invoiceNo,
      referenceId: inv._id,
      debit: inv.totals?.grandTotal || 0,
      credit: 0,
      status: inv.status,
      particulars:
        inv.items?.map((it: any) => it.particulars).join(', ') || 'Invoice',
      items: inv.items
    })),
    ...receipts.map((rct) => ({
      date: rct.date,
      createdAt: rct.createdAt,
      type: 'Receipt' as const,
      referenceNo: rct.receiptNo,
      referenceId: rct._id,
      debit: 0,
      credit: rct.totalAmount,
      status: 'Completed',
      particulars: `Payment via ${rct.paymentMode}${
        rct.referenceNumber ? ` (${rct.referenceNumber})` : ''
      }`,
      paymentMode: rct.paymentMode,
      referenceNumber: rct.referenceNumber
    })),
    ...creditNotes.map((cn: any) => ({
      date: cn.date,
      createdAt: cn.createdAt,
      type: 'Credit Note' as const,
      referenceNo: cn.creditNoteNo,
      referenceId: cn._id,
      invoiceNo: cn.invoiceId?.invoiceNo || 'N/A',
      debit: 0,
      credit: cn.totals?.grandTotal || 0,
      status: cn.status,
      particulars: `Credit Note for Inv #${cn.invoiceId?.invoiceNo || 'N/A'}${
        cn.reason ? ` - ${cn.reason}` : ''
      }`,
      items: cn.items,
      unallocatedCredit: cn.unallocatedCredit
    }))
  ];

  // Sort chronologically (date ascending, then createdAt ascending)
  entries.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return createdA - createdB;
  });

  // Calculate running balance server-side
  let runningBalance = effectiveOpeningBalance;
  let totalDebits = 0;
  let totalCredits = 0;
  let totalCreditNotes = 0;

  for (const entry of entries) {
    totalDebits += entry.debit;
    totalCredits += entry.credit;
    if (entry.type === 'Credit Note') {
      totalCreditNotes += entry.credit;
    }
    runningBalance =
      Math.round((runningBalance + entry.debit - entry.credit) * 100) / 100;
    entry.balance = runningBalance;
  }

  return {
    client: {
      _id: client._id,
      name: client.name,
      fileNo: client.fileNo,
      entityType: client.entityType,
      pan: client.pan,
      gstin: client.gstin
    },
    openingBalance: effectiveOpeningBalance,
    entries,
    totalDebits: Math.round(totalDebits * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
    totalCreditNotes: Math.round(totalCreditNotes * 100) / 100,
    closingBalance: runningBalance
  };
};

