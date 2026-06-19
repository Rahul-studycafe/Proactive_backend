import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import connectDB from '../src/config/db';
import { PromoCode } from '../src/models/PromoCode';

const addPromoCode = async () => {
  try {
    // Connect to MongoDB
    await connectDB(1);

    // Get command line arguments (e.g. npx ts-node scripts/add-promocode.ts LAUNCH50 50)
    const codeArg = process.argv[2];
    const discountArg = process.argv[3];

    // Use default values if no arguments provided
    const code = codeArg ? codeArg.toUpperCase() : 'LAUNCH50';
    const discountPercentage = discountArg ? Number(discountArg) : 50;

    if (isNaN(discountPercentage) || discountPercentage < 0 || discountPercentage > 100) {
      console.error('Error: Discount percentage must be a number between 0 and 100.');
      process.exit(1);
    }

    // Check if promo code already exists
    const existingPromo = await PromoCode.findOne({ code });
    if (existingPromo) {
      console.log(`Promo code '${code}' already exists with ${existingPromo.discountPercentage}% discount.`);
      process.exit(0);
    }

    // Create the new promo code
    const newPromo = new PromoCode({
      code,
      discountPercentage,
      isActive: true,
    });

    await newPromo.save();
    console.log(`✅ Success! Promo code '${code}' added with ${discountPercentage}% discount.`);

  } catch (error) {
    console.error('❌ Error adding promo code:', error);
  } finally {
    // Disconnect from database
    await mongoose.disconnect();
    process.exit(0);
  }
};

addPromoCode();

// npm run seed:promo -- SUMMER30 30

