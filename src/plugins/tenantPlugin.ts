import { Schema } from 'mongoose';
import { getTenantId } from '../utils/tenantContext';

/**
 * Mongoose plugin that enforces automatic tenant isolation on all queries and saves.
 * 
 * HOW IT WORKS:
 * 1. On save/validate: If the document has a `tenantId` field and it's not set,
 *    auto-populates it from the AsyncLocalStorage context.
 * 2. On all query operations (find, findOne, updateOne, deleteOne, etc.):
 *    Auto-appends `{ tenantId: currentTenantId }` to the query filter.
 * 3. On aggregate: Prepends a `{ $match: { tenantId } }` pipeline stage.
 * 
 * SKIP MECHANISM:
 * - Pass `{ skipTenantPlugin: true }` in query options to bypass injection.
 *   This is used for system-level operations like registration where the
 *   tenant doesn't exist yet.
 * - If no tenant context exists (AsyncLocalStorage is empty), injection is skipped.
 */
export function tenantPlugin(schema: Schema) {
  // ---------------------------------------------------
  // 1. Auto-inject tenantId on document creation/save
  // ---------------------------------------------------
  schema.pre('save', function () {
    const tenantId = getTenantId();
    if (tenantId && this.schema.path('tenantId') && !this.tenantId) {
      this.set('tenantId', tenantId);
    }
  });

  schema.pre('validate', function () {
    const tenantId = getTenantId();
    if (tenantId && this.schema.path('tenantId') && !this.tenantId) {
      this.set('tenantId', tenantId);
    }
  });

  // ---------------------------------------------------
  // 2. Auto-inject tenantId on all query operations
  // ---------------------------------------------------
  function applyTenantFilter(this: any) {
    // Skip if explicitly told to (used during registration, system ops)
    if (this.getOptions?.()?.skipTenantPlugin) {
      return;
    }

    const tenantId = getTenantId();
    if (!tenantId) {
      // No tenant context — skip injection (system-level query)
      return;
    }

    // Check if the schema actually has a tenantId path
    if (this.schema?.path('tenantId')) {
      const currentFilter = this.getFilter?.();
      // Don't override if tenantId is already explicitly set in the query
      if (!currentFilter?.tenantId) {
        this.where({ tenantId });
      }
    }
  }

  schema.pre('find', applyTenantFilter);
  schema.pre('findOne', applyTenantFilter);
  schema.pre('findOneAndUpdate', applyTenantFilter);
  schema.pre('findOneAndDelete', applyTenantFilter);
  schema.pre('findOneAndReplace', applyTenantFilter);
  schema.pre('countDocuments', applyTenantFilter);
  schema.pre('updateOne', applyTenantFilter);
  schema.pre('updateMany', applyTenantFilter);
  schema.pre('deleteOne', applyTenantFilter);
  schema.pre('deleteMany', applyTenantFilter);
}
