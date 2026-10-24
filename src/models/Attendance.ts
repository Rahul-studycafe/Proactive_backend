import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export type AttendanceStatus =
  | 'Present'
  | 'Absent'
  | 'Half Day'
  | 'Leave'
  | 'Paid Leave'
  | 'Holiday';

export interface IAttendance extends Document {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD format for fast exact matching
  status: AttendanceStatus;
  checkIn?: Date; // UTC ISO Timestamp
  checkOut?: Date; // UTC ISO Timestamp
  totalMinutes?: number; // Total working duration
  overtimeMinutes: number; // Duration beyond standard work hours
  markedBy: mongoose.Types.ObjectId; // User who recorded the entry
  verifiedVia?: 'office_ip' | 'gps' | 'manual' | 'unrestricted';
  ipAddress?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
      index: true
    },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Half Day', 'Leave', 'Paid Leave', 'Holiday'],
      default: 'Present',
      required: true
    },
    checkIn: {
      type: Date
    },
    checkOut: {
      type: Date
    },
    totalMinutes: {
      type: Number,
      default: 0
    },
    overtimeMinutes: {
      type: Number,
      default: 0
    },
    markedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    verifiedVia: {
      type: String,
      enum: ['office_ip', 'gps', 'manual', 'unrestricted'],
      default: 'unrestricted'
    },
    ipAddress: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

// Unique compound index: strictly one entry per employee per day within a tenant
attendanceSchema.index({ tenantId: 1, userId: 1, date: 1 }, { unique: true });

// Compound index for fast daily summary queries
attendanceSchema.index({ tenantId: 1, date: 1, status: 1 });

attendanceSchema.plugin(tenantPlugin);

export const Attendance =
  (mongoose.models.Attendance as mongoose.Model<IAttendance>) ||
  mongoose.model<IAttendance>('Attendance', attendanceSchema);
