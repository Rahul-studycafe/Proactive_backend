import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { User } from '../src/modules/auth/schemas/user.schema';
import { Client } from '../src/modules/clients/schemas/client.schema';

async function checkDetails() {
  await mongoose.connect(process.env.MONGO_URI!);
  const tenantId = new mongoose.Types.ObjectId('6a3f7e69fd80b3e6b26c0762');

  const users = await User.find({ tenantId }).select('_id name email role').lean();
  console.log('Users:', users);

  const clients = await Client.find({ tenantId }).select('_id name fileNo entityType').lean();
  console.log('Clients:', clients);

  await mongoose.disconnect();
}

checkDetails();
