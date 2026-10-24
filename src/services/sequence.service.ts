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

