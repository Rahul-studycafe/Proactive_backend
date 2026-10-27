import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Client } from '../src/modules/clients/schemas/client.schema';
import { Expense } from '../src/models/Expense';
import { ExpenseCategory } from '../src/modules/masters/schemas/expense-category.schema';
import { User } from '../src/modules/auth/schemas/user.schema';

const TENANT_ID = new mongoose.Types.ObjectId('6a3f7e69fd80b3e6b26c0762'); // Rahul and co

async function seedExpenses() {
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('✅ Connected to MongoDB');

  const admin = await User.findOne({ tenantId: TENANT_ID });
  if (!admin) throw new Error('Admin user not found');

  // Ensure default categories
  const categoriesData = [
    'Challan / Tax Paid',
    'Government Stamping',
    'ROC Forms & Filings',
    'Legal Fees',
    'Travel & Conveyance',
    'Stationery & Courier',
    'Miscellaneous Outlay',
  ];

  for (const catName of categoriesData) {
    const exists = await ExpenseCategory.findOne({ tenantId: TENANT_ID, name: catName });
    if (!exists) {
      await ExpenseCategory.create({
        tenantId: TENANT_ID,
        name: catName,
        isActive: true,
      });
    }
  }

  const allCategories = await ExpenseCategory.find({ tenantId: TENANT_ID }).lean();
  const catMap = new Map<string, any>();
  allCategories.forEach((c) => catMap.set(c.name, c));

  const clients = await Client.find({ tenantId: TENANT_ID }).lean();
  const surya = clients.find((c) => c.name === 'SURYA') || clients[0];
  const acme = clients.find((c) => c.name.includes('Acme')) || clients[1] || surya;
  const apex = clients.find((c) => c.name.includes('Apex')) || clients[2] || surya;

  const sampleExpenses = [
    {
      client: surya,
      categoryName: 'Challan / Tax Paid',
      amount: 3200,
      paymentMode: 'Bank Transfer' as const,
      paidFromAccount: 'Firm HDFC Current A/c',
      notes: 'GST PMT-06 challan CIN 01928372 paid on behalf of client for delayed GSTR-3B liability.',
      isBilled: false,
      dateOffsetDays: -2,
    },
    {
      client: surya,
      categoryName: 'Government Stamping',
      amount: 4500,
      paymentMode: 'UPI' as const,
      paidFromAccount: 'Firm ICICI UPI',
      notes: 'State treasury e-challan stamp duty for factory lease deed renewal.',
      isBilled: false,
      dateOffsetDays: -5,
    },
    {
      client: surya,
      categoryName: 'Stationery & Courier',
      amount: 650,
      paymentMode: 'Cash' as const,
      paidFromAccount: 'Office Petty Cash',
      notes: 'Blue Dart priority courier of audited financial reports and DSC tokens to factory site.',
      isBilled: true,
      dateOffsetDays: -20,
    },
    {
      client: acme,
      categoryName: 'ROC Forms & Filings',
      amount: 1800,
      paymentMode: 'Bank Transfer' as const,
      paidFromAccount: 'Firm HDFC Current A/c',
      notes: 'MCA V3 statutory filing fee for Director KYC Form DIR-3 KYC.',
      isBilled: false,
      dateOffsetDays: -1,
    },
    {
      client: acme,
      categoryName: 'Travel & Conveyance',
      amount: 1250,
      paymentMode: 'UPI' as const,
      paidFromAccount: 'Staff Expense Wallet',
      notes: 'Conveyance to GST Range Office 4 for personal verification of physical business premise.',
      isBilled: false,
      dateOffsetDays: -7,
    },
    {
      client: apex,
      categoryName: 'Legal Fees',
      amount: 8500,
      paymentMode: 'Bank Transfer' as const,
      paidFromAccount: 'Firm HDFC Current A/c',
      notes: 'Court fee and notary stamping for commercial arbitration agreement submission.',
      isBilled: false,
      dateOffsetDays: -4,
    },
  ];

  console.log('Seeding sample client expenses...');
  let count = 0;
  for (const s of sampleExpenses) {
    count++;
    const cat = catMap.get(s.categoryName) || allCategories[0];
    const expNo = `EXP-${String(count).padStart(3, '0')}`;

    const exists = await Expense.findOne({ tenantId: TENANT_ID, expenseNo: expNo });
    if (!exists) {
      await Expense.create({
        tenantId: TENANT_ID,
        clientId: s.client._id,
        expenseNo: expNo,
        date: new Date(Date.now() + s.dateOffsetDays * 86400000),
        categoryId: cat._id,
        categoryName: s.categoryName,
        amount: s.amount,
        paymentMode: s.paymentMode,
        paidFromAccount: s.paidFromAccount,
        notes: s.notes,
        isBilled: s.isBilled,
        createdBy: admin._id,
      });
      console.log(`  + Created ${expNo}: ${s.categoryName} - ₹${s.amount} (${s.client.name})`);
    }
  }

  const total = await Expense.countDocuments({ tenantId: TENANT_ID });
  console.log(`🎉 Total expenses seeded in tenant: ${total}`);

  await mongoose.disconnect();
}

seedExpenses();
