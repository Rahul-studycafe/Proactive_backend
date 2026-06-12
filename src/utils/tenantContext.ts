import { AsyncLocalStorage } from 'async_hooks';
import mongoose from 'mongoose';

interface TenantStore {
  tenantId: mongoose.Types.ObjectId;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

/**
 * Retrieves the current tenantId from the AsyncLocalStorage context.
 * Returns undefined if no tenant context has been set (e.g., during registration).
 */
export const getTenantId = (): mongoose.Types.ObjectId | undefined => {
  const store = tenantStorage.getStore();
  return store?.tenantId;
};

/**
 * Runs a callback within a tenant context.
 * Used by the authenticate middleware to scope the entire request lifecycle.
 */
export const runWithTenant = <T>(tenantId: mongoose.Types.ObjectId, fn: () => T): T => {
  return tenantStorage.run({ tenantId }, fn);
};
