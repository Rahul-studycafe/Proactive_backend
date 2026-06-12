import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../models/Organization';
import { Role } from '../models/Role';
import { User } from '../models/User';
import dotenv from 'dotenv';

dotenv.config();

const runTest = async () => {
  try {
    await connectDB();
    console.log('--- Starting Phase 6 Test ---');

    // Clean up previous runs
    await Organization.deleteOne({ slug: 'phase6-org' });
    await Role.deleteMany({ name: 'Super Admin Test' });
    await User.deleteMany({ username: 'admin_test' });

    // 1. Create Organization
    const newOrg = new Organization({
      name: 'Phase 6 Org',
      slug: 'phase6-org',
      plan: { maxUsers: 5 }
    });
    const savedOrg = await newOrg.save();
    console.log('✅ Dummy Organization created:', savedOrg._id);

    // 2. Create Role
    const newRole = new Role({
      tenantId: savedOrg._id,
      name: 'Super Admin Test',
      isSuperAdmin: true,
      permissions: {}
    });
    const savedRole = await newRole.save();
    console.log('✅ Dummy Role created:', savedRole._id);

    // 3. Create User
    const plainTextPassword = 'secretPassword123';
    const newUser = new User({
      tenantId: savedOrg._id,
      name: 'Admin User',
      username: 'admin_test',
      email: 'admin@test.com',
      password: plainTextPassword,
      roleId: savedRole._id
    });
    
    const savedUser = await newUser.save();
    console.log('✅ User saved successfully!');

    // 4. Verify password hash directly from DB (bypassing select: false by explicitly selecting it)
    const userFromDb = await User.findById(savedUser._id).select('+password');
    if (!userFromDb) throw new Error('Failed to retrieve user from DB');

    console.log(`   - Original Password: ${plainTextPassword}`);
    console.log(`   - Hashed Password in DB: ${userFromDb.password}`);

    if (userFromDb.password === plainTextPassword) {
       console.error('❌ FAILED: Password was saved in plain text!');
    } else {
       console.log('✅ SUCCESS: Password was securely hashed by pre-save hook!');
       
       // Verify comparePassword method
       const isMatch = await userFromDb.comparePassword(plainTextPassword);
       if (isMatch) {
         console.log('✅ SUCCESS: comparePassword correctly validated the hash!');
       } else {
         console.error('❌ FAILED: comparePassword failed to match the correct password.');
       }
    }

  } catch (error) {
    console.error('❌ Phase 6 Test Failed:', error);
  } finally {
    await Organization.deleteOne({ slug: 'phase6-org' });
    await Role.deleteMany({ name: 'Super Admin Test' });
    await User.deleteMany({ username: 'admin_test' });
    console.log('--- Cleanup Finished ---');
    await mongoose.disconnect();
    process.exit(0);
  }
};

runTest();
