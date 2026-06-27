import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { User } from '../src/modules/auth/schemas/user.schema';
import { Client } from '../src/modules/clients/schemas/client.schema';
import { Service } from '../src/modules/services/schemas/service.schema';
import { Task } from '../src/models/Task';

// The specific tenant requested by the user
const TENANT_ID = new mongoose.Types.ObjectId("6a3f7e69fd80b3e6b26c0762");
const ADMIN_ROLE_ID = new mongoose.Types.ObjectId("6a3a791d6c2ee92bcce4d5a8");

const randomChoice = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const userNames = ['Aarav', 'Vihaan', 'Aditya', 'Arjun', 'Sai', 'Kavya', 'Diya', 'Ishita', 'Neha', 'Pooja', 'Rohan', 'Sneha', 'Vikram', 'Meera', 'Ananya'];
const clientNames = ['TechCorp Solutions', 'Global Exports Ltd', 'Sharma & Associates', 'Apex Industries', 'Verma Traders', 'Sunrise Builders', 'NextGen IT', 'Pioneer Logistics', 'Crest Financials', 'Zenith Healthcare', 'Nova Media', 'Prime Retailers', 'Aura Designs', 'Vanguard Motors', 'Elite Consulting'];
const entityTypes = ['Private Limited', 'Sole Proprietorship', 'Partnership Firm', 'LLP', 'Trust', 'NGO', 'Individual'];
const serviceNames = ['GST Registration', 'ITR Filing', 'Company Incorporation', 'Annual Compliance', 'TDS Return', 'Trademark Registration', 'Bookkeeping', 'Payroll Processing', 'Tax Audit', 'ROC Filing'];

const seedData = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error('MONGO_URI is not defined in your .env file');
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // 1. Seed Users (10)
    console.log('Seeding Users...');
    const createdUsers: any[] = [];
    const runId = Math.floor(Math.random() * 10000); // Random suffix for uniqueness
    for (let i = 0; i < 10; i++) {
      const name = userNames[i];
      const user = await User.create({
        tenantId: TENANT_ID,
        name,
        username: `${name.toLowerCase()}${runId}${Math.floor(Math.random() * 1000)}`,
        email: `${name.toLowerCase()}${runId}@rahulandco.com`,
        mobile: `9${Math.floor(Math.random() * 900000000) + 100000000}`,
        password: 'password123', // Will be hashed by pre-save hook
        roleId: ADMIN_ROLE_ID, // Assuming they all share the role for simplicity, or we could leave it generic
        isActive: true,
      });
      createdUsers.push(user);
    }

    // 2. Seed Clients (15)
    console.log('Seeding Clients...');
    const createdClients: any[] = [];
    const indianStates = ['Maharashtra', 'Delhi', 'Karnataka', 'Gujarat', 'Tamil Nadu', 'Rajasthan', 'Uttar Pradesh', 'West Bengal'];
    const tagsPool = ['VIP', 'Monthly', 'Quarterly', 'Annual', 'New Client'];

    for (let i = 0; i < 15; i++) {
      const clientName = clientNames[i];
      const client = await Client.create({
        tenantId: TENANT_ID,
        name: clientName,
        fileNo: `FILE-${runId}-${1000 + i}`,
        entityType: randomChoice(entityTypes),
        email: `contact${runId}@${clientName.replace(/\s+/g, '').toLowerCase()}.com`,
        mobile: `9${Math.floor(Math.random() * 900000000) + 100000000}`,
        secondaryMobile: Math.random() > 0.5 ? `8${Math.floor(Math.random() * 900000000) + 100000000}` : undefined,
        pan: `ABCDE${Math.floor(Math.random() * 9000) + 1000}F`,
        gstin: `27ABCDE${Math.floor(Math.random() * 9000) + 1000}F1Z5`,
        address: `${Math.floor(Math.random() * 100) + 1}, Main Street, Phase ${Math.floor(Math.random() * 3) + 1}`,
        city: 'Mumbai',
        state: randomChoice(indianStates),
        pincode: `40000${Math.floor(Math.random() * 9) + 1}`,
        openingBalance: Math.floor(Math.random() * 50000) - 10000, // Range: -10k to +40k
        tags: [randomChoice(tagsPool)],
        contactPersonName: userNames[i] || 'Contact Person',
        dateOfBirth: new Date(new Date().setFullYear(new Date().getFullYear() - 30 + Math.floor(Math.random() * 10))),
        isActive: true,
      });
      createdClients.push(client);
    }

    // 3. Seed Services (10)
    console.log('Seeding Services...');
    const createdServices: any[] = [];
    for (let i = 0; i < 10; i++) {
      const service = await Service.create({
        tenantId: TENANT_ID,
        name: serviceNames[i],
        isEnabled: true,
        isRecurring: false,
        assignmentMode: 'client_default_user',
        assignedUsers: [],
        sacCode: `SAC${Math.floor(Math.random() * 9000) + 1000}`,
        gstPercentage: 18,
        defaultBillingRate: Math.floor(Math.random() * 5000) + 1000,
        isBillable: true,
        isChecklistRequired: true,
        checklist: [
          { stepName: 'Initial Review', orderIndex: 1 },
          { stepName: 'Document Collection', orderIndex: 2 },
          { stepName: 'Filing', orderIndex: 3 },
          { stepName: 'Final Approval', orderIndex: 4 },
        ],
        subtasks: [],
        customFieldsDef: [],
        gstApiConfig: {
          isEnabled: false
        }
      });
      createdServices.push(service);
    }

    // 4. Seed Tasks (20)
    console.log('Seeding Tasks...');
    const statuses = ['Pending', 'In Progress', 'Under Review', 'On Hold', 'Completed', 'Cancelled'];
    const priorities = ['Low', 'Medium', 'High', 'Urgent'];

    for (let i = 0; i < 20; i++) {
      const client = randomChoice(createdClients);
      const service = randomChoice(createdServices);
      const assignee = randomChoice(createdUsers);
      const status = randomChoice(statuses);
      
      const checklistInstances = service.checklist.map((step: any) => ({
        stepName: step.stepName,
        isCompleted: status === 'Completed' || (status === 'Under Review' && step.order < 4),
        completedAt: status === 'Completed' ? new Date() : undefined,
      }));

      await Task.create({
        tenantId: TENANT_ID,
        clientId: client._id,
        serviceId: service._id,
        assigneeIds: [assignee._id],
        description: `Auto-generated task for ${service.name}.`,
        status: status,
        priority: randomChoice(priorities),
        dueDate: new Date(Date.now() + Math.floor(Math.random() * 14) * 86400000), // Random due date within next 14 days
        completedAt: status === 'Completed' ? new Date() : undefined,
        creationType: 'manual',
        checklist: checklistInstances,
      });
    }

    console.log('🎉 Successfully seeded 10 Users, 15 Clients, 10 Services, and 20 Tasks for tenant:', TENANT_ID);
    process.exit(0);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seedData();
