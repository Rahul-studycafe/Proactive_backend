import mongoose from 'mongoose';
import { Organization } from '../modules/auth/schemas';

/**
 * Atomically increments and fetches the next invoice number for a tenant.
 * Uses findOneAndUpdate to prevent race conditions when multiple invoices are generated concurrently.
 * 
 * @param tenantId The organization's ObjectId
 * @param prefix Optional prefix (default: 'INV-')
 * @returns Formatted sequence string (e.g. 'INV-001')
 */
export const getNextInvoiceNumber = async (
  tenantId: mongoose.Types.ObjectId,
  prefix: string = 'INV-',
  session?: mongoose.ClientSession
): Promise<string> => {
  const options: mongoose.QueryOptions = { new: true, select: 'lastInvoiceNumber' };
  if (session) options.session = session;

  const org = await Organization.findOneAndUpdate(
    { _id: tenantId },
    { $inc: { lastInvoiceNumber: 1 } },
    options
  );

  if (!org) {
    throw new Error(`Organization with id ${tenantId} not found`);
  }

  // Format with leading zeros: INV-001
  const numberPart = (org.lastInvoiceNumber || 1).toString().padStart(3, '0');
  return `${prefix}${numberPart}`;
};

/**
 * Atomically increments and fetches the next receipt number for a tenant.
 * Supports session for MongoDB multi-document ACID transactions.
 * 
 * @param tenantId The organization's ObjectId
 * @param prefix Optional prefix (default: 'RCT-')
 * @param session Optional Mongoose ClientSession for transactions
 * @returns Formatted sequence string (e.g. 'RCT-001')
 */
export const getNextReceiptNumber = async (
  tenantId: mongoose.Types.ObjectId,
  prefix: string = 'RCT-',
  session?: mongoose.ClientSession
): Promise<string> => {
  const options: mongoose.QueryOptions = { new: true, select: 'lastReceiptNumber' };
  if (session) options.session = session;

  const org = await Organization.findOneAndUpdate(
    { _id: tenantId },
    { $inc: { lastReceiptNumber: 1 } },
    options
  );

  if (!org) {
    throw new Error(`Organization with id ${tenantId} not found`);
  }

  // Format with leading zeros: RCT-001
  const numberPart = (org.lastReceiptNumber || 1).toString().padStart(3, '0');
  return `${prefix}${numberPart}`;
};

/**
 * Atomically increments and fetches the next credit note number for a tenant.
 * Supports session for MongoDB multi-document ACID transactions.
 * 
 * @param tenantId The organization's ObjectId
 * @param prefix Optional prefix (default: 'CN-')
 * @param session Optional Mongoose ClientSession for transactions
 * @returns Formatted sequence string (e.g. 'CN-001')
 */
export const getNextCreditNoteNumber = async (
  tenantId: mongoose.Types.ObjectId,
  prefix: string = 'CN-',
  session?: mongoose.ClientSession
): Promise<string> => {
  const options: mongoose.QueryOptions = { new: true, select: 'lastCreditNoteNumber' };
  if (session) options.session = session;

  const org = await Organization.findOneAndUpdate(
    { _id: tenantId },
    { $inc: { lastCreditNoteNumber: 1 } },
    options
  );

  if (!org) {
    throw new Error(`Organization with id ${tenantId} not found`);
  }

  // Format with leading zeros: CN-001
  const numberPart = (org.lastCreditNoteNumber || 1).toString().padStart(3, '0');
  return `${prefix}${numberPart}`;
};

/**
 * Atomically increments and fetches the next document request number for a tenant.
 * Supports session for MongoDB multi-document ACID transactions.
 * 
 * @param tenantId The organization's ObjectId
 * @param prefix Optional prefix (default: 'DREQ-')
 * @param session Optional Mongoose ClientSession for transactions
 * @returns Formatted sequence string (e.g. 'DREQ-1001')
 */
export const getNextDocumentRequestNumber = async (
  tenantId: mongoose.Types.ObjectId,
  prefix: string = 'DREQ-',
  session?: mongoose.ClientSession
): Promise<string> => {
  const options: mongoose.QueryOptions = { new: true, select: 'lastDocumentRequestNumber' };
  if (session) options.session = session;

  const org = await Organization.findOneAndUpdate(
    { _id: tenantId },
    { $inc: { lastDocumentRequestNumber: 1 } },
    options
  );

  if (!org) {
    throw new Error(`Organization with id ${tenantId} not found`);
  }

  // Format starting from 1001 or 3-digit: DREQ-1001
  const numberPart = (1000 + (org.lastDocumentRequestNumber || 1)).toString();
  return `${prefix}${numberPart}`;
};

/**
 * Atomically increments and fetches the next expense number for a tenant.
 * Supports session for MongoDB multi-document ACID transactions.
 * 
 * @param tenantId The organization's ObjectId
 * @param prefix Optional prefix (default: 'EXP-')
 * @param session Optional Mongoose ClientSession for transactions
 * @returns Formatted sequence string (e.g. 'EXP-001')
 */
export const getNextExpenseNumber = async (
  tenantId: mongoose.Types.ObjectId,
  prefix: string = 'EXP-',
  session?: mongoose.ClientSession
): Promise<string> => {
  const options: mongoose.QueryOptions = { new: true, select: 'lastExpenseNumber' };
  if (session) options.session = session;

  const org = await Organization.findOneAndUpdate(
    { _id: tenantId },
    { $inc: { lastExpenseNumber: 1 } },
    options
  );

  if (!org) {
    throw new Error(`Organization with id ${tenantId} not found`);
  }

  // Format with leading zeros: EXP-001
  const numberPart = (org.lastExpenseNumber || 1).toString().padStart(3, '0');
  return `${prefix}${numberPart}`;
};

/**
 * Atomically increments and fetches the next quotation number for a tenant.
 * Supports session for MongoDB multi-document ACID transactions.
 * 
 * @param tenantId The organization's ObjectId
 * @param prefix Optional prefix (default: 'QT-')
 * @param session Optional Mongoose ClientSession for transactions
 * @returns Formatted sequence string (e.g. 'QT-001')
 */
export const getNextQuotationNumber = async (
  tenantId: mongoose.Types.ObjectId,
  prefix: string = 'QT-',
  session?: mongoose.ClientSession
): Promise<string> => {
  const options: mongoose.QueryOptions = { new: true, select: 'lastQuotationNumber' };
  if (session) options.session = session;

  const org = await Organization.findOneAndUpdate(
    { _id: tenantId },
    { $inc: { lastQuotationNumber: 1 } },
    options
  );

  if (!org) {
    throw new Error(`Organization with id ${tenantId} not found`);
  }

  // Format with leading zeros: QT-001
  const numberPart = (org.lastQuotationNumber || 1).toString().padStart(3, '0');
  return `${prefix}${numberPart}`;
};




