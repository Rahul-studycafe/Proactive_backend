import mongoose from 'mongoose';

const pendingRegistrationSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  orgName: { type: String, required: true },
  name: { type: String, required: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  email: { type: String, required: true },
  mobile: { type: String, required: true },
  usersCount: { type: Number, required: true },
  promoCode: { type: String },
  createdAt: { type: Date, default: Date.now, expires: 86400 } // Auto-delete after 24 hours
});

export const PendingRegistration = mongoose.model('PendingRegistration', pendingRegistrationSchema);
