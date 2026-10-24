import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export interface IHoliday extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  eventName?: string;
  date: string; // YYYY-MM-DD
  type: 'National' | 'Festival' | 'Optional' | 'Other';
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const holidaySchema = new Schema<IHoliday>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: [true, 'Holiday name is required'], trim: true },
    eventName: { type: String, trim: true },
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
      index: true
    },
    type: {
      type: String,
      enum: ['National', 'Festival', 'Optional', 'Other'],
      default: 'National'
    },
    description: { type: String, trim: true }
  },
  { timestamps: true }
);

// Pre-validate hook to sync name <-> eventName
holidaySchema.pre('validate', function () {
  if (!this.name && this.eventName) {
    this.name = this.eventName;
  }
  if (!this.eventName && this.name) {
    this.eventName = this.name;
  }
});

// Unique compound index: tenant cannot have duplicate holidays on the same date
holidaySchema.index({ tenantId: 1, date: 1 }, { unique: true });

holidaySchema.plugin(tenantPlugin);

export const Holiday =
  (mongoose.models.Holiday as mongoose.Model<IHoliday>) ||
  mongoose.model<IHoliday>('Holiday', holidaySchema);
