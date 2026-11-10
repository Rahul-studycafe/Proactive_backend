import mongoose from 'mongoose';
import { TenantConfiguration, ITenantConfiguration } from '../models/TenantConfiguration';
import { TAXONOMY_REGISTRY } from '../config/taxonomy-registry';
import { ApiError } from '../common/errors/api-error';

export class TenantConfigurationService {
  /**
   * Initializes default configurations for a tenant if they do not exist.
   * Safe to call multiple times (idempotent).
   */
  static async seedDefaultsForTenant(tenantId: mongoose.Types.ObjectId | string): Promise<number> {
    const orgId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;

    const existing = await TenantConfiguration.find({
      tenantId: orgId,
      isDeleted: false,
    }).select('categoryKey value label');

    const existingMap = new Set(existing.map((e) => `${e.categoryKey}::${e.value.toLowerCase()}`));
    const existingLabelMap = new Set(existing.map((e) => `${e.categoryKey}::${e.label.toLowerCase()}`));

    const ops: any[] = [];

    for (const [categoryKey, category] of Object.entries(TAXONOMY_REGISTRY)) {
      category.defaults.forEach((def, index) => {
        const valKey = `${categoryKey}::${def.value.toLowerCase()}`;
        const lblKey = `${categoryKey}::${def.label.toLowerCase()}`;

        if (!existingMap.has(valKey) && !existingLabelMap.has(lblKey)) {
          ops.push({
            tenantId: orgId,
            categoryKey,
            value: def.value,
            label: def.label,
            color: def.color || null,
            metadata: def.metadata || {},
            sortOrder: index,
            isActive: true,
            isSystemDefault: true,
            isDeleted: false,
          });
          existingMap.add(valKey);
          existingLabelMap.add(lblKey);
        }
      });
    }

    if (ops.length > 0) {
      await TenantConfiguration.insertMany(ops, { ordered: false });
    }

    return ops.length;
  }

  /**
   * Retrieves category metadata overview.
   */
  static async getCategories(tenantId: mongoose.Types.ObjectId | string) {
    const orgId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;

    let counts = await TenantConfiguration.aggregate([
      { $match: { tenantId: orgId, isDeleted: false } },
      { $group: { _id: '$categoryKey', count: { $sum: 1 }, activeCount: { $sum: { $cond: ['$isActive', 1, 0] } } } },
    ]);

    const existingKeys = new Set(counts.map((c) => c._id));
    const missingKeys = Object.keys(TAXONOMY_REGISTRY).some((k) => !existingKeys.has(k));
    if (missingKeys) {
      await this.seedDefaultsForTenant(orgId);
      counts = await TenantConfiguration.aggregate([
        { $match: { tenantId: orgId, isDeleted: false } },
        { $group: { _id: '$categoryKey', count: { $sum: 1 }, activeCount: { $sum: { $cond: ['$isActive', 1, 0] } } } },
      ]);
    }

    const countMap: Record<string, { count: number; activeCount: number }> = {};
    counts.forEach((c) => {
      countMap[c._id] = { count: c.count, activeCount: c.activeCount };
    });

    return Object.entries(TAXONOMY_REGISTRY).map(([key, cat]) => ({
      key,
      name: cat.name,
      title: cat.name,
      description: cat.description,
      supportsColor: !!cat.supportsColor,
      supportsMetadata: !!cat.supportsMetadata,
      totalCount: countMap[key]?.count || 0,
      activeCount: countMap[key]?.activeCount || 0,
    }));
  }

  /**
   * Retrieves options for a given category. Auto-seeds if empty.
   */
  static async getOptionsForCategory(
    tenantId: mongoose.Types.ObjectId | string,
    categoryKey: string,
    includeInactive = false
  ): Promise<ITenantConfiguration[]> {
    const orgId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;

    const count = await TenantConfiguration.countDocuments({
      tenantId: orgId,
      categoryKey,
      isDeleted: false,
    });

    if (count === 0 && TAXONOMY_REGISTRY[categoryKey]) {
      await this.seedDefaultsForTenant(orgId);
    }

    const query: any = {
      tenantId: orgId,
      categoryKey,
      isDeleted: false,
    };

    if (!includeInactive) {
      query.isActive = true;
    }

    return TenantConfiguration.find(query).sort({ sortOrder: 1, createdAt: 1 });
  }

  /**
   * Adds an option. Idempotently returns existing if already active, or reactivates if inactive.
   */
  static async addOption(
    tenantId: mongoose.Types.ObjectId | string,
    userId: mongoose.Types.ObjectId | string | undefined,
    categoryKey: string,
    data: {
      label: string;
      value?: string;
      color?: string | null;
      description?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<ITenantConfiguration> {
    const orgId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;
    const authorId = userId ? (typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId) : null;

    const label = data.label.trim();
    if (!label) {
      throw new ApiError(400, 'Option label is required', 'VALIDATION_FAILED');
    }

    const value = (data.value || label).trim();

    // Check if option already exists
    const existing = await TenantConfiguration.findOne({
      tenantId: orgId,
      categoryKey,
      isDeleted: false,
      $or: [
        { value: { $regex: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { label: { $regex: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
      ],
    });

    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        existing.label = label;
        if (data.color) existing.color = data.color;
        if (data.description !== undefined) existing.description = data.description;
        if (data.metadata) existing.metadata = { ...existing.metadata, ...data.metadata };
        existing.updatedBy = authorId;
        await existing.save();
      }
      return existing;
    }

    const highestSort = await TenantConfiguration.findOne({
      tenantId: orgId,
      categoryKey,
      isDeleted: false,
    })
      .sort({ sortOrder: -1 })
      .select('sortOrder');

    const sortOrder = highestSort ? highestSort.sortOrder + 1 : 0;

    return TenantConfiguration.create({
      tenantId: orgId,
      categoryKey,
      value,
      label,
      description: data.description,
      color: data.color || null,
      metadata: data.metadata || {},
      sortOrder,
      isActive: true,
      isSystemDefault: false,
      createdBy: authorId,
    });
  }

  /**
   * Updates an option's display properties.
   */
  static async updateOption(
    tenantId: mongoose.Types.ObjectId | string,
    userId: mongoose.Types.ObjectId | string | undefined,
    id: string,
    data: {
      label?: string;
      description?: string;
      color?: string | null;
      metadata?: Record<string, any>;
      sortOrder?: number;
      isActive?: boolean;
    }
  ): Promise<ITenantConfiguration> {
    const orgId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;
    const authorId = userId ? (typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId) : null;

    const option = await TenantConfiguration.findOne({
      _id: id,
      tenantId: orgId,
      isDeleted: false,
    });

    if (!option) {
      throw new ApiError(404, 'Configuration option not found', 'NOT_FOUND');
    }

    if (data.label !== undefined) {
      const cleanLabel = data.label.trim();
      if (!cleanLabel) throw new ApiError(400, 'Label cannot be empty', 'VALIDATION_FAILED');

      // Check if duplicate label exists in same category
      const dup = await TenantConfiguration.findOne({
        _id: { $ne: option._id },
        tenantId: orgId,
        categoryKey: option.categoryKey,
        isDeleted: false,
        label: { $regex: new RegExp(`^${cleanLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      });

      if (dup) {
        throw new ApiError(409, `An option with label "${cleanLabel}" already exists in this category`, 'DUPLICATE_OPTION');
      }

      option.label = cleanLabel;
    }

    if (data.description !== undefined) option.description = data.description;
    if (data.color !== undefined) option.color = data.color;
    if (data.metadata !== undefined) option.metadata = { ...option.metadata, ...data.metadata };
    if (data.sortOrder !== undefined) option.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) option.isActive = data.isActive;
    option.updatedBy = authorId;

    await option.save();
    return option;
  }

  /**
   * Toggles the active status of an option.
   */
  static async toggleOptionStatus(
    tenantId: mongoose.Types.ObjectId | string,
    id: string
  ): Promise<ITenantConfiguration> {
    const orgId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;

    const option = await TenantConfiguration.findOne({
      _id: id,
      tenantId: orgId,
      isDeleted: false,
    });

    if (!option) {
      throw new ApiError(404, 'Configuration option not found', 'NOT_FOUND');
    }

    option.isActive = !option.isActive;
    await option.save();
    return option;
  }

  /**
   * Soft-deletes or deactivates an option with reference checks.
   */
  static async deleteOption(
    tenantId: mongoose.Types.ObjectId | string,
    id: string
  ): Promise<{ success: boolean; message: string; deactivated: boolean }> {
    const orgId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;

    const option = await TenantConfiguration.findOne({
      _id: id,
      tenantId: orgId,
      isDeleted: false,
    });

    if (!option) {
      throw new ApiError(404, 'Configuration option not found', 'NOT_FOUND');
    }

    const isReferenced = await this.checkOptionUsage(orgId, option);

    if (isReferenced) {
      // Soft-deactivate to protect historic data
      option.isActive = false;
      await option.save();
      return {
        success: true,
        message: `"${option.label}" is referenced by existing firm records. It has been deactivated instead of deleted so historical records remain safe.`,
        deactivated: true,
      };
    }

    option.isDeleted = true;
    option.deletedAt = new Date();
    await option.save();

    return {
      success: true,
      message: `"${option.label}" was deleted successfully.`,
      deactivated: false,
    };
  }

  /**
   * Reorders options within a category.
   */
  static async reorderOptions(
    tenantId: mongoose.Types.ObjectId | string,
    categoryKey: string,
    orderedIds: string[]
  ): Promise<void> {
    const orgId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;

    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, tenantId: orgId, categoryKey },
        update: { $set: { sortOrder: index } },
      },
    }));

    if (bulkOps.length > 0) {
      await TenantConfiguration.bulkWrite(bulkOps);
    }
  }

  /**
   * Checks whether an option is referenced in existing documents across models.
   */
  private static async checkOptionUsage(
    tenantId: mongoose.Types.ObjectId,
    option: ITenantConfiguration
  ): Promise<boolean> {
    const val = option.value;
    const label = option.label;
    const matchTargets = [val, label];

    try {
      switch (option.categoryKey) {
        case 'document_types': {
          const docModel = mongoose.model('PhysicalDocument');
          const count = await docModel.countDocuments({
            tenantId,
            documentType: { $in: matchTargets },
          });
          return count > 0;
        }

        case 'office_storage_locations': {
          const docModel = mongoose.model('PhysicalDocument');
          const dscModel = mongoose.model('DSC');
          const [docCount, dscCount] = await Promise.all([
            docModel.countDocuments({ tenantId, location: { $in: matchTargets } }),
            dscModel.countDocuments({ tenantId, physicalLocation: { $in: matchTargets } }),
          ]);
          return docCount > 0 || dscCount > 0;
        }

        case 'usb_token_types': {
          const dscModel = mongoose.model('DSC');
          const count = await dscModel.countDocuments({
            tenantId,
            tokenType: { $in: matchTargets },
          });
          return count > 0;
        }

        case 'issuing_authorities': {
          const dscModel = mongoose.model('DSC');
          const count = await dscModel.countDocuments({
            tenantId,
            issuingAuthority: { $in: matchTargets },
          });
          return count > 0;
        }

        case 'certificate_classes': {
          const dscModel = mongoose.model('DSC');
          const count = await dscModel.countDocuments({
            tenantId,
            certificateClass: { $in: matchTargets },
          });
          return count > 0;
        }

        case 'portals_and_authorities': {
          const passModel = mongoose.model('ClientPassword');
          const count = await passModel.countDocuments({
            tenantId,
            portalName: { $in: matchTargets },
          });
          return count > 0;
        }

        case 'payment_modes': {
          const rctModel = mongoose.model('Receipt');
          const expModel = mongoose.model('Expense');
          const [rctCount, expCount] = await Promise.all([
            rctModel.countDocuments({ tenantId, paymentMode: { $in: matchTargets } }),
            expModel.countDocuments({ tenantId, paymentMode: { $in: matchTargets } }),
          ]);
          return rctCount > 0 || expCount > 0;
        }

        case 'client_entity_types': {
          const clientModel = mongoose.model('Client');
          const count = await clientModel.countDocuments({
            tenantId,
            entityType: { $in: matchTargets },
          });
          return count > 0;
        }

        case 'client_groups': {
          const clientModel = mongoose.model('Client');
          const count = await clientModel.countDocuments({
            tenantId,
            group: { $in: matchTargets },
          });
          return count > 0;
        }

        case 'tags': {
          const clientModel = mongoose.model('Client');
          const taskModel = mongoose.model('Task');
          const [clientCount, taskCount] = await Promise.all([
            clientModel.countDocuments({ tenantId, tags: { $in: matchTargets } }),
            taskModel.countDocuments({ tenantId, tags: { $in: matchTargets } }),
          ]);
          return clientCount > 0 || taskCount > 0;
        }

        case 'credit_note_reasons': {
          const cnModel = mongoose.model('CreditNote');
          const count = await cnModel.countDocuments({
            tenantId,
            reason: { $in: matchTargets },
          });
          return count > 0;
        }

        default:
          return false;
      }
    } catch {
      // If a model is not registered in this runtime, safely treat as unreferenced
      return false;
    }
  }
}
