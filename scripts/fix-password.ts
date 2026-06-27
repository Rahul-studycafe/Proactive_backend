import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { User } from '../src/modules/auth/schemas/user.schema';

const fixPassword = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error('MONGO_URI is not defined');
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const user = await User.findOne({ email: 'employee@rahulandco.com' });
    if (user) {
      user.password = 'password123';
      await user.save(); // Triggers the pre-save hook to hash the password correctly
      console.log('✅ Password successfully fixed for employee@rahulandco.com!');
    } else {
      console.log('❌ User not found');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed:', error);
    process.exit(1);
  }
};

fixPassword();
