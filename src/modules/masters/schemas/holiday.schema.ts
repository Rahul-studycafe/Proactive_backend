import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../../../common/plugins/tenant.plugin';

export interface IHoliday extends Document {
  tenantId: mongoose.Types.ObjectId;
  date: string;
  eventName: string;
  createdAt: Date;
  updatedAt: Date;
}

const holidaySchema = new Schema<IHoliday>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  eventName: { type: String, required: true }
}, { timestamps: true });

holidaySchema.index({ tenantId: 1, date: 1 }, { unique: true });
holidaySchema.plugin(tenantPlugin);

export const Holiday = mongoose.model<IHoliday>('Holiday', holidaySchema);
