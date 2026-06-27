import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { User } from '../src/modules/auth/schemas/user.schema';
import { Client } from '../src/modules/clients/schemas/client.schema';
import { Service } from '../src/modules/services/schemas/service.schema';
import { Task } from '../src/models/Task';

const TENANT_ID = new mongoose.Types.ObjectId("6a3a791d6c2ee92bcce4d5a7");

const deleteData = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error('MONGO_URI is not defined in your .env file');
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    console.log('Deleting Tasks...');
    const taskResult = await Task.deleteMany({ tenantId: TENANT_ID });
    console.log(`Deleted ${taskResult.deletedCount} tasks.`);

    console.log('Deleting Services...');
    const serviceResult = await Service.deleteMany({ tenantId: TENANT_ID });
    console.log(`Deleted ${serviceResult.deletedCount} services.`);

    console.log('Deleting Clients...');
    const clientResult = await Client.deleteMany({ tenantId: TENANT_ID });
    console.log(`Deleted ${clientResult.deletedCount} clients.`);

    console.log('Deleting Users (keeping original admin/employee)...');
    const userResult = await User.deleteMany({
      tenantId: TENANT_ID,
      email: { $nin: ['employee@rahulandco.com', 'admin@rahulandco.com', 'superadmin@rahulandco.com', 'pooja8560@rahulandco.com'] }
    });
    console.log(`Deleted ${userResult.deletedCount} sample users.`);

    console.log('✅ Sample data successfully wiped!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed:', error);
    process.exit(1);
  }
};

deleteData();
