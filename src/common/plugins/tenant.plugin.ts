import { Schema } from 'mongoose';
import { getTenantId } from '../../utils/tenant-context'; // Force IDE refresh

/**
 * Mongoose plugin that enforces automatic tenant isolation on all queries and saves.
 */
export function tenantPlugin(schema: Schema) {
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

  function applyTenantFilter(this: import('mongoose').Query<unknown, unknown>) {
    if (this.getOptions?.()?.skipTenantPlugin) {
      return;
    }

    const tenantId = getTenantId();
    if (!tenantId) {
      return;
    }

    if (this.model && this.model.schema.path('tenantId')) {
      const currentFilter = this.getFilter?.();
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
