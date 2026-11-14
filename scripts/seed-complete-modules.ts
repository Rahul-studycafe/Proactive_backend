import dns from 'node:dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore fallback
}

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { User } from '../src/modules/auth/schemas/user.schema';
import { Organization } from '../src/modules/auth/schemas/organization.schema';
import { Client } from '../src/modules/clients/schemas/client.schema';
import { Service } from '../src/modules/services/schemas/service.schema';
import { Task } from '../src/models/Task';
import { Invoice } from '../src/models/Invoice';
import { Receipt } from '../src/models/Receipt';
import { Expense } from '../src/models/Expense';
import { ExpenseCategory } from '../src/modules/masters/schemas/expense-category.schema';
import { PaymentTransaction } from '../src/models/PaymentTransaction';
import { CreditNote } from '../src/models/CreditNote';
import { ClientPassword } from '../src/models/ClientPassword';
import { PortalMaster } from '../src/models/PortalMaster';
import { DocumentRequest } from '../src/models/DocumentRequest';
import { encryptPassword } from '../src/utils/crypto-vault';

const TENANT_ID = new mongoose.Types.ObjectId('6af720ce00e09b30fc93eaba');
const DEEPAK_USER_ID = new mongoose.Types.ObjectId('6af720ce00e09b30fc93eabc');

async function seedCompletePracticeModules() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error('MONGO_URI is missing in .env');

    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB Atlas\n');

    // 1. Fetch Tenant, Clients, Staff & Tasks
    const org = await Organization.findById(TENANT_ID);
    if (!org) throw new Error(`Organization ${TENANT_ID} not found`);

    const clients = await Client.find({ tenantId: TENANT_ID });
    if (clients.length === 0) throw new Error('No clients found. Run seed-pdgupta-practice.ts first.');

    const staffUsers = await User.find({ tenantId: TENANT_ID });
    const priyaUser = staffUsers.find(u => u.name.includes('Priya')) || staffUsers[0];
    const amitUser = staffUsers.find(u => u.name.includes('Amit')) || staffUsers[0];

    console.log(`🏢 Organization: "${org.name}"`);
    console.log(`👥 Clients available: ${clients.length}`);
    console.log(`👨‍💼 Staff available: ${staffUsers.length}\n`);

    // 2. Ensure Tasks are properly connected to Clients and Services
    const tasks = await Task.find({ tenantId: TENANT_ID });
    console.log(`📋 Total existing tasks: ${tasks.length}`);

    // Mark 15 tasks as Completed so they can have corresponding raised bills
    for (let i = 0; i < Math.min(15, tasks.length); i++) {
      tasks[i].status = 'Completed';
      tasks[i].completedAt = new Date(Date.now() - (i + 1) * 86400000 * 2);
      await tasks[i].save();
    }
    console.log('✅ Updated completed tasks for billing link\n');

    // 3. Ensure Invoices exist for all 10 clients (bills generated on completed tasks)
    console.log('🧾 Ensuring Raised Bills / Invoices for all clients...');
    const allInvoices: any[] = [];
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const clientCompletedTask = tasks.find(t => t.clientId.toString() === client._id.toString() && t.status === 'Completed');
      const invoiceNo = `INV-PDG-2026-${String(i + 1).padStart(3, '0')}`;

      let inv = await Invoice.findOne({ tenantId: TENANT_ID, invoiceNo });
      if (!inv) {
        const rate = 4000 + (i * 1500);
        const gst = rate * 0.18;
        const grandTotal = rate + gst;
        const isPaid = i % 3 === 0;
        const isPartiallyPaid = i % 3 === 1;
        const amountPaid = isPaid ? grandTotal : isPartiallyPaid ? Math.round(grandTotal * 0.4) : 0;
        const amountDue = grandTotal - amountPaid;

        inv = await Invoice.create({
          tenantId: TENANT_ID,
          clientId: client._id,
          invoiceNo: invoiceNo,
          date: new Date(Date.now() - (i * 3 * 86400000)),
          dueDate: new Date(Date.now() + (14 * 86400000)),
          paymentTerms: 'Due on Receipt',
          items: [
            {
              referenceType: clientCompletedTask ? 'Task' : 'Manual',
              referenceId: clientCompletedTask ? clientCompletedTask._id : undefined,
              particulars: clientCompletedTask ? clientCompletedTask.description : `Tax & Compliance Services for ${client.name}`,
              sacCode: '998231',
              quantity: 1,
              rate: rate,
              discount: 0,
              taxableAmount: rate,
              gstPercentage: 18,
              gstAmount: gst,
              total: grandTotal,
            },
          ],
          totals: {
            subtotal: rate,
            totalDiscount: 0,
            totalTaxable: rate,
            totalGst: gst,
            roundOff: 0,
            grandTotal: grandTotal,
            amountPaid: amountPaid,
            amountDue: amountDue,
          },
          status: isPaid ? 'Paid' : isPartiallyPaid ? 'Partially Paid' : 'Unpaid',
          notes: `Tax invoice raised for ${client.name}.`,
        });

        if (clientCompletedTask) {
          clientCompletedTask.isBilled = true;
          clientCompletedTask.invoiceId = inv._id as mongoose.Types.ObjectId;
          await clientCompletedTask.save();
        }
      }
      allInvoices.push(inv);
    }
    console.log(`✅ ${allInvoices.length} Invoices available and linked to completed tasks.\n`);

    // 4. Ensure matching Receipts exist for paid and partially paid invoices
    console.log('💳 Ensuring Payment Receipts for paid invoices...');
    const allReceipts: any[] = [];
    for (let i = 0; i < allInvoices.length; i++) {
      const inv = allInvoices[i];
      if (inv.totals.amountPaid > 0) {
        const receiptNo = `RCT-PDG-2026-${String(i + 1).padStart(3, '0')}`;
        let rct = await Receipt.findOne({ tenantId: TENANT_ID, receiptNo });
        if (!rct) {
          rct = await Receipt.create({
            tenantId: TENANT_ID,
            clientId: inv.clientId,
            receiptNo: receiptNo,
            date: new Date(inv.date.getTime() + 86400000),
            paymentMode: i % 2 === 0 ? 'UPI' : 'NEFT/RTGS',
            referenceNumber: `TXN${Math.floor(100000000 + Math.random() * 900000000)}`,
            totalAmount: inv.totals.amountPaid,
            unallocatedAmount: 0,
            settlements: [
              {
                invoiceId: inv._id,
                settledAmount: inv.totals.amountPaid,
                tdsDeducted: 0,
              },
            ],
            notes: `Payment received against bill ${inv.invoiceNo}.`,
          });
        }
        allReceipts.push(rct);
      }
    }
    console.log(`✅ ${allReceipts.length} Receipts linked.\n`);

    // =========================================================================
    // MODULE 1: REIMBURSABLE EXPENSES & OUTLAYS
    // =========================================================================
    console.log('💵 Seeding Expense Categories & Outlays for ALL clients...');
    const expCategoriesDef = [
      'Government Challans & ROC Fees',
      'Stamp Duty & Court Fees',
      'Travel & Client Site Conveyance',
      'Courier, Speed Post & Dispatch',
      'Notary, Documentation & Attestation',
      'Statutory Audit Filing Outlays',
    ];

    const categoryMap: Record<string, any> = {};
    for (const catName of expCategoriesDef) {
      let cat = await ExpenseCategory.findOne({ tenantId: TENANT_ID, name: catName });
      if (!cat) {
        cat = await ExpenseCategory.create({
          tenantId: TENANT_ID,
          name: catName,
          isActive: true,
        });
      }
      categoryMap[catName] = cat;
    }

    const expenseDescriptions = [
      { cat: 'Government Challans & ROC Fees', amount: 1500, notes: 'ROC Form MGT-7 MCA Portal Government Filing Challan' },
      { cat: 'Stamp Duty & Court Fees', amount: 2500, notes: 'E-Stamp paper stamp duty for LLP agreement modification' },
      { cat: 'Notary, Documentation & Attestation', amount: 800, notes: 'Director affidavit & KYC apostille verification charges' },
      { cat: 'Courier, Speed Post & Dispatch', amount: 350, notes: 'Urgent speed post dispatch of audited physical financials' },
      { cat: 'Travel & Client Site Conveyance', amount: 1200, notes: 'Cab conveyance for on-site physical stock audit verification' },
      { cat: 'Statutory Audit Filing Outlays', amount: 3000, notes: 'XBRL taxonomy conversion & filing statutory utility fees' },
      { cat: 'Government Challans & ROC Fees', amount: 2000, notes: 'DIN Application Government filing challan fee' },
      { cat: 'Stamp Duty & Court Fees', amount: 1000, notes: 'Board resolution stamp duty fee' },
      { cat: 'Courier, Speed Post & Dispatch', amount: 450, notes: 'Original property title deed returned via insured courier' },
      { cat: 'Notary, Documentation & Attestation', amount: 600, notes: 'Form 11 Annual return partner signature notarization' },
      { cat: 'Government Challans & ROC Fees', amount: 1000, notes: 'IEC renewal government processing charges' },
      { cat: 'Travel & Client Site Conveyance', amount: 1800, notes: 'Conveyance to Income Tax Department for scrutiny hearing' },
    ];

    let seededExpensesCount = 0;
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const clientTask = tasks.find(t => t.clientId.toString() === client._id.toString());
      const clientInvoice = allInvoices.find(inv => inv.clientId.toString() === client._id.toString());
      const expMeta = expenseDescriptions[i % expenseDescriptions.length];
      const category = categoryMap[expMeta.cat];

      const expenseNo = `EXP-PDG-2026-${String(i + 1).padStart(3, '0')}`;
      let exp = await Expense.findOne({ tenantId: TENANT_ID, expenseNo });

      if (!exp) {
        // Some expenses are billed on invoice, some unbilled (for unbilled exposure)
        const isBilled = i % 2 === 0;

        await Expense.create({
          tenantId: TENANT_ID,
          clientId: client._id,
          taskId: clientTask ? clientTask._id : undefined,
          expenseNo: expenseNo,
          date: new Date(Date.now() - (i + 1) * 86400000 * 2),
          categoryId: category._id,
          categoryName: category.name,
          amount: expMeta.amount,
          paymentMode: i % 2 === 0 ? 'NEFT/RTGS' : 'UPI',
          paidFromAccount: 'HDFC Current A/c - 502000889911',
          notes: `${expMeta.notes} (${client.name})`,
          isBilled: isBilled,
          invoiceId: isBilled && clientInvoice ? clientInvoice._id : undefined,
          billedAt: isBilled ? new Date() : undefined,
          createdBy: priyaUser._id,
        });
        seededExpensesCount++;
      }
    }
    console.log(`✅ Seeded ${seededExpensesCount} Expenses across all clients (both Billed and Unbilled).\n`);

    // =========================================================================
    // MODULE 2: DIGITAL PAYMENTS & RECONCILIATION LEDGER
    // =========================================================================
    console.log('📱 Seeding Digital Payments & UPI Ledger linked to Raised Bills...');
    const digitalPaymentModes = ['UPI', 'NetBanking', 'Card'];
    const gatewayProviders = ['Direct UPI', 'Razorpay', 'Cashfree'];
    let seededTxnCount = 0;

    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const invoice = allInvoices[i];
      const receipt = allReceipts.find(r => r.clientId.toString() === client._id.toString());
      const txId = `pay_live_pdg_${100000 + i}`;

      let existingTx = await PaymentTransaction.findOne({ tenantId: TENANT_ID, gatewayTransactionId: txId });
      if (!existingTx) {
        // Status distribution: 7 Captured, 2 Failed, 1 Initiated
        let status: 'Captured' | 'Failed' | 'Initiated' = 'Captured';
        let errorCode: string | undefined;
        let errorDescription: string | undefined;

        if (i === 4) {
          status = 'Failed';
          errorCode = 'PAYMENT_DECLINED_BY_BANK';
          errorDescription = 'Transaction declined due to customer bank server timeout';
        } else if (i === 7) {
          status = 'Failed';
          errorCode = 'USER_ABANDONED_CHECKOUT';
          errorDescription = 'Client closed payment gateway window before entering OTP';
        } else if (i === 9) {
          status = 'Initiated';
        }

        const amount = invoice.totals.amountPaid > 0 ? invoice.totals.amountPaid : invoice.totals.grandTotal;

        await PaymentTransaction.create({
          tenantId: TENANT_ID,
          clientId: client._id,
          invoiceId: invoice._id,
          receiptId: status === 'Captured' && receipt ? receipt._id : undefined,
          gatewayProvider: gatewayProviders[i % gatewayProviders.length],
          gatewayTransactionId: txId,
          gatewayOrderId: `order_pdg_${800000 + i}`,
          amount: amount,
          currency: 'INR',
          paymentMethod: digitalPaymentModes[i % digitalPaymentModes.length],
          status: status,
          errorCode: errorCode,
          errorDescription: errorDescription,
          rawWebhookPayload: {
            event: status === 'Captured' ? 'payment.captured' : status === 'Failed' ? 'payment.failed' : 'payment.authorized',
            payment: {
              id: txId,
              amount: amount * 100,
              currency: 'INR',
              status: status.toLowerCase(),
              method: digitalPaymentModes[i % digitalPaymentModes.length].toLowerCase(),
              email: client.email,
              contact: client.mobile,
            },
          },
        });
        seededTxnCount++;
      }
    }
    console.log(`✅ Seeded ${seededTxnCount} Digital Payment transactions linked to Invoices and Receipts.\n`);

    // =========================================================================
    // MODULE 3: FINANCIAL CREDIT NOTES
    // =========================================================================
    console.log('📝 Seeding Financial Credit Notes with multi-document reconciliation...');
    const creditNoteScenarios = [
      {
        clientIndex: 0,
        invoiceIndex: 0,
        reason: 'Goodwill Discount',
        rate: 1000,
        applied: 1180,
        unallocated: 0,
        status: 'Applied',
        notes: 'Goodwill discount credited for advance payment on statutory filings.',
      },
      {
        clientIndex: 1,
        invoiceIndex: 1,
        reason: 'Overcharge Correction',
        rate: 1500,
        applied: 0,
        unallocated: 1770,
        status: 'Issued',
        notes: 'Excess fee billed for ROC annual filing; balance available for future billing.',
      },
      {
        clientIndex: 2,
        invoiceIndex: 2,
        reason: 'Deficiency of Service',
        rate: 2000,
        applied: 2360,
        unallocated: 0,
        status: 'Applied',
        notes: 'Credit note issued against bill INV-PDG-2026-003 to adjust TDS billing rate.',
      },
      {
        clientIndex: 3,
        invoiceIndex: 3,
        reason: 'Service Cancellation',
        rate: 3000,
        applied: 0,
        unallocated: 0,
        status: 'Refunded',
        notes: 'IEC renewal cancelled by client request; refund processed via Bank Transfer.',
        refund: {
          refundDate: new Date(),
          refundMode: 'Bank Transfer',
          referenceNo: 'REF-BANK-998811',
          refundedAmount: 3540,
          notes: 'Full amount refunded back to client company current account.',
        },
      },
      {
        clientIndex: 4,
        invoiceIndex: 4,
        reason: 'Other',
        rate: 1200,
        applied: 0,
        unallocated: 1416,
        status: 'Issued',
        notes: 'Unallocated credit balance available on account.',
      },
      {
        clientIndex: 5,
        invoiceIndex: 5,
        reason: 'Goodwill Discount',
        rate: 1500,
        applied: 1770,
        unallocated: 0,
        status: 'Applied',
        notes: 'Anniversary promotional discount applied against legal compliance bill.',
      },
    ];

    let seededCreditNotesCount = 0;
    for (let i = 0; i < creditNoteScenarios.length; i++) {
      const scen = creditNoteScenarios[i];
      const client = clients[scen.clientIndex];
      const invoice = allInvoices[scen.invoiceIndex];
      const cnNo = `CN-PDG-2026-${String(i + 1).padStart(3, '0')}`;

      let cn = await CreditNote.findOne({ tenantId: TENANT_ID, creditNoteNo: cnNo });
      if (!cn) {
        const gst = scen.rate * 0.18;
        const total = scen.rate + gst;

        cn = await CreditNote.create({
          tenantId: TENANT_ID,
          clientId: client._id,
          invoiceId: invoice._id,
          creditNoteNo: cnNo,
          date: new Date(Date.now() - (i + 1) * 86400000 * 3),
          reason: scen.reason,
          items: [
            {
              description: `Credit adjustment against ${invoice.invoiceNo}: ${scen.notes}`,
              sacCode: '998231',
              quantity: 1,
              rate: scen.rate,
              amount: scen.rate,
              gstPercentage: 18,
              cgst: gst / 2,
              sgst: gst / 2,
              igst: 0,
              total: total,
            },
          ],
          totals: {
            subtotal: scen.rate,
            taxTotal: gst,
            cgstTotal: gst / 2,
            sgstTotal: gst / 2,
            igstTotal: 0,
            roundOff: 0,
            grandTotal: total,
          },
          creditAppliedToInvoice: scen.applied,
          unallocatedCredit: scen.unallocated,
          status: scen.status as any,
          refundDetails: scen.refund as any,
          notes: scen.notes,
          createdBy: DEEPAK_USER_ID,
        });

        // Link credit note to the invoice
        if (!invoice.creditNoteIds) invoice.creditNoteIds = [];
        invoice.creditNoteIds.push(cn._id as mongoose.Types.ObjectId);
        if (scen.applied > 0) {
          invoice.totals.amountDue = Math.max(0, invoice.totals.amountDue - scen.applied);
          if (invoice.totals.amountDue === 0 && invoice.status !== 'Paid') {
            invoice.status = 'Paid';
          }
        }
        await invoice.save();

        seededCreditNotesCount++;
      }
    }
    console.log(`✅ Seeded ${seededCreditNotesCount} Credit Notes (Applied, Issued & Refunded) with invoice adjustments.\n`);

    // =========================================================================
    // MODULE 4: CLIENT PORTAL PASSWORD VAULT
    // =========================================================================
    console.log('🔐 Seeding Client Portal Password Vault with AES-256 for ALL clients...');
    const portalMasters = await PortalMaster.find();
    let seededPasswordsCount = 0;

    const portalConfigs = [
      { name: 'GST Portal', url: 'https://services.gst.gov.in/services/login', usernamePrefix: 'gstin' },
      { name: 'Income Tax e-Filing Portal', url: 'https://eportal.incometax.gov.in/', usernamePrefix: 'pan' },
      { name: 'MCA (Ministry of Corporate Affairs) / V3', url: 'https://www.mca.gov.in/', usernamePrefix: 'corp' },
      { name: 'TRACES (TDS CPC)', url: 'https://www.tdscpc.gov.in/app/login.xhtml', usernamePrefix: 'tan' },
      { name: 'EPFO Unified Portal', url: 'https://unifiedportal-emp.epfindia.gov.in/epfo/', usernamePrefix: 'epf' },
      { name: 'State Commercial Tax / VAT / PT', url: 'https://commercialtax.gov.in/', usernamePrefix: 'pt' },
    ];

    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];

      // Give each client 3 to 4 distinct portal credentials
      for (let j = 0; j < 3; j++) {
        const pcfg = portalConfigs[(i + j) % portalConfigs.length];
        const master = portalMasters.find(pm => pm.name.toLowerCase().includes(pcfg.name.toLowerCase().split(' ')[0]));

        let username = '';
        if (pcfg.usernamePrefix === 'gstin' && client.gstin) {
          username = client.gstin;
        } else if (pcfg.usernamePrefix === 'pan' && client.pan) {
          username = client.pan;
        } else {
          username = `${client.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 8)}_${pcfg.usernamePrefix}`;
        }

        const plainPassword = `Secure@${client.pan || 'Pass'}#${2026 + j}`;
        const { encryptedPassword, iv } = encryptPassword(plainPassword);

        const existingPw = await ClientPassword.findOne({
          tenantId: TENANT_ID,
          clientId: client._id,
          portalName: pcfg.name,
        });

        if (!existingPw) {
          await ClientPassword.create({
            tenantId: TENANT_ID,
            clientId: client._id,
            portalId: master ? master._id : undefined,
            portalName: pcfg.name,
            portalUrl: pcfg.url,
            username: username,
            encryptedPassword: encryptedPassword,
            iv: iv,
            notes: `Authorized filing credentials for ${client.name}. Encrypted via AES-256.`,
            lastVerifiedDate: new Date(Date.now() - (j * 86400000 * 5)),
            createdBy: DEEPAK_USER_ID,
            updatedBy: priyaUser._id,
          });
          seededPasswordsCount++;
        }
      }
    }
    console.log(`✅ Seeded ${seededPasswordsCount} AES-256 Encrypted Portal Credentials across all 10 clients.\n`);

    // =========================================================================
    // MODULE 5: DOCUMENT REQUESTS HUB
    // =========================================================================
    console.log('📬 Seeding Document Requests Hub linked to Tasks for ALL clients...');
    const docRequestTemplates = [
      {
        title: 'Q3 FY 2026 Bank Statements & GSTR-2B Registers',
        instructions: 'Please upload original bank statement PDFs (HDFC/ICICI) and purchase excel registers for quarterly reconciliation.',
        items: [
          { name: 'HDFC Current Account Bank Statement (Oct-Dec 2026)', isRequired: true, acceptedFormats: ['.pdf'] },
          { name: 'Purchase Invoices & GSTR-2B Mismatch Register', isRequired: true, acceptedFormats: ['.xlsx', '.csv'] },
          { name: 'Expense Receipts & Vouchers ZIP', isRequired: false, acceptedFormats: ['.zip', '.pdf'] },
        ],
        status: 'Partially Uploaded',
      },
      {
        title: 'AOC-4 Financial Schedules & Auditor Signed Report',
        instructions: 'Required for MCA annual filing. Please ensure the balance sheet is signed by both directors.',
        items: [
          { name: 'Signed Balance Sheet & PnL Report', isRequired: true, acceptedFormats: ['.pdf'] },
          { name: 'Director Report with Disclosures', isRequired: true, acceptedFormats: ['.pdf', '.docx'] },
          { name: 'Auditor Certificate on Non-Acceptance of Deposits', isRequired: true, acceptedFormats: ['.pdf'] },
        ],
        status: 'Completed',
      },
      {
        title: 'Form 16 & Salary Registers for Q3 24Q Filing',
        instructions: 'Submit month-wise employee payroll sheets and investment declaration proofs.',
        items: [
          { name: 'Monthly Salary Register (Oct-Nov-Dec)', isRequired: true, acceptedFormats: ['.xlsx'] },
          { name: 'Tax Computation & Declarations Proofs', isRequired: false, acceptedFormats: ['.pdf', '.zip'] },
        ],
        status: 'Pending',
      },
      {
        title: 'DIR-3 KYC Passport & Aadhaar Self-Attested Copy',
        instructions: 'Mandatory annual director KYC. Mobile and email verification OTP will be required.',
        items: [
          { name: 'Self-Attested PAN Card Copy', isRequired: true, acceptedFormats: ['.pdf', '.jpg', '.png'] },
          { name: 'Self-Attested Aadhaar Card (Both Sides)', isRequired: true, acceptedFormats: ['.pdf', '.jpg'] },
          { name: 'Passport / Electricity Bill Address Proof', isRequired: true, acceptedFormats: ['.pdf'] },
        ],
        status: 'Completed',
      },
    ];

    let seededDocRequestsCount = 0;
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const clientTask = tasks.find(t => t.clientId.toString() === client._id.toString());
      const tpl = docRequestTemplates[i % docRequestTemplates.length];
      const reqNo = `DOC-REQ-2026-${String(i + 1).padStart(3, '0')}`;

      let docReq = await DocumentRequest.findOne({ tenantId: TENANT_ID, requestNo: reqNo });
      if (!docReq) {
        const token = crypto.randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + 14 * 86400000); // 14 days expiry

        const itemsWithStatus = tpl.items.map((it, idx) => {
          let itemStatus: 'Pending' | 'Uploaded' = 'Pending';
          if (tpl.status === 'Completed') itemStatus = 'Uploaded';
          else if (tpl.status === 'Partially Uploaded' && idx === 0) itemStatus = 'Uploaded';

          return {
            name: it.name,
            isRequired: it.isRequired,
            acceptedFormats: it.acceptedFormats,
            status: itemStatus,
            uploadedAt: itemStatus === 'Uploaded' ? new Date(Date.now() - (idx + 1) * 86400000) : undefined,
          };
        });

        await DocumentRequest.create({
          tenantId: TENANT_ID,
          clientId: client._id,
          taskId: clientTask ? clientTask._id : undefined,
          requestNo: reqNo,
          title: `${tpl.title} (${client.name})`,
          instructions: tpl.instructions,
          token: token,
          items: itemsWithStatus,
          expiresAt: expiresAt,
          status: tpl.status as any,
          createdBy: amitUser._id,
        });
        seededDocRequestsCount++;
      }
    }
    console.log(`✅ Seeded ${seededDocRequestsCount} Document Requests linked to client compliance tasks.\n`);

    console.log('=================================================================');
    console.log('🎉 ALL REQUESTED MODULES SUCCESSFULLY POPULATED ON LIVE ATLAS:');
    console.log(` - Reimbursable Expenses & Outlays : Seeded with Billed/Unbilled links`);
    console.log(` - Digital Payments Ledger         : Seeded & linked to Invoices/Receipts`);
    console.log(` - Financial Credit Notes          : Seeded with Multi-Doc reconciliations`);
    console.log(` - Client Password Vault           : 30+ Credentials encrypted via AES-256`);
    console.log(` - Document Requests Hub           : Seeded & linked to Client Tasks`);
    console.log('=================================================================\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seedCompletePracticeModules();

