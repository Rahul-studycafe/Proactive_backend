import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { User } from '../src/modules/auth/schemas/user.schema';
import { Client } from '../src/modules/clients/schemas/client.schema';
import { Service } from '../src/modules/services/schemas/service.schema';
import { Organization } from '../src/modules/auth/schemas/organization.schema';
import { Task, TASK_STATUSES } from '../src/models/Task';

const TENANT_ID = new mongoose.Types.ObjectId('6a3f7e69fd80b3e6b26c0762'); // Rahul and co

const additionalClientsData = [
  {
    name: 'Apex Infotech Pvt Ltd',
    fileNo: 'F-2026-004',
    entityType: 'Private Limited',
    email: 'accounts@apexinfotech.in',
    mobile: '9820112233',
    pan: 'AABCA1234F',
    gstin: '27AABCA1234F1Z1',
    city: 'Mumbai',
    state: 'Maharashtra',
    tags: ['Corporate', 'Monthly Retainer', 'VIP'],
  },
  {
    name: 'Reliance Agro Logistics LLP',
    fileNo: 'F-2026-005',
    entityType: 'LLP',
    email: 'tax@relagrologistics.com',
    mobile: '9820223344',
    pan: 'AALFR5678G',
    gstin: '27AALFR5678G1Z2',
    city: 'Pune',
    state: 'Maharashtra',
    tags: ['Logistics', 'Audit Required'],
  },
  {
    name: 'Sharma Medical & Healthcare',
    fileNo: 'F-2026-006',
    entityType: 'Partnership Firm',
    email: 'contact@sharmamedical.in',
    mobile: '9820334455',
    pan: 'AABFS9012H',
    gstin: '27AABFS9012H1Z3',
    city: 'Thane',
    state: 'Maharashtra',
    tags: ['Retail', 'Quarterly'],
  },
  {
    name: 'Zenith FinTech Solutions',
    fileNo: 'F-2026-007',
    entityType: 'Private Limited',
    email: 'finance@zenithfintech.io',
    mobile: '9820445566',
    pan: 'AACZ78901J',
    gstin: '27AACZ78901J1Z4',
    city: 'Bengaluru',
    state: 'Karnataka',
    tags: ['Fintech', 'Statutory Audit', 'High Value'],
  },
  {
    name: 'BlueStar Hospitality Group',
    fileNo: 'F-2026-008',
    entityType: 'Private Limited',
    email: 'gm.accounts@bluestarhotels.in',
    mobile: '9820556677',
    pan: 'AABCB3456K',
    gstin: '27AABCB3456K1Z5',
    city: 'Mumbai',
    state: 'Maharashtra',
    tags: ['Hospitality', 'GST Inverted'],
  },
];

const standardServicesData = [
  {
    name: 'GSTR-3B & GSTR-1 Return Filing',
    sacCode: '998231',
    gstPercentage: 18,
    defaultBillingRate: 3500,
    isBillable: true,
    isRecurring: true,
    recurringConfig: { frequency: 'monthly', recurringDayOfMonth: 20 },
    checklist: [
      { stepName: 'Collect Purchase & Sales Registers', orderIndex: 1 },
      { stepName: 'GSTR-2B ITC Matching & Reconciliation', orderIndex: 2 },
      { stepName: 'Tax Liability Computation & Client Confirmation', orderIndex: 3 },
      { stepName: 'Challan PMT-06 Generation & Payment Verification', orderIndex: 4 },
      { stepName: 'GSTR-3B Filing & EVC/DSC Verification', orderIndex: 5 },
    ],
  },
  {
    name: 'Corporate Income Tax Return (ITR-6)',
    sacCode: '998232',
    gstPercentage: 18,
    defaultBillingRate: 15000,
    isBillable: true,
    isRecurring: true,
    recurringConfig: { frequency: 'yearly', recurringMonth: 10, recurringDayOfMonth: 31 },
    checklist: [
      { stepName: 'Review Audited Financial Statements', orderIndex: 1 },
      { stepName: 'Compute Disallowances u/s 40(a)(ia) & 43B', orderIndex: 2 },
      { stepName: 'Verify Form 26AS & AIS/TIS Tax Credits', orderIndex: 3 },
      { stepName: 'MAT / Normal Tax Comparison & Tax Computation', orderIndex: 4 },
      { stepName: 'Upload XML/JSON & File with Digital Signature (DSC)', orderIndex: 5 },
    ],
  },
  {
    name: 'Statutory Audit & Tax Audit (Form 3CD)',
    sacCode: '998221',
    gstPercentage: 18,
    defaultBillingRate: 40000,
    isBillable: true,
    isRecurring: true,
    recurringConfig: { frequency: 'yearly', recurringMonth: 9, recurringDayOfMonth: 30 },
    checklist: [
      { stepName: 'Engagement Letter & Audit Planning', orderIndex: 1 },
      { stepName: 'Trial Balance & Ledger Scrutiny', orderIndex: 2 },
      { stepName: 'Vouching of Fixed Assets, Debtors & Creditors', orderIndex: 3 },
      { stepName: 'Form 3CD Clause-by-Clause Verification', orderIndex: 4 },
      { stepName: 'Sign Audit Report & UDIN Generation on ICAI Portal', orderIndex: 5 },
    ],
  },
  {
    name: 'TDS Return Filing (Form 26Q / 24Q)',
    sacCode: '998231',
    gstPercentage: 18,
    defaultBillingRate: 3000,
    isBillable: true,
    isRecurring: true,
    recurringConfig: { frequency: 'quarterly', recurringDayOfMonth: 31 },
    checklist: [
      { stepName: 'Deductor Challan Verification (OLTAS)', orderIndex: 1 },
      { stepName: 'PAN Validation of All Deductees', orderIndex: 2 },
      { stepName: 'Run RPU / FVU Validation Utility', orderIndex: 3 },
      { stepName: 'Upload FVU File to Income Tax e-Filing Portal', orderIndex: 4 },
      { stepName: 'Generate Form 16 / 16A from TRACES', orderIndex: 5 },
    ],
  },
  {
    name: 'ROC Annual Compliance (AOC-4 & MGT-7)',
    sacCode: '998213',
    gstPercentage: 18,
    defaultBillingRate: 9500,
    isBillable: true,
    isRecurring: true,
    recurringConfig: { frequency: 'yearly', recurringMonth: 11, recurringDayOfMonth: 30 },
    checklist: [
      { stepName: 'Board Resolution & AGM Minutes Drafting', orderIndex: 1 },
      { stepName: 'Directors Report & Financial Attachments Review', orderIndex: 2 },
      { stepName: 'Prepare Form AOC-4 XBRL / PDF Form', orderIndex: 3 },
      { stepName: 'Prepare Form MGT-7 Annual Return', orderIndex: 4 },
      { stepName: 'Affix Director DSC & Upload on MCA V3 Portal', orderIndex: 5 },
    ],
  },
  {
    name: 'Company Incorporation (SPICe+ Part A & B)',
    sacCode: '998213',
    gstPercentage: 18,
    defaultBillingRate: 18000,
    isBillable: true,
    isRecurring: false,
    checklist: [
      { stepName: 'Name Reservation RUN Form Filing', orderIndex: 1 },
      { stepName: 'Draft Memorandum (MOA) & Articles of Association (AOA)', orderIndex: 2 },
      { stepName: 'Director DSC & KYC Verification', orderIndex: 3 },
      { stepName: 'Submit SPICe+ Part B, AGILE-PRO-S & INC-9', orderIndex: 4 },
      { stepName: 'Certificate of Incorporation & PAN/TAN Handover', orderIndex: 5 },
    ],
  },
  {
    name: 'PF & ESIC Monthly Compliance & ECR',
    sacCode: '998222',
    gstPercentage: 18,
    defaultBillingRate: 4500,
    isBillable: true,
    isRecurring: true,
    recurringConfig: { frequency: 'monthly', recurringDayOfMonth: 15 },
    checklist: [
      { stepName: 'Monthly Wage Sheet & Attendance Collation', orderIndex: 1 },
      { stepName: 'Compute PF (12%) and ESIC (0.75%/3.25%) Contributions', orderIndex: 2 },
      { stepName: 'Generate ECR Text File & Upload to EPFO Unified Portal', orderIndex: 3 },
      { stepName: 'Generate & Confirm EPFO & ESIC Payment Challans', orderIndex: 4 },
    ],
  },
  {
    name: 'Advance Tax Calculation & Challan 280',
    sacCode: '998232',
    gstPercentage: 18,
    defaultBillingRate: 3500,
    isBillable: true,
    isRecurring: true,
    recurringConfig: { frequency: 'quarterly', recurringDayOfMonth: 15 },
    checklist: [
      { stepName: 'Collate Q2 Estimated Net Profit & Loss', orderIndex: 1 },
      { stepName: 'Compute Estimated Tax Liability & Prior TDS Deductions', orderIndex: 2 },
      { stepName: 'Determine Installment Obligation (45% by 15 Sept / 75% by 15 Dec)', orderIndex: 3 },
      { stepName: 'Generate e-Payment Challan 280 & Share with Client', orderIndex: 4 },
    ],
  },
  {
    name: 'GST Refund Application (Inverted Duty)',
    sacCode: '998231',
    gstPercentage: 18,
    defaultBillingRate: 20000,
    isBillable: true,
    isRecurring: false,
    checklist: [
      { stepName: 'Prepare Statement 1 & 1A for Inverted Duty Structure', orderIndex: 1 },
      { stepName: 'Reconcile Invoices with GSTR-2B & Physical Invoices', orderIndex: 2 },
      { stepName: 'Calculate Net ITC and Adjusted Total Turnover Formula', orderIndex: 3 },
      { stepName: 'File RFD-01 Application on GST Portal with CA Certificate', orderIndex: 4 },
      { stepName: 'Follow Up on RFD-02 Acknowledgement / RFD-06 Sanction Order', orderIndex: 5 },
    ],
  },
  {
    name: 'Monthly Bookkeeping & Bank Reconciliation',
    sacCode: '998222',
    gstPercentage: 18,
    defaultBillingRate: 8000,
    isBillable: true,
    isRecurring: true,
    recurringConfig: { frequency: 'monthly', recurringDayOfMonth: 10 },
    checklist: [
      { stepName: 'Import Bank Statements & Ledger Vouchers into Tally / Zoho', orderIndex: 1 },
      { stepName: 'Perform Multi-Bank Reconciliation', orderIndex: 2 },
      { stepName: 'Verify Creditors Aging & Outstanding Ledger Balances', orderIndex: 3 },
      { stepName: 'Issue Monthly Management MIS Financial Report', orderIndex: 4 },
    ],
  },
];

const sampleTaskTemplates = [
  // Overdue Tasks
  {
    serviceName: 'GSTR-3B & GSTR-1 Return Filing',
    clientName: 'SURYA',
    description: 'Filing GSTR-3B for September 2026. Delay due to late sales invoice submission by client factory.',
    status: 'In Progress',
    priority: 'Urgent',
    daysOffset: -3, // 3 days overdue
    billableAmount: 3500,
    isBilled: false,
    timeLogged: 120,
    periodLabel: 'Sep 2026',
    completedSteps: [0, 1],
  },
  {
    serviceName: 'Advance Tax Calculation & Challan 280',
    clientName: 'Acme Enterprises',
    description: 'Q2 advance tax computation and Challan 280 generation for proprietor Mr. Rajesh Gupta.',
    status: 'Pending',
    priority: 'High',
    daysOffset: -2,
    billableAmount: 3500,
    isBilled: false,
    timeLogged: 30,
    periodLabel: 'Q2 FY 26-27',
    completedSteps: [0],
  },
  {
    serviceName: 'PF & ESIC Monthly Compliance & ECR',
    clientName: 'Nation',
    description: 'EPFO monthly return filing and wage sheet collation for 42 firm employees.',
    status: 'On Hold',
    priority: 'Medium',
    daysOffset: -4,
    billableAmount: 4500,
    isBilled: false,
    timeLogged: 60,
    periodLabel: 'Sep 2026',
    completedSteps: [0],
  },

  // Due Today / Tomorrow Tasks
  {
    serviceName: 'TDS Return Filing (Form 26Q / 24Q)',
    clientName: 'Apex Infotech Pvt Ltd',
    description: 'Quarterly TDS return 26Q preparation. Section 194C contractor and 194J professional fee deductions.',
    status: 'In Progress',
    priority: 'Urgent',
    daysOffset: 0, // Due Today
    billableAmount: 3000,
    isBilled: false,
    timeLogged: 90,
    periodLabel: 'Q2 (Jul-Sep)',
    completedSteps: [0, 1, 2],
  },
  {
    serviceName: 'GSTR-3B & GSTR-1 Return Filing',
    clientName: 'Zenith FinTech Solutions',
    description: 'Monthly GSTR-1 outward supplies return with zero-rated export invoices and B2B domestic transactions.',
    status: 'Under Review',
    priority: 'High',
    daysOffset: 1, // Due Tomorrow
    billableAmount: 4500,
    isBilled: false,
    timeLogged: 150,
    periodLabel: 'Oct 2026',
    completedSteps: [0, 1, 2, 3],
  },
  {
    serviceName: 'Corporate Income Tax Return (ITR-6)',
    clientName: 'BlueStar Hospitality Group',
    description: 'ITR-6 corporate tax return filing. Includes loss carry-forward review and 80JJAA employment tax deduction.',
    status: 'Under Review',
    priority: 'Urgent',
    daysOffset: 2,
    billableAmount: 18000,
    isBilled: false,
    timeLogged: 240,
    periodLabel: 'AY 2026-27',
    completedSteps: [0, 1, 2, 3],
  },
  {
    serviceName: 'Monthly Bookkeeping & Bank Reconciliation',
    clientName: 'Sharma Medical & Healthcare',
    description: 'Monthly pharmacy stock accounting, credit supplier tally entry, and HDFC current account reconciliation.',
    status: 'In Progress',
    priority: 'Medium',
    daysOffset: 3,
    billableAmount: 8000,
    isBilled: false,
    timeLogged: 180,
    periodLabel: 'Oct 2026',
    completedSteps: [0, 1],
  },
  {
    serviceName: 'ROC Annual Compliance (AOC-4 & MGT-7)',
    clientName: 'Reliance Agro Logistics LLP',
    description: 'Preparation of Form 11 and LLP Form 8 annual solvency statements for ROC Pune registrar.',
    status: 'Pending',
    priority: 'Medium',
    daysOffset: 5,
    billableAmount: 9500,
    isBilled: false,
    timeLogged: 0,
    periodLabel: 'FY 2025-26',
    completedSteps: [],
  },

  // Completed Tasks
  {
    serviceName: 'Company Incorporation (SPICe+ Part A & B)',
    clientName: 'Zenith FinTech Solutions',
    description: 'New private limited incorporation under MCA V3 portal. COI issued with PAN, TAN, EPFO and ESIC registrations.',
    status: 'Completed',
    priority: 'High',
    daysOffset: -12,
    billableAmount: 18000,
    isBilled: true,
    timeLogged: 360,
    periodLabel: 'One-time',
    completedSteps: [0, 1, 2, 3, 4],
  },
  {
    serviceName: 'GSTR-3B & GSTR-1 Return Filing',
    clientName: 'Acme Enterprises',
    description: 'August 2026 GSTR-3B successfully filed and acknowledged. ₹14,200 electronic cash ledger utilized.',
    status: 'Completed',
    priority: 'Low',
    daysOffset: -25,
    billableAmount: 3500,
    isBilled: true,
    timeLogged: 75,
    periodLabel: 'Aug 2026',
    completedSteps: [0, 1, 2, 3, 4],
  },
  {
    serviceName: 'TDS Return Filing (Form 26Q / 24Q)',
    clientName: 'SURYA',
    description: 'Q1 TDS return filed and validated through NSDL FVU. Form 16A certificates generated from TRACES portal.',
    status: 'Completed',
    priority: 'Medium',
    daysOffset: -40,
    billableAmount: 3000,
    isBilled: true,
    timeLogged: 90,
    periodLabel: 'Q1 FY 26-27',
    completedSteps: [0, 1, 2, 3, 4],
  },
  {
    serviceName: 'Statutory Audit & Tax Audit (Form 3CD)',
    clientName: 'Apex Infotech Pvt Ltd',
    description: 'Tax Audit under Section 44AB completed. UDIN generated and Form 3CA-3CD approved by Board of Directors.',
    status: 'Completed',
    priority: 'Urgent',
    daysOffset: -18,
    billableAmount: 40000,
    isBilled: true,
    timeLogged: 600,
    periodLabel: 'AY 2026-27',
    completedSteps: [0, 1, 2, 3, 4],
  },

  // More In Progress & Under Review Tasks
  {
    serviceName: 'GST Refund Application (Inverted Duty)',
    clientName: 'BlueStar Hospitality Group',
    description: 'Drafting RFD-01 for ₹3,42,000 accumulated input tax credit due to inverted duty rate differences.',
    status: 'In Progress',
    priority: 'High',
    daysOffset: 8,
    billableAmount: 20000,
    isBilled: false,
    timeLogged: 210,
    periodLabel: 'Q1-Q2 FY 26',
    completedSteps: [0, 1],
  },
  {
    serviceName: 'Statutory Audit & Tax Audit (Form 3CD)',
    clientName: 'SURYA',
    description: 'Annual statutory audit and physical stock verification. Finalizing draft balance sheet and notes to accounts.',
    status: 'In Progress',
    priority: 'Urgent',
    daysOffset: 10,
    billableAmount: 45000,
    isBilled: false,
    timeLogged: 320,
    periodLabel: 'FY 2025-26',
    completedSteps: [0, 1, 2],
  },
  {
    serviceName: 'Monthly Bookkeeping & Bank Reconciliation',
    clientName: 'Nation',
    description: 'Tally Prime monthly data entry, expense categorization, and vendor payment schedule review.',
    status: 'Pending',
    priority: 'Low',
    daysOffset: 7,
    billableAmount: 7500,
    isBilled: false,
    timeLogged: 0,
    periodLabel: 'Oct 2026',
    completedSteps: [],
  },
  {
    serviceName: 'Corporate Income Tax Return (ITR-6)',
    clientName: 'Apex Infotech Pvt Ltd',
    description: 'ITR-6 corporate filing verification. Foreign tax credit Form 67 computation for US export revenue.',
    status: 'Pending',
    priority: 'Medium',
    daysOffset: 14,
    billableAmount: 16000,
    isBilled: false,
    timeLogged: 0,
    periodLabel: 'AY 2026-27',
    completedSteps: [],
  },
  {
    serviceName: 'GSTR-3B & GSTR-1 Return Filing',
    clientName: 'Reliance Agro Logistics LLP',
    description: 'Quarterly QRMP scheme return preparation. Verification of purchase register against auto-populated GSTR-2B.',
    status: 'On Hold',
    priority: 'Medium',
    daysOffset: 6,
    billableAmount: 4000,
    isBilled: false,
    timeLogged: 45,
    periodLabel: 'Q2 (Jul-Sep)',
    completedSteps: [0],
  },
  {
    serviceName: 'TDS Return Filing (Form 26Q / 24Q)',
    clientName: 'Sharma Medical & Healthcare',
    description: 'Section 194C transport payments TDS calculation. Client awaiting PAN copies of 3 bulk suppliers.',
    status: 'On Hold',
    priority: 'Low',
    daysOffset: 12,
    billableAmount: 2500,
    isBilled: false,
    timeLogged: 20,
    periodLabel: 'Q2 (Jul-Sep)',
    completedSteps: [0],
  },
  {
    serviceName: 'PF & ESIC Monthly Compliance & ECR',
    clientName: 'BlueStar Hospitality Group',
    description: 'Staff attendance collation across 3 restaurant properties. Processing 68 employee PF accounts.',
    status: 'In Progress',
    priority: 'Medium',
    daysOffset: 4,
    billableAmount: 6000,
    isBilled: false,
    timeLogged: 110,
    periodLabel: 'Oct 2026',
    completedSteps: [0, 1],
  },
  {
    serviceName: 'ROC Annual Compliance (AOC-4 & MGT-7)',
    clientName: 'SURYA',
    description: 'Preparation of Form MGT-7A (Abridged annual return) and AOC-4 with auditor report attachment.',
    status: 'Under Review',
    priority: 'High',
    daysOffset: 9,
    billableAmount: 10500,
    isBilled: false,
    timeLogged: 240,
    periodLabel: 'FY 2025-26',
    completedSteps: [0, 1, 2, 3],
  },
  {
    serviceName: 'Advance Tax Calculation & Challan 280',
    clientName: 'Zenith FinTech Solutions',
    description: 'Advance tax installment estimation based on Q2 SaaS subscription recurring revenue projections.',
    status: 'Under Review',
    priority: 'Medium',
    daysOffset: 5,
    billableAmount: 5000,
    isBilled: false,
    timeLogged: 95,
    periodLabel: 'Q3 FY 26-27',
    completedSteps: [0, 1, 2],
  },
  {
    serviceName: 'Monthly Bookkeeping & Bank Reconciliation',
    clientName: 'Acme Enterprises',
    description: 'Retail cash book and daily ledger posting for warehouse transactions. Checking GST credit notes.',
    status: 'Cancelled',
    priority: 'Low',
    daysOffset: -10,
    billableAmount: 5000,
    isBilled: false,
    timeLogged: 15,
    periodLabel: 'Aug 2026',
    completedSteps: [],
  },
];

async function seedDiverseTasks() {
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log('✅ Connected to MongoDB');

    // 1. Ensure additional clients exist for variety
    console.log('Verifying & seeding clients...');
    for (const cData of additionalClientsData) {
      const existing = await Client.findOne({ tenantId: TENANT_ID, name: cData.name });
      if (!existing) {
        await Client.create({
          ...cData,
          tenantId: TENANT_ID,
          isActive: true,
          openingBalance: 0,
        });
        console.log(`  + Created client: ${cData.name}`);
      }
    }

    const allClients = await Client.find({ tenantId: TENANT_ID }).lean();
    const clientMap = new Map<string, any>();
    allClients.forEach((c) => clientMap.set(c.name, c));

    // 2. Ensure standard services exist
    console.log('Verifying & seeding services...');
    for (const sData of standardServicesData) {
      const existing = await Service.findOne({ tenantId: TENANT_ID, name: sData.name });
      if (!existing) {
        await Service.create({
          tenantId: TENANT_ID,
          name: sData.name,
          sacCode: sData.sacCode,
          gstPercentage: sData.gstPercentage,
          defaultBillingRate: sData.defaultBillingRate,
          isBillable: sData.isBillable,
          isRecurring: sData.isRecurring,
          isEnabled: true,
          isWorkflowEnabled: false,
          isChecklistRequired: true,
          assignedUsers: [],
          checklist: sData.checklist.map((c) => ({ stepName: c.stepName, orderIndex: c.orderIndex })),
          subtasks: [],
          customFieldsDef: [],
          gstApiConfig: { isEnabled: false },
          autoDocCollection: { isEnabled: false },
        });
        console.log(`  + Created service: ${sData.name}`);
      }
    }

    const allServices = await Service.find({ tenantId: TENANT_ID }).lean();
    const serviceMap = new Map<string, any>();
    allServices.forEach((s) => serviceMap.set(s.name, s));

    // 3. Get all active staff users
    const allUsers = await User.find({ tenantId: TENANT_ID, isActive: true }).select('_id name email').lean();
    if (allUsers.length === 0) {
      throw new Error('No users found in tenant');
    }
    console.log(`Found ${allUsers.length} staff users to distribute tasks across.`);

    // 4. Clear old test tasks if requested or seed directly
    const existingTaskCount = await Task.countDocuments({ tenantId: TENANT_ID });
    console.log(`Existing task count: ${existingTaskCount}`);

    console.log('Seeding diverse tasks...');
    let createdCount = 0;
    const now = Date.now();

    for (let i = 0; i < sampleTaskTemplates.length; i++) {
      const t = sampleTaskTemplates[i];
      const client = clientMap.get(t.clientName) || allClients[i % allClients.length];
      const service = serviceMap.get(t.serviceName) || allServices[i % allServices.length];

      // Assign to 1 or 2 users
      const primaryUser = allUsers[i % allUsers.length];
      const secondaryUser = (i % 3 === 0 && allUsers.length > 1)
        ? allUsers[(i + 1) % allUsers.length]
        : null;

      const assigneeIds = [primaryUser._id];
      if (secondaryUser) assigneeIds.push(secondaryUser._id);

      // Due date calculation
      const dueDate = new Date(now + t.daysOffset * 86400000);
      const targetDate = new Date(dueDate.getTime() - 2 * 86400000);

      // Checklist instances
      const checklistInstances = (service.checklist || []).map((step: any, idx: number) => {
        const isDone = t.status === 'Completed' || t.completedSteps.includes(idx);
        return {
          stepName: step.stepName,
          isCompleted: isDone,
          completedAt: isDone ? new Date(now - Math.floor(Math.random() * 5) * 86400000) : undefined,
          completedBy: isDone ? primaryUser._id : undefined,
        };
      });

      // Subtasks
      const subtasks = [
        {
          title: `Document Verification & Input Collation for ${client.name}`,
          description: 'Ensure all supporting challans and vendor invoices are collected in digital vault.',
          assignedUserId: secondaryUser ? secondaryUser._id : primaryUser._id,
          dueDate: targetDate,
          status: t.status === 'Completed' ? 'Completed' : t.status === 'In Progress' ? 'Completed' : 'Pending',
        },
        {
          title: 'Final Quality Review & Partner Approval',
          description: 'Cross-check computations with CA partner before portal submission.',
          assignedUserId: primaryUser._id,
          dueDate: dueDate,
          status: t.status === 'Completed' ? 'Completed' : t.status === 'Under Review' ? 'In Progress' : 'Pending',
        },
      ];

      // Time Logs
      const timeLogs = [];
      if (t.timeLogged > 0) {
        timeLogs.push({
          userId: primaryUser._id,
          minutes: t.timeLogged,
          description: `Worked on ${service.name} for ${client.name}`,
          loggedAt: new Date(now - Math.floor(Math.random() * 3) * 86400000),
        });
      }

      await Task.create({
        tenantId: TENANT_ID,
        clientId: client._id,
        serviceId: service._id,
        assigneeIds,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate,
        targetDate,
        completedAt: t.status === 'Completed' ? new Date(now - 86400000) : undefined,
        creationType: 'manual',
        checklist: checklistInstances,
        subtasks,
        period: {
          month: new Date(dueDate).getMonth() + 1,
          year: new Date(dueDate).getFullYear(),
          label: t.periodLabel,
        },
        isBillable: true,
        billableAmount: t.billableAmount,
        billingAmount: t.billableAmount,
        isBilled: t.isBilled,
        tags: [client.entityType, t.priority, t.periodLabel].filter(Boolean),
        timeLogged: t.timeLogged,
        timeLogs,
      });

      createdCount++;
    }

    const finalCount = await Task.countDocuments({ tenantId: TENANT_ID });
    console.log(`🎉 Successfully created ${createdCount} diverse sample tasks!`);
    console.log(`Total tasks in tenant: ${finalCount}`);

    // Print summary by status
    const statusAgg = await Task.aggregate([
      { $match: { tenantId: TENANT_ID } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    console.log('\nTask Distribution by Status:');
    statusAgg.forEach((s) => console.log(`  - ${s._id}: ${s.count}`));

    // Print summary by priority
    const priorityAgg = await Task.aggregate([
      { $match: { tenantId: TENANT_ID } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]);
    console.log('\nTask Distribution by Priority:');
    priorityAgg.forEach((p) => console.log(`  - ${p._id}: ${p.count}`));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seedDiverseTasks();
