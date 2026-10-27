import mongoose, { Types } from 'mongoose';
import { create } from 'xmlbuilder2';
import { Invoice } from '../models/Invoice';
import { Receipt } from '../models/Receipt';
import { parseDateFilter } from './report.service';

export interface TallyExportQuery {
  startDate?: string;
  endDate?: string;
  type?: 'sales' | 'receipts' | 'all';
  billingEntityId?: string;
}

const formatTallyDate = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
};

/**
 * Phase 118: Generate Tally XML Envelope for TallyPrime / Tally.ERP 9 Import
 */
export const generateTallyXml = async (
  tenantId: Types.ObjectId,
  query: TallyExportQuery
): Promise<string> => {
  const exportType = query.type || 'all';
  const tenantObjId = new Types.ObjectId(tenantId);
  const dateFilter = parseDateFilter(query.startDate, query.endDate);

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('ENVELOPE')
    .ele('HEADER')
    .ele('TALLYREQUEST')
    .txt('Import Data')
    .up()
    .up()
    .ele('BODY')
    .ele('IMPORTDATA')
    .ele('REQUESTDATA')
    .ele('TALLYMESSAGE', { 'xmlns:UDF': 'TallyUDF' });

  // 1. Export Invoices as Sales Vouchers
  if (exportType === 'sales' || exportType === 'all') {
    const invMatch: Record<string, any> = {
      tenantId: tenantObjId,
      status: { $ne: 'Cancelled' }
    };
    if (query.billingEntityId && Types.ObjectId.isValid(query.billingEntityId)) {
      invMatch.billingEntityId = new Types.ObjectId(query.billingEntityId);
    }
    if (dateFilter) {
      invMatch.date = dateFilter;
    }

    const invoices = await Invoice.find(invMatch)
      .populate('clientId', 'name gstin state')
      .sort({ date: 1, invoiceNo: 1 });

    for (const inv of invoices) {
      const client = inv.clientId as any;
      const clientName = client?.name || 'Sundry Debtors';
      const invDate = formatTallyDate(inv.date || new Date());
      const grandTotal = inv.totals?.grandTotal || 0;
      const taxableValue = inv.totals?.totalTaxable || 0;
      const totalGst = inv.totals?.totalGst || 0;

      const vch = doc.ele('VOUCHER', { VCHTYPE: 'Sales', ACTION: 'Create' });
      vch.ele('DATE').txt(invDate);
      vch.ele('VOUCHERTYPENAME').txt('Sales');
      vch.ele('VOUCHERNUMBER').txt(inv.invoiceNo);
      vch.ele('PARTYLEDGERNAME').txt(clientName);
      vch.ele('NARRATION').txt(`Invoice ${inv.invoiceNo} billed to ${clientName}`);

      // Debit Sundry Debtors (Gross Amount)
      const partyEntry = vch.ele('ALLLEDGERENTRIES.LIST');
      partyEntry.ele('LEDGERNAME').txt(clientName);
      partyEntry.ele('ISDEEMEDPOSITIVE').txt('Yes');
      partyEntry.ele('AMOUNT').txt(`-${grandTotal.toFixed(2)}`);

      // Credit Professional Fees / Sales (Taxable Subtotal)
      const salesEntry = vch.ele('ALLLEDGERENTRIES.LIST');
      salesEntry.ele('LEDGERNAME').txt('Professional Fees');
      salesEntry.ele('ISDEEMEDPOSITIVE').txt('No');
      salesEntry.ele('AMOUNT').txt(taxableValue.toFixed(2));

      // Credit Tax Ledgers
      if (totalGst > 0) {
        const halfGst = (totalGst / 2).toFixed(2);
        // Output CGST
        const cgstEntry = vch.ele('ALLLEDGERENTRIES.LIST');
        cgstEntry.ele('LEDGERNAME').txt('Output CGST');
        cgstEntry.ele('ISDEEMEDPOSITIVE').txt('No');
        cgstEntry.ele('AMOUNT').txt(halfGst);

        // Output SGST
        const sgstEntry = vch.ele('ALLLEDGERENTRIES.LIST');
        sgstEntry.ele('LEDGERNAME').txt('Output SGST');
        sgstEntry.ele('ISDEEMEDPOSITIVE').txt('No');
        sgstEntry.ele('AMOUNT').txt(halfGst);
      }
    }
  }

  // 2. Export Receipts as Receipt Vouchers
  if (exportType === 'receipts' || exportType === 'all') {
    const rctMatch: Record<string, any> = {
      tenantId: tenantObjId
    };
    if (dateFilter) {
      rctMatch.date = dateFilter;
    }

    const receipts = await Receipt.find(rctMatch)
      .populate('clientId', 'name')
      .sort({ date: 1, receiptNo: 1 });

    for (const rct of receipts) {
      const client = rct.clientId as any;
      const clientName = client?.name || 'Sundry Debtors';
      const rctDate = formatTallyDate(rct.date || new Date());
      const totalAmount = rct.totalAmount || 0;
      const bankLedger =
        rct.paymentMode === 'Cash' ? 'Cash' : 'Bank Account / Collections';

      const vch = doc.ele('VOUCHER', { VCHTYPE: 'Receipt', ACTION: 'Create' });
      vch.ele('DATE').txt(rctDate);
      vch.ele('VOUCHERTYPENAME').txt('Receipt');
      vch.ele('VOUCHERNUMBER').txt(rct.receiptNo);
      vch.ele('PARTYLEDGERNAME').txt(clientName);
      vch.ele(
        'NARRATION'
      ).txt(
        `Receipt ${rct.receiptNo} received via ${rct.paymentMode}${
          rct.referenceNumber ? ' Ref: ' + rct.referenceNumber : ''
        }`
      );

      // Debit Bank/Cash
      const bankEntry = vch.ele('ALLLEDGERENTRIES.LIST');
      bankEntry.ele('LEDGERNAME').txt(bankLedger);
      bankEntry.ele('ISDEEMEDPOSITIVE').txt('Yes');
      bankEntry.ele('AMOUNT').txt(`-${totalAmount.toFixed(2)}`);

      // Credit Sundry Debtors
      const partyEntry = vch.ele('ALLLEDGERENTRIES.LIST');
      partyEntry.ele('LEDGERNAME').txt(clientName);
      partyEntry.ele('ISDEEMEDPOSITIVE').txt('No');
      partyEntry.ele('AMOUNT').txt(totalAmount.toFixed(2));
    }
  }

  return doc.end({ prettyPrint: true });
};
