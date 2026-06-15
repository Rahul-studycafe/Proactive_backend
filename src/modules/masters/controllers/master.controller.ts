import { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/async-handler';
import { sendSuccess } from '../../../common/responses/api-response';
import { ApiError } from '../../../common/errors/api-error';
import { Tag, ClientGroup, PaymentMode, ExpenseCategory, DocumentType, Holiday, TenantSettings, BillingEntity } from '../schemas';
import { User } from '../../auth/schemas';
import { Role } from '../../roles/schemas';
import { z } from 'zod';

// Generic CRUD Generator
const createMasterCrud = (Model: any, schema: z.ZodTypeAny) => {
  return {
    getAll: asyncHandler(async (req: Request, res: Response) => {
      const items = await Model.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
      sendSuccess(res, 200, 'Success', items);
    }),
    create: asyncHandler(async (req: Request, res: Response) => {
      const data = schema.parse(req.body);
      const item = await Model.create({ tenantId: req.tenantId, ...(data as any) });
      sendSuccess(res, 201, 'Created successfully', item);
    }),
    update: asyncHandler(async (req: Request, res: Response) => {
      const data = schema.parse(req.body);
      const item = await Model.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenantId },
        data,
        { new: true, runValidators: true }
      );
      if (!item) throw new ApiError(404, 'Item not found');
      sendSuccess(res, 200, 'Updated successfully', item);
    }),
    delete: asyncHandler(async (req: Request, res: Response) => {
      const item = await Model.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
      if (!item) throw new ApiError(404, 'Item not found');
      sendSuccess(res, 200, 'Deleted successfully', null);
    })
  };
};

// Standard Schemas
const standardSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  isActive: z.boolean().optional()
});

const tagSchema = standardSchema.extend({
  color: z.string().optional()
});

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  eventName: z.string().min(1, 'Event name is required')
});

// Generated Controllers
export const tagController = createMasterCrud(Tag, tagSchema);
export const clientGroupController = createMasterCrud(ClientGroup, standardSchema);
export const paymentModeController = createMasterCrud(PaymentMode, standardSchema);
export const expenseCategoryController = createMasterCrud(ExpenseCategory, standardSchema);
export const documentTypeController = createMasterCrud(DocumentType, standardSchema);
export const holidayController = createMasterCrud(Holiday, holidaySchema);

// Custom Field Definitions Schema
const customFieldSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  fieldType: z.enum(['text', 'number', 'select', 'date', 'email', 'phone']),
  options: z.array(z.string()).optional(),
  isRequired: z.boolean().optional(),
  orderIndex: z.number().optional()
});

// Tenant Settings Controller
export const settingsController = {
  getSettings: asyncHandler(async (req: Request, res: Response) => {
    let settings = await TenantSettings.findOne({ tenantId: req.tenantId });
    if (!settings) {
      settings = await TenantSettings.create({ tenantId: req.tenantId });
    }
    sendSuccess(res, 200, 'Success', settings);
  }),
  updateSettings: asyncHandler(async (req: Request, res: Response) => {
    const { clientCustomFields, ...updateData } = req.body;
    
    const settings = await TenantSettings.findOneAndUpdate(
      { tenantId: req.tenantId },
      { $set: updateData },
      { new: true, upsert: true, runValidators: true }
    );
    sendSuccess(res, 200, 'Settings updated successfully', settings);
  }),
  addCustomField: asyncHandler(async (req: Request, res: Response) => {
    const data = customFieldSchema.parse(req.body);
    const settings = await TenantSettings.findOneAndUpdate(
      { tenantId: req.tenantId },
      { $push: { clientCustomFields: data } as any },
      { new: true, upsert: true }
    );
    sendSuccess(res, 201, 'Custom field added successfully', settings.clientCustomFields);
  }),
  updateCustomField: asyncHandler(async (req: Request, res: Response) => {
    const data = customFieldSchema.parse(req.body);
    const index = parseInt(req.params.index as string);
    if (isNaN(index)) throw new ApiError(400, 'Invalid index');
    
    const settings = await TenantSettings.findOne({ tenantId: req.tenantId });
    if (!settings || index < 0 || index >= settings.clientCustomFields.length) {
      throw new ApiError(404, 'Custom field not found');
    }
    
    settings.clientCustomFields[index] = { ...settings.clientCustomFields[index], ...data };
    await settings.save();
    
    sendSuccess(res, 200, 'Custom field updated successfully', settings.clientCustomFields);
  }),
  deleteCustomField: asyncHandler(async (req: Request, res: Response) => {
    const index = parseInt(req.params.index as string);
    if (isNaN(index)) throw new ApiError(400, 'Invalid index');
    
    const settings = await TenantSettings.findOne({ tenantId: req.tenantId });
    if (!settings || index < 0 || index >= settings.clientCustomFields.length) {
      throw new ApiError(404, 'Custom field not found');
    }
    
    settings.clientCustomFields.splice(index, 1);
    await settings.save();
    
    sendSuccess(res, 200, 'Custom field deleted successfully', settings.clientCustomFields);
  })
};

// Billing Entity Controller
const billingEntitySchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  address: z.object({
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    pincode: z.string().optional()
  }).optional(),
  invoicePrefix: z.string().optional(),
  receiptPrefix: z.string().optional()
});

export const billingEntityController = {
  getPrimary: asyncHandler(async (req: Request, res: Response) => {
    let entity = await BillingEntity.findOne({ tenantId: req.tenantId });
    if (!entity) {
      entity = await BillingEntity.create({ tenantId: req.tenantId, name: 'Default Entity' });
    }
    sendSuccess(res, 200, 'Success', entity);
  }),
  updatePrimary: asyncHandler(async (req: Request, res: Response) => {
    const data = billingEntitySchema.parse(req.body);
    let entity = await BillingEntity.findOneAndUpdate(
      { tenantId: req.tenantId },
      data,
      { new: true, upsert: true, runValidators: true }
    );
    sendSuccess(res, 200, 'Billing entity updated successfully', entity);
  })
};

// Bootstrap Controller
export const getBootstrap = asyncHandler(async (req: Request, res: Response) => {
  const tId = req.tenantId;
  
  const [
    tags, clientGroups, paymentModes, expenseCategories, documentTypes, holidays,
    tenantSettings, billingEntity, roles, users
  ] = await Promise.all([
    Tag.find({ tenantId: tId, isActive: true }).select('-createdAt -updatedAt'),
    ClientGroup.find({ tenantId: tId, isActive: true }).select('-createdAt -updatedAt'),
    PaymentMode.find({ tenantId: tId, isActive: true }).select('-createdAt -updatedAt'),
    ExpenseCategory.find({ tenantId: tId, isActive: true }).select('-createdAt -updatedAt'),
    DocumentType.find({ tenantId: tId, isActive: true }).select('-createdAt -updatedAt'),
    Holiday.find({ tenantId: tId }).select('-createdAt -updatedAt'),
    TenantSettings.findOne({ tenantId: tId }).select('-createdAt -updatedAt'),
    BillingEntity.findOne({ tenantId: tId }).select('-createdAt -updatedAt'),
    Role.find({ tenantId: tId }).select('name isSuperAdmin'),
    User.find({ tenantId: tId, isActive: true }).select('name username photoUrl roleId')
  ]);

  sendSuccess(res, 200, 'Success', {
    tags,
    clientGroups,
    paymentModes,
    expenseCategories,
    documentTypes,
    holidays,
    tenantSettings: tenantSettings || await TenantSettings.create({ tenantId: tId }),
    billingEntity: billingEntity || await BillingEntity.create({ tenantId: tId, name: 'Default Entity' }),
    roles,
    users
  });
});
