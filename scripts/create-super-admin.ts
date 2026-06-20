import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the root Backend directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Organization } from '../src/modules/auth/schemas/organization.schema';
import { Role } from '../src/modules/roles/schemas/role.schema';
import { User } from '../src/modules/auth/schemas/user.schema';

const createSuperAdmin = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not defined in your .env file');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // 1. Create a "Root" System Organization
    let org = await Organization.findOne({ slug: 'proactive-root' });
    if (!org) {
      org = await Organization.create({
        name: 'Proactive Admin System',
        slug: 'proactive-root',
        subscriptionStatus: 'active',
        plan: { maxUsers: 99999 } // Unlimited
      });
      console.log('✅ Created System Organization');
    }

    // 2. Create Super Admin Role with ALL permissions
    let role = await Role.findOne({ name: 'System Super Admin', tenantId: org._id }).setOptions({ skipTenantPlugin: true });
    
    const allAccess = { allowed: true, scope: 'everything' as const };
    
    if (!role) {
      role = await Role.create({
        tenantId: org._id,
        name: 'System Super Admin',
        description: 'Product Owner / Master Admin with absolute access across the entire system',
        isSuperAdmin: true,
        permissions: {
          client: { create: allAccess, edit: allAccess, view: allAccess, delete: allAccess, viewLedger: allAccess, manageClientPackages: allAccess, viewClientPackages: allAccess },
          user: { create: allAccess, edit: allAccess, view: allAccess, delete: allAccess },
          task: { create: allAccess, edit: allAccess, view: allAccess, delete: allAccess, verify: allAccess, assignToOthers: allAccess, manageTimeLog: allAccess, deleteNote: allAccess },
          invoice: { create: allAccess, edit: allAccess, view: allAccess, delete: allAccess },
          receipt: { create: allAccess, edit: allAccess, view: allAccess, delete: allAccess },
          quotation: { create: allAccess, edit: allAccess, view: allAccess, delete: allAccess },
          expense: { create: allAccess, edit: allAccess, view: allAccess, delete: allAccess },
          docsInOut: { create: allAccess, edit: allAccess, view: allAccess, delete: allAccess },
          dsc: { create: allAccess, edit: allAccess, view: allAccess, delete: allAccess },
          attendance: { markAttendance: allAccess, markPastFuture: allAccess },
          todo: { assignToOthers: allAccess },
          settings: { manageMasters: allAccess }
        }
      });
      console.log('✅ Created Super Admin Role with full access');
    }

    // 3. Create the Super Admin User
    const adminEmail = 'admin@proactive.com'; // You can change this
    const adminPassword = 'SuperSecretPassword123!'; // You can change this
    
    let user = await User.findOne({ email: adminEmail }).setOptions({ skipTenantPlugin: true });
    
    if (!user) {
      user = await User.create({
        tenantId: org._id,
        name: 'Product Owner',
        username: 'master_admin',
        email: adminEmail,
        password: adminPassword,
        roleId: role._id,
        isActive: true,
      });
      
      // Assign this user as the owner of the organization
      org.ownerId = user._id as mongoose.Types.ObjectId;
      await org.save();
      
      console.log('✅ Created Super Admin User!');
      console.log('--------------------------------------------------');
      console.log(`👤 Email:    ${adminEmail}`);
      console.log(`🔑 Password: ${adminPassword}`);
      console.log('--------------------------------------------------');
      console.log('🚨 Make sure to change these credentials or update the script before running it in production!');
    } else {
      console.log(`⚠️ Super Admin user already exists with email: ${adminEmail}`);
    }

  } catch (error) {
    console.error('❌ Error creating super admin:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

createSuperAdmin();


// npx ts-node scripts/create-super-admin.ts