import mongoose, { Document, Schema } from 'mongoose';

export interface IEmailChangeRequest extends Document {
  userId: mongoose.Types.ObjectId;
  currentEmail: string;
  newEmail: string;
  currentEmailOtp: string;
  newEmailOtp: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EmailChangeRequestSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    currentEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    newEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    currentEmailOtp: {
      type: String,
      required: true,
    },
    newEmailOtp: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// TTL index to automatically remove expired change requests
EmailChangeRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailChangeRequest = mongoose.model<IEmailChangeRequest>(
  'EmailChangeRequest',
  EmailChangeRequestSchema
);
