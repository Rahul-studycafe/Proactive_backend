import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { User } from '../src/modules/auth/schemas/user.schema';
import { Client } from '../src/modules/clients/schemas/client.schema';
import { Service } from '../src/modules/services/schemas/service.schema';
import { Quotation } from '../src/models/Quotation';
import { QuotationService } from '../src/services/quotation.service';

const TENANT_ID = new mongoose.Types.ObjectId('6a3f7e69fd80b3e6b26c0762'); // Rahul and co

async function seedSampleQuotations() {
  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    'mongodb://root:secret@localhost:27017/proactive?authSource=admin';
  console.log('Connecting to MongoDB at', mongoUri);
  await mongoose.connect(mongoUri);

  try {
    const user = await User.findOne({ tenantId: TENANT_ID });
    if (!user) {
      console.error('No user found for tenant');
      return;
    }

    const clients = await Client.find({ tenantId: TENANT_ID }).limit(6);
    if (clients.length === 0) {
      console.error('No clients found for tenant');
      return;
    }

    const services = await Service.find({ tenantId: TENANT_ID }).limit(6);

    console.log(`Found ${clients.length} clients and ${services.length} services`);

    // Let's create 5 quotations in diverse statuses
    const sampleSpecs = [
      {
        client: clients[0],
        status: 'Draft' as const,
        items: [
          {
            serviceId: services[0]?._id?.toString(),
            description: services[0]?.name || 'Statutory GST Audit & Annual Filing FY 2025-26',
            sacCode: '998231',
            rate: 25000,
            quantity: 1,
            discount: 2000,
            gstPercentage: 18,
          },
          {
            description: 'Special Advisory on Input Tax Credit (ITC) Reconciliation',
            sacCode: '998232',
            rate: 7500,
            quantity: 2,
            discount: 0,
            gstPercentage: 18,
          },
        ],
        notes: 'Initial quotation prepared for client review.',
      },
      {
        client: clients[1] || clients[0],
        status: 'Sent' as const,
        items: [
          {
            serviceId: services[1]?._id?.toString(),
            description: services[1]?.name || 'Comprehensive Company Secretarial & ROC Annual Compliance',
            sacCode: '998233',
            rate: 45000,
            quantity: 1,
            discount: 5000,
            gstPercentage: 18,
          },
        ],
        notes: 'Dispatched via email to CFO.',
      },
      {
        client: clients[2] || clients[0],
        status: 'Accepted' as const,
        items: [
          {
            serviceId: services[2]?._id?.toString(),
            description: services[2]?.name || 'Direct Tax Transfer Pricing Study & Form 3CEB Certification',
            sacCode: '998231',
            rate: 85000,
            quantity: 1,
            discount: 0,
            gstPercentage: 18,
          },
          {
            description: 'Representation before Income Tax Appellate Tribunal (ITAT)',
            sacCode: '998239',
            rate: 35000,
            quantity: 1,
            discount: 5000,
            gstPercentage: 18,
          },
        ],
        notes: 'Accepted by Managing Director. Ready to convert to invoice.',
      },
      {
        client: clients[3] || clients[0],
        status: 'Declined' as const,
        items: [
          {
            description: 'Due Diligence & Valuation Report for Proposed Series A Fundraise',
            sacCode: '998311',
            rate: 120000,
            quantity: 1,
            discount: 10000,
            gstPercentage: 18,
          },
        ],
        notes: 'Client deferred the round to next fiscal quarter.',
      },
      {
        client: clients[4] || clients[0],
        status: 'Converted' as const,
        items: [
          {
            description: 'Internal Financial Controls (IFC) Testing & SOP Documentation',
            sacCode: '998231',
            rate: 60000,
            quantity: 1,
            discount: 0,
            gstPercentage: 18,
          },
        ],
        notes: 'Converted to official invoice INV-2026-0042.',
      },
    ];

    for (const spec of sampleSpecs) {
      const isInterState = Boolean(spec.client.state && spec.client.state.toLowerCase() !== 'maharashtra');

      const quote = await QuotationService.createQuotation(
        TENANT_ID,
        user._id as mongoose.Types.ObjectId,
        {
          clientId: spec.client._id.toString(),
          items: spec.items,
          isInterState,
          notes: spec.notes,
          termsAndConditions:
            '1. Quotation valid for 30 days from date of issue.\n2. 50% mobilization advance payable upon project kickoff.\n3. Out-of-pocket statutory fee to be reimbursed on actual receipts.\n4. GST charged extra as per applicable Indian tax code.',
        }
      );

      // Now set status
      if (spec.status !== 'Draft') {
        if (spec.status === 'Converted') {
          // convert to invoice
          try {
            await QuotationService.convertToInvoice(TENANT_ID, quote._id.toString(), {
              status: 'Unpaid',
            });
            console.log(`Created & converted quotation ${quote.quotationNo} -> Invoice`);
          } catch (e: any) {
            console.log(`Fallback updating status to Converted for ${quote.quotationNo}:`, e.message);
            await Quotation.updateOne({ _id: quote._id }, { $set: { status: 'Converted' } });
          }
        } else {
          await QuotationService.updateQuotationStatus(TENANT_ID, quote._id.toString(), spec.status);
          console.log(`Created quotation ${quote.quotationNo} with status ${spec.status}`);
        }
      } else {
        console.log(`Created quotation ${quote.quotationNo} with status Draft`);
      }
    }

    console.log('Seeding sample quotations completed successfully!');
  } catch (err) {
    console.error('Error seeding quotations:', err);
  } finally {
    await mongoose.disconnect();
  }
}

seedSampleQuotations();
