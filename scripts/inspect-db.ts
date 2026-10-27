import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { User } from '../src/modules/auth/schemas/user.schema';
import { Client } from '../src/modules/clients/schemas/client.schema';
import { Service } from '../src/modules/services/schemas/service.schema';
import { Organization } from '../src/modules/auth/schemas/organization.schema';
import { Task } from '../src/models/Task';

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('Connected to MongoDB');

  const orgs = await Organization.find().lean();
  console.log('Organizations:', orgs.map(o => ({ id: o._id, name: o.name, slug: o.slug })));

  for (const org of orgs) {
    const userCount = await User.countDocuments({ tenantId: org._id });
    const clientCount = await Client.countDocuments({ tenantId: org._id });
    const serviceCount = await Service.countDocuments({ tenantId: org._id });
    const taskCount = await Task.countDocuments({ tenantId: org._id });
    console.log(`Org: ${org.name} (${org._id}) -> Users: ${userCount}, Clients: ${clientCount}, Services: ${serviceCount}, Tasks: ${taskCount}`);
  }

  await mongoose.disconnect();
}

inspect();
