import mongoose from 'mongoose';
import { Invoice } from '../models/Invoice';
import { Receipt } from '../models/Receipt';
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

  // If a 'from' date filter is provided, calculate rolling balance of prior records
  if (options.from) {
    const fromDate = new Date(options.from);

    const [priorInvoices, priorReceipts] = await Promise.all([
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
      }).lean()
    ]);

    const priorDebits = priorInvoices.reduce(
      (sum, inv) => sum + (inv.totals?.grandTotal || 0),
      0
    );
    const priorCredits = priorReceipts.reduce(
      (sum, rct) => sum + (rct.totalAmount || 0),
      0
    );

    effectiveOpeningBalance =
      Math.round((baseOpeningBalance + priorDebits - priorCredits) * 100) / 100;

    invoiceQuery.date = { $gte: fromDate };
    receiptQuery.date = { $gte: fromDate };
  }

  if (options.to) {
    const toDate = new Date(options.to);
    // Include the entire 'to' day if passed as YYYY-MM-DD
    if (typeof options.to === 'string' && options.to.length === 10) {
      toDate.setHours(23, 59, 59, 999);
    }
    invoiceQuery.date = { ...(invoiceQuery.date || {}), $lte: toDate };
    receiptQuery.date = { ...(receiptQuery.date || {}), $lte: toDate };
  }

  // Fetch period entries
  const [invoices, receipts] = await Promise.all([
    Invoice.find(invoiceQuery).lean(),
    Receipt.find(receiptQuery).lean()
  ]);

  // Unify entries into single stream
  const entries: Array<{
    date: Date;
    createdAt?: Date;
    type: 'Invoice' | 'Receipt';
    referenceNo: string;
    referenceId: any;
    debit: number;
    credit: number;
    status: string;
    particulars: string;
    items?: any[];
    paymentMode?: string;
    referenceNumber?: string;
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

  for (const entry of entries) {
    totalDebits += entry.debit;
    totalCredits += entry.credit;
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
    closingBalance: runningBalance
  };
};
