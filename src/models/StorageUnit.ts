import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export const STORAGE_UNIT_TYPES = [
  'Cabinet',
  'Shelf',
  'Safe Box',
  'Locker',
  'Drawer',
  'Archive Room',
  'Other'
] as const;

export type StorageUnitType = typeof STORAGE_UNIT_TYPES[number];

export interface IStorageUnit extends MongooseDocument {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  code?: string;
  unitType: StorageUnitType;
  roomOrFloor?: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const storageUnitSchema = new Schema<IStorageUnit>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      trim: true
    },
    unitType: {
      type: String,
      enum: STORAGE_UNIT_TYPES,
      default: 'Cabinet'
    },
    roomOrFloor: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

storageUnitSchema.index({ tenantId: 1, name: 1 }, { unique: true });
storageUnitSchema.index({ tenantId: 1, unitType: 1 });
storageUnitSchema.plugin(tenantPlugin);

export const StorageUnitModel = mongoose.model<IStorageUnit>(
  'StorageUnit',
  storageUnitSchema
);
