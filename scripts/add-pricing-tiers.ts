import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the root Backend directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PricingTier } from '../src/models/PricingTier';

const seedPricingTiers = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not defined in your .env file');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Clear existing tiers to avoid duplicates
    await PricingTier.deleteMany({});

    // Create the default tiers
    const tiers = [
      {
        name: '1-5 Users',
        minUsers: 1,
        maxUsers: 5,
        pricePerUserMonthly: 99,
        pricePerUserYearly: 99 * 12,
        isActive: true
      },
      {
        name: '6-10 Users',
        minUsers: 6,
        maxUsers: 10,
        pricePerUserMonthly: 91,
        pricePerUserYearly: 91 * 12,
        isActive: true
      },
      {
        name: '11-30 Users',
        minUsers: 11,
        maxUsers: 30,
        pricePerUserMonthly: 83,
        pricePerUserYearly: 83 * 12,
        isActive: true
      },
      {
        name: '31-100 Users',
        minUsers: 31,
        maxUsers: 99999, // Allows up to any number, but represents the 31-100+ tier
        pricePerUserMonthly: 75,
        pricePerUserYearly: 75 * 12,
        isActive: true
      }
    ];

    await PricingTier.insertMany(tiers);
    
    console.log('✅ Successfully seeded Pricing Tiers!');
    console.table(tiers);

  } catch (error) {
    console.error('❌ Error seeding pricing tiers:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

seedPricingTiers();


// npx ts-node scripts/add-pricing-tiers.ts

