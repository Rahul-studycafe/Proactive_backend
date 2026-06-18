import mongoose from 'mongoose';
import { Organization } from '../models/Organization';

/**
 * Atomically increments and fetches the next invoice number for a tenant.
 * Uses findOneAndUpdate to prevent race conditions when multiple invoices are generated concurrently.
 * 
 * @param tenantId The organization's ObjectId
 * @param prefix Optional prefix (default: 'INV-')
 * @returns Formatted sequence string (e.g. 'INV-001')
 */
export const getNextInvoiceNumber = async (tenantId: mongoose.Types.ObjectId, prefix: string = 'INV-'): Promise<string> => {
  const org = await Organization.findOneAndUpdate(
    { _id: tenantId },
    { $inc: { lastInvoiceNumber: 1 } },
    { new: true, select: 'lastInvoiceNumber' }
  );

  if (!org) {
    throw new Error(`Organization with id ${tenantId} not found`);
  }

  // Format with leading zeros: INV-001
  const numberPart = org.lastInvoiceNumber!.toString().padStart(3, '0');
  return `${prefix}${numberPart}`;
};
