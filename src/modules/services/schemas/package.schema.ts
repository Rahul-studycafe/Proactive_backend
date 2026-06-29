import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../../../common/plugins/tenant.plugin';

export interface IPackage extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  frequency: string;
  defaultBillingAmount: number;
  sacCode?: string;
  gstPercentage: number;
  serviceIds: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const packageSchema = new Schema(
  {
    tenantId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Organization', 
      required: true 
    },
    name: { 
      type: String, 
      required: true, 
      trim: true 
    },
    frequency: { 
      type: String, 
      enum: ['monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time'], 
      required: true 
    },
    defaultBillingAmount: { 
      type: Number, 
      default: 0 
    },
    sacCode: { 
      type: String, 
      trim: true 
    },
    gstPercentage: { 
      type: Number, 
      default: 0 
    },
    serviceIds: [{ 
      type: Schema.Types.ObjectId, 
      ref: 'Service' 
    }],
    isActive: { 
      type: Boolean, 
      default: true 
    }
  },
  { 
    timestamps: true 
  }
);

packageSchema.plugin(tenantPlugin);

export const Package = mongoose.model<IPackage>('Package', packageSchema);
