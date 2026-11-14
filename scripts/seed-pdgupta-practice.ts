import dns from 'node:dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore fallback
}

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { User } from '../src/modules/auth/schemas/user.schema';
import { Organization } from '../src/modules/auth/schemas/organization.schema';
import { Role } from '../src/modules/roles/schemas/role.schema';
import { RoleSeederService } from '../src/services/role-seeder.service';
import { Client } from '../src/modules/clients/schemas/client.schema';
import { Service } from '../src/modules/services/schemas/service.schema';
import { Task } from '../src/models/Task';
import { Attendance } from '../src/models/Attendance';
import { Invoice } from '../src/models/Invoice';
import { Receipt } from '../src/models/Receipt';
import { DSC } from '../src/models/DSC';
import { PhysicalDocument } from '../src/models/PhysicalDocument';

const TENANT_ID = new mongoose.Types.ObjectId('6af720ce00e09b30fc93eaba');
const DEEPAK_USER_ID = new mongoose.Types.ObjectId('6af720ce00e09b30fc93eabc');

// Complete 59 CA Practice Services from Competitor Reference
const SERVICES_DATA = [
  { name: 'Advance Tax', isRecurring: true, freq: 'quarterly', day: 15, sac: '998231', rate: 2500, checklist: ['Income Estimation', 'Tax Computation', 'Challan Generation', 'Payment Verification'] },
  { name: 'AOC-4 (Financial Statements)', isRecurring: true, freq: 'yearly', day: 30, sac: '998232', rate: 5000, checklist: ['Balance Sheet Finalization', 'Auditor Report Attachment', 'XBRL Validation', 'MCA Portal Upload'] },
  { name: 'CMP-08', isRecurring: true, freq: 'quarterly', day: 18, sac: '998231', rate: 1500, checklist: ['Turnover Verification', 'Tax Calculation (1%)', 'Challan Payment', 'Filing on GST Portal'] },
  { name: 'DIR-3 KYC (Director KYC)', isRecurring: true, freq: 'yearly', day: 30, sac: '998232', rate: 1000, checklist: ['OTP Verification (Mobile/Email)', 'Passport / Aadhaar Validation', 'Filing with MCA'] },
  { name: 'DPT-3 (Deposit Return)', isRecurring: true, freq: 'yearly', day: 30, sac: '998232', rate: 3500, checklist: ['Auditor Certificate on Deposits', 'Balance Sheet Reconciliation', 'Form Preparation & Filing'] },
  { name: 'DSC Renewal', isRecurring: false, freq: 'one_time', day: 0, sac: '998313', rate: 2000, checklist: ['Document Collection (PAN, Aadhaar)', 'Video Verification', 'USB Token Download & Dispatch'] },
  { name: 'ESI Payment (Monthly)', isRecurring: true, freq: 'monthly', day: 15, sac: '998231', rate: 1000, checklist: ['Wages Sheet Verification', 'Challan Generation on ESIC', 'Payment Confirmation'] },
  { name: 'ESI Return (Half-Yearly)', isRecurring: true, freq: 'half_yearly', day: 11, sac: '998231', rate: 2500, checklist: ['Form 5 Reconciliation', 'Contribution Verification', 'Portal Submission'] },
  { name: 'Form 11 (Annual Return – LLP)', isRecurring: true, freq: 'yearly', day: 30, sac: '998232', rate: 3500, checklist: ['Partner Details Review', 'Contribution Details', 'DSC Affixation & Filing'] },
  { name: 'FORM 24Q', isRecurring: true, freq: 'quarterly', day: 31, sac: '998231', rate: 2000, checklist: ['Salary TDS Calculation', 'Challan Matching with OLTAS', 'FVU Generation & TRACES Upload'] },
  { name: 'FORM 26Q', isRecurring: true, freq: 'quarterly', day: 31, sac: '998231', rate: 2000, checklist: ['Vendor Invoices TDS Audit', 'Challan Verification', 'FVU Validation & Filing'] },
  { name: 'FORM 27EQ', isRecurring: true, freq: 'quarterly', day: 15, sac: '998231', rate: 2000, checklist: ['TCS Collected Reconciliation', 'Challan Linking', 'TRACES Filing'] },
  { name: 'FORM 27Q', isRecurring: true, freq: 'quarterly', day: 31, sac: '998231', rate: 2500, checklist: ['Non-Resident TDS Computation', '15CA/15CB Cross-Check', 'FVU Generation & Submission'] },
  { name: 'Form 8 (Account & Solvency)', isRecurring: true, freq: 'yearly', day: 30, sac: '998232', rate: 3500, checklist: ['Financial Statement Statement of Solvency', 'Auditor & Partner Signature', 'MCA Filing'] },
  { name: 'GST Amendment', isRecurring: false, freq: 'one_time', day: 0, sac: '998231', rate: 2500, checklist: ['Proof Collection (Address/Partner)', 'Form REG-14 Drafting', 'ARN Generation & Approval Tracking'] },
  { name: 'GST Registration', isRecurring: false, freq: 'one_time', day: 0, sac: '998231', rate: 3000, checklist: ['KYC Collection', 'Application Filing (REG-01)', 'Aadhaar Authentication', 'Certificate Issuance'] },
  { name: 'GSTR 3B (Monthly)', isRecurring: true, freq: 'monthly', day: 20, sac: '998231', rate: 1500, checklist: ['Sales vs Purchase Reconciliation (2B)', 'Input Tax Credit Validation', 'Tax Payment Challan', 'Offset & Filing'] },
  { name: 'GSTR 3B (Quarterly)', isRecurring: true, freq: 'quarterly', day: 22, sac: '998231', rate: 2500, checklist: ['Quarterly ITC Matching', 'Self-Assessment Tax Calculation', 'Filing on GSTN'] },
  { name: 'GSTR-1 (Monthly)', isRecurring: true, freq: 'monthly', day: 11, sac: '998231', rate: 1500, checklist: ['B2B Sales Reconciliation', 'B2C Summary', 'HSN & Document Summary', 'EVC/DSC Verification'] },
  { name: 'GSTR-1 (Quarterly)', isRecurring: true, freq: 'quarterly', day: 13, sac: '998231', rate: 2500, checklist: ['Quarterly Outward Invoices Verification', 'HSN Validation', 'Filing via EVC'] },
  { name: 'GSTR-10', isRecurring: false, freq: 'one_time', day: 0, sac: '998231', rate: 3000, checklist: ['Closing Stock Verification', 'Tax Liability Calculation on Assets', 'Final Return Submission'] },
  { name: 'GSTR-4', isRecurring: true, freq: 'yearly', day: 30, sac: '998231', rate: 3500, checklist: ['Composition Turnover Check', 'CMP-08 Re-conciliation', 'Annual Return Filing'] },
  { name: 'GSTR-7', isRecurring: true, freq: 'monthly', day: 10, sac: '998231', rate: 1500, checklist: ['TDS Deductions Verification', 'Payment Challan Verification', 'Return Filing'] },
  { name: 'GSTR-8', isRecurring: true, freq: 'monthly', day: 10, sac: '998231', rate: 1500, checklist: ['E-Commerce Supplies Reconciliation', 'TCS Deduction Matching', 'GST Portal Submission'] },
  { name: 'GSTR-9', isRecurring: true, freq: 'yearly', day: 31, sac: '998231', rate: 6000, checklist: ['Books vs GSTR-1 vs GSTR-3B Reco', 'Table 8 ITC Reconciliation', 'Draft Preparation & Client Approval', 'Annual Filing'] },
  { name: 'GSTR-9A', isRecurring: true, freq: 'yearly', day: 31, sac: '998231', rate: 4000, checklist: ['Composition Books Audit', 'Table Summary Validation', 'Filing Confirmation'] },
  { name: 'GSTR-9C', isRecurring: true, freq: 'yearly', day: 31, sac: '998231', rate: 8000, checklist: ['Audited Financials Matching', 'Reconciliation Statement Drafting', 'Auditor Certification & Filing'] },
  { name: 'IEC Registration', isRecurring: false, freq: 'one_time', day: 0, sac: '998231', rate: 3000, checklist: ['DGFT Profile Setup', 'Bank Certificate Upload', 'IEC Certificate Download'] },
  { name: 'IEC Renewal', isRecurring: true, freq: 'yearly', day: 30, sac: '998231', rate: 1500, checklist: ['DGFT Annual Validation', 'OTP Verification', 'Renewal Acknowledgement'] },
  { name: 'IFF/GSTR-1', isRecurring: true, freq: 'monthly', day: 13, sac: '998231', rate: 1000, checklist: ['Invoice Furnishing Facility Entry', 'B2B Invoice Validation', 'Submission on Portal'] },
  { name: 'ITR (Audit)', isRecurring: true, freq: 'yearly', day: 31, sac: '998231', rate: 10000, checklist: ['Balance Sheet & PnL Finalization', 'Form 3CA/3CD Integration', 'Computation of Income', 'E-Verification'] },
  { name: 'ITR (Non-Audit)', isRecurring: true, freq: 'yearly', day: 31, sac: '998231', rate: 3500, checklist: ['26AS & AIS/TIS Reconciliation', 'Capital Gains / Salary Computation', 'ITR 1/2/3/4 Filing'] },
  { name: 'LLP Registration', isRecurring: false, freq: 'one_time', day: 0, sac: '998232', rate: 7000, checklist: ['Name Approval (RUN-LLP)', 'FiLLiP Form Filing', 'LLP Agreement Drafting (Form 3)'] },
  { name: 'MGT-7 (Annual Return)', isRecurring: true, freq: 'yearly', day: 29, sac: '998232', rate: 5000, checklist: ['Shareholding Pattern Audit', 'Board Meetings Summary', 'Filing with MCA'] },
  { name: 'MGT-7A (Annual Return)', isRecurring: true, freq: 'yearly', day: 29, sac: '998232', rate: 4000, checklist: ['Small Company Exemption Check', 'Director & Shareholder List', 'MCA Submission'] },
  { name: 'MSME Registration', isRecurring: false, freq: 'one_time', day: 0, sac: '998231', rate: 1500, checklist: ['Udyam Registration Portal Filing', 'Aadhaar & PAN Linking', 'Udyam Certificate Download'] },
  { name: 'MSME-1 (Outstanding to MSME)', isRecurring: true, freq: 'half_yearly', day: 30, sac: '998232', rate: 2500, checklist: ['Vendor Ledger > 45 Days Audit', 'Form MSME-1 Preparation', 'MCA Filing'] },
  { name: 'PAN Card Apply', isRecurring: false, freq: 'one_time', day: 0, sac: '998231', rate: 500, checklist: ['Form 49A/49AA Prep', 'Identity/Address Proof Upload', 'Acknowledgement Dispatch'] },
  { name: 'Partnership Deed', isRecurring: false, freq: 'one_time', day: 0, sac: '998232', rate: 5000, checklist: ['Terms & Profit Ratio Drafting', 'Stamp Duty Calculation', 'Execution & Notarization'] },
  { name: 'PAS-6 (Share Reconciliation)', isRecurring: true, freq: 'half_yearly', day: 29, sac: '998232', rate: 3500, checklist: ['ISIN Verification', 'Dematerialized vs Physical Shares Audit', 'MCA Submission'] },
  { name: 'PF ECR Return (Monthly)', isRecurring: true, freq: 'monthly', day: 15, sac: '998231', rate: 1500, checklist: ['Salary Register PF Extraction', 'ECR File Preparation', 'Unified Portal Upload'] },
  { name: 'PF Payment (Monthly)', isRecurring: true, freq: 'monthly', day: 15, sac: '998231', rate: 1000, checklist: ['Challan Generation', 'NetBanking Payment', 'Payment Receipt Archival'] },
  { name: 'Private Limited Company Registration', isRecurring: false, freq: 'one_time', day: 0, sac: '998232', rate: 12000, checklist: ['Name Reservation (SPICe+ Part A)', 'MOA/AOA Drafting (Part B)', 'Agile Pro S Submission', 'COI Issuance'] },
  { name: 'Project Report', isRecurring: false, freq: 'one_time', day: 0, sac: '998231', rate: 15000, checklist: ['Financial Projections (CMA Data)', 'DSCR & Ratio Analysis', 'Executive Summary Drafting'] },
  { name: 'PT Payment (Monthly)', isRecurring: true, freq: 'monthly', day: 30, sac: '998231', rate: 500, checklist: ['Headcount Slab Calculation', 'State Portal Challan', 'Receipt Archival'] },
  { name: 'PT Payment (Yearly)', isRecurring: true, freq: 'yearly', day: 30, sac: '998231', rate: 1000, checklist: ['Annual PT Liability Assessment', 'Challan Filing', 'Receipt Generation'] },
  { name: 'PT Return (Monthly)', isRecurring: true, freq: 'monthly', day: 30, sac: '998231', rate: 1000, checklist: ['Monthly Return Form Filling', 'Challan Matching', 'Portal Submission'] },
  { name: 'PT Return (Quarterly)', isRecurring: true, freq: 'quarterly', day: 30, sac: '998231', rate: 1500, checklist: ['Quarterly Slab Verification', 'Submission & Acknowledgment'] },
  { name: 'PT Return (Yearly)', isRecurring: true, freq: 'yearly', day: 30, sac: '998231', rate: 2000, checklist: ['Form III-B Preparation', 'Annual Assessment Filing'] },
  { name: 'Statutory Audit (Companies Act)', isRecurring: true, freq: 'yearly', day: 30, sac: '998232', rate: 25000, checklist: ['Internal Controls Audit', 'Vouching & Verification', 'CARO 2020 Compliance', 'Independent Auditor Report'] },
  { name: 'Statutory Audit (LLP Audit)', isRecurring: true, freq: 'yearly', day: 30, sac: '998232', rate: 15000, checklist: ['Books of Accounts Verification', 'Partner Loan & Capital Audit', 'Audit Report Signing'] },
  { name: 'TAN Registration', isRecurring: false, freq: 'one_time', day: 0, sac: '998231', rate: 1500, checklist: ['Form 49B Preparation', 'NSDL Submission', 'Allotment Letter Download'] },
  { name: 'Tax Audit', isRecurring: true, freq: 'yearly', day: 30, sac: '998231', rate: 20000, checklist: ['Section 44AB Applicability Check', 'Form 3CD Annexures Preparation', 'UDIN Generation & Upload'] },
  { name: 'TCS Payment', isRecurring: true, freq: 'monthly', day: 7, sac: '998231', rate: 1000, checklist: ['Challan 281 Generation', 'Bank Payment Verification', 'Record Update'] },
  { name: 'TCS Return', isRecurring: true, freq: 'quarterly', day: 15, sac: '998231', rate: 2000, checklist: ['Form 27EQ File Prep', 'FVU Validation', 'TRACES Filing'] },
  { name: 'TDS Payment (Monthly)', isRecurring: true, freq: 'monthly', day: 7, sac: '998231', rate: 1000, checklist: ['Section 194C/J/I/H Calculation', 'Challan 281 Generation', 'Payment Confirmation'] },
  { name: 'TDS Payment (Quarterly)', isRecurring: true, freq: 'quarterly', day: 7, sac: '998231', rate: 1500, checklist: ['Quarterly Challan Verification', 'Tax Deposit Confirmation'] },
  { name: 'Trust Deed', isRecurring: false, freq: 'one_time', day: 0, sac: '998232', rate: 7500, checklist: ['Trustees & Objects Drafting', 'Stamp Paper Printing', 'Sub-Registrar Registration'] },
  { name: 'Trust Registration', isRecurring: false, freq: 'one_time', day: 0, sac: '998232', rate: 10000, checklist: ['12A & 80G Application (Form 10A)', 'Document Scrutiny', 'Provisional Order Tracking'] },
];

async function seedPdGuptaData() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error('MONGO_URI is missing in .env');

    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB Atlas');

    // 1. Verify Deepak's Organization
    const org = await Organization.findById(TENANT_ID);
    if (!org) {
      throw new Error(`Organization with ID ${TENANT_ID} not found!`);
    }
    console.log(`\n🏢 Seeding for Organization: "${org.name}" (ID: ${org._id})`);

    // 2. Ensure Default Roles Exist
    console.log('\n🔐 Seeding / verifying roles...');
    const rolesMap = await RoleSeederService.seedDefaultRolesForTenant(TENANT_ID);
    console.log(`Roles available: Super Admin, Admin, Accountant, Staff`);

    // 3. Seed Team Members (Users)
    console.log('\n👥 Seeding Team Members...');
    const salt = await bcrypt.genSalt(10);
    const sharedPasswordHash = await bcrypt.hash('Proactive@123', salt);

    const teamMembersData = [
      {
        name: 'Priya Sharma',
        username: 'priya_acc',
        email: 'priya.sharma@pdgupta.com',
        mobile: '+91 98765 11001',
        roleId: rolesMap.adminRole._id,
        roleIds: [rolesMap.adminRole._id],
        isOwner: false,
      },
      {
        name: 'Amit Verma',
        username: 'amit_tax',
        email: 'amit.verma@pdgupta.com',
        mobile: '+91 98765 11002',
        roleId: rolesMap.accountantRole._id,
        roleIds: [rolesMap.accountantRole._id],
        isOwner: false,
      },
      {
        name: 'Rohan Mehta',
        username: 'rohan_gst',
        email: 'rohan.mehta@pdgupta.com',
        mobile: '+91 98765 11003',
        roleId: rolesMap.staffRole._id,
        roleIds: [rolesMap.staffRole._id],
        isOwner: false,
      },
      {
        name: 'Kavita Patel',
        username: 'kavita_audit',
        email: 'kavita.patel@pdgupta.com',
        mobile: '+91 98765 11004',
        roleId: rolesMap.staffRole._id,
        roleIds: [rolesMap.staffRole._id],
        isOwner: false,
      },
    ];

    const allUsers: any[] = [];
    const deepakUser = await User.findById(DEEPAK_USER_ID);
    if (deepakUser) allUsers.push(deepakUser);

    for (const mem of teamMembersData) {
      let u = await User.findOne({ tenantId: TENANT_ID, email: mem.email });
      if (!u) {
        u = await User.create({
          tenantId: TENANT_ID,
          name: mem.name,
          username: mem.username,
          email: mem.email,
          mobile: mem.mobile,
          password: sharedPasswordHash,
          roleId: mem.roleId,
          roleIds: mem.roleIds,
          isOwner: false,
          isActive: true,
          invitationStatus: 'active',
          tokenVersion: 1,
        });
        console.log(` + Created user: ${mem.name} (${mem.username})`);
      } else {
        console.log(` = User already exists: ${mem.name}`);
      }
      allUsers.push(u);
    }

    // 4. Seed Attendance Records (Past 14 Days for all users)
    console.log('\n📅 Seeding Attendance (Past 14 days)...');
    let attendanceCount = 0;
    const now = new Date();

    for (let dayOffset = 14; dayOffset >= 0; dayOffset--) {
      const recordDate = new Date(now);
      recordDate.setDate(now.getDate() - dayOffset);

      // Skip Sundays (day 0)
      if (recordDate.getDay() === 0) continue;

      const dateStr = recordDate.toISOString().split('T')[0];

      for (const u of allUsers) {
        const existingAtt = await Attendance.findOne({
          tenantId: TENANT_ID,
          userId: u._id,
          date: dateStr,
        });

        if (!existingAtt) {
          // Status distribution: 90% Present, 10% Half Day / Leave
          const rand = Math.random();
          let status: 'Present' | 'Half Day' | 'Leave' = 'Present';
          if (rand > 0.95) status = 'Leave';
          else if (rand > 0.9) status = 'Half Day';

          const inTime = new Date(recordDate);
          inTime.setHours(9, Math.floor(Math.random() * 30), 0); // 09:00 - 09:30 AM

          const outTime = new Date(recordDate);
          if (status === 'Half Day') {
            outTime.setHours(14, 0, 0); // 02:00 PM
          } else if (status === 'Present') {
            outTime.setHours(18, 30 + Math.floor(Math.random() * 45), 0); // 06:30 - 07:15 PM
          }

          const totalMinutes = status === 'Present' ? 540 + Math.floor(Math.random() * 30) : status === 'Half Day' ? 270 : 0;
          const overtimeMinutes = totalMinutes > 540 ? totalMinutes - 540 : 0;

          await Attendance.create({
            tenantId: TENANT_ID,
            userId: u._id,
            date: dateStr,
            status: status,
            checkIn: status !== 'Leave' ? inTime : undefined,
            checkOut: status !== 'Leave' ? outTime : undefined,
            totalMinutes,
            overtimeMinutes,
            markedBy: DEEPAK_USER_ID,
            verifiedVia: 'office_ip',
            ipAddress: '122.180.29.10',
            notes: status === 'Leave' ? 'Approved casual leave' : undefined,
          });
          attendanceCount++;
        }
      }
    }
    console.log(`✅ Seeded ${attendanceCount} attendance records.`);

    // 5. Seed 59 Practice Services from Competitor
    console.log('\n🛠️ Seeding Practice Services (59 services)...');
    const createdServices: any[] = [];

    for (const svc of SERVICES_DATA) {
      let existingSvc = await Service.findOne({ tenantId: TENANT_ID, name: svc.name });
      if (!existingSvc) {
        existingSvc = await Service.create({
          tenantId: TENANT_ID,
          name: svc.name,
          isEnabled: true,
          isRecurring: svc.isRecurring,
          frequency: {
            type: svc.freq as any,
            creationDay: 1,
            dueDay: svc.day || 15,
          },
          assignedUsers: [DEEPAK_USER_ID, allUsers[1]._id],
          sacCode: svc.sac,
          gstPercentage: 18,
          defaultBillingRate: svc.rate,
          isBillable: true,
          isChecklistRequired: true,
          checklist: svc.checklist.map((step, idx) => ({
            stepName: step,
            orderIndex: idx + 1,
          })),
          subtasks: [],
          customFieldsDef: [],
          gstApiConfig: { isEnabled: false },
        });
        console.log(` + Service: ${svc.name} (${svc.freq}) - ₹${svc.rate}`);
      }
      createdServices.push(existingSvc);
    }
    console.log(`✅ Total active services available: ${createdServices.length}`);

    // 6. Seed 10 Realistic Indian Business Clients
    console.log('\n🏢 Seeding Clients (10 Companies & LLPs)...');
    const clientsData = [
      {
        name: 'Apex FinTech Solutions Pvt Ltd',
        entityType: 'Private Limited',
        pan: 'AAACA1234F',
        gstin: '07AAACA1234F1Z8',
        email: 'finance@apexfintech.in',
        mobile: '+91 98111 22331',
        city: 'New Delhi',
        state: 'Delhi',
        tags: ['Corporate', 'Monthly GST', 'Audit Client'],
      },
      {
        name: 'Zenith Logistics & Supply Chain LLP',
        entityType: 'LLP',
        pan: 'AABFZ5678G',
        gstin: '27AABFZ5678G1Z2',
        email: 'accounts@zenithlogi.com',
        mobile: '+91 98222 33442',
        city: 'Mumbai',
        state: 'Maharashtra',
        tags: ['LLP', 'Quarterly GST'],
      },
      {
        name: 'Sharma & Sons Trading Co',
        entityType: 'Partnership Firm',
        pan: 'AABFS9012H',
        gstin: '08AABFS9012H1Z5',
        email: 'sharmatraders.delhi@gmail.com',
        mobile: '+91 98333 44553',
        city: 'Jaipur',
        state: 'Rajasthan',
        tags: ['Partnership', 'TDS Client'],
      },
      {
        name: 'BlueSky Agro Exports Pvt Ltd',
        entityType: 'Private Limited',
        pan: 'AAACB3456J',
        gstin: '24AAACB3456J1Z1',
        email: 'info@blueskyagro.co.in',
        mobile: '+91 98444 55664',
        city: 'Ahmedabad',
        state: 'Gujarat',
        tags: ['Exporter', 'IEC Client', 'ROC'],
      },
      {
        name: 'Balaji Electronics & Retail',
        entityType: 'Sole Proprietorship',
        pan: 'ABCPD7890K',
        gstin: '07ABCPD7890K1Z9',
        email: 'balaji.retail78@gmail.com',
        mobile: '+91 98555 66775',
        city: 'New Delhi',
        state: 'Delhi',
        tags: ['Proprietor', 'Composition GST'],
      },
      {
        name: 'Vanguard Legal Advisors LLP',
        entityType: 'LLP',
        pan: 'AABFV1122L',
        gstin: '06AABFV1122L1Z3',
        email: 'contact@vanguardlegal.in',
        mobile: '+91 98666 77886',
        city: 'Gurugram',
        state: 'Haryana',
        tags: ['Professional Services', 'Annual Audit'],
      },
      {
        name: 'Modern Chemists & Healthcare',
        entityType: 'Sole Proprietorship',
        pan: 'ABCPD3344M',
        gstin: '07ABCPD3344M1Z6',
        email: 'modernchemist.store@gmail.com',
        mobile: '+91 98777 88997',
        city: 'New Delhi',
        state: 'Delhi',
        tags: ['Retail', 'Monthly GST'],
      },
      {
        name: 'Horizon Green Infra Pvt Ltd',
        entityType: 'Private Limited',
        pan: 'AAACH5566N',
        gstin: '29AAACH5566N1Z4',
        email: 'tax@horizongreen.com',
        mobile: '+91 98888 99008',
        city: 'Bengaluru',
        state: 'Karnataka',
        tags: ['Corporate', 'Tax Audit', 'Statutory Audit'],
      },
      {
        name: 'Gupta Builders & Promoters',
        entityType: 'Partnership Firm',
        pan: 'AABFG7788P',
        gstin: '09AABFG7788P1Z7',
        email: 'guptabuilders.realty@gmail.com',
        mobile: '+91 98999 10119',
        city: 'Noida',
        state: 'Uttar Pradesh',
        tags: ['Real Estate', 'RERA', 'Advance Tax'],
      },
      {
        name: 'Vikram Singhania (HNI)',
        entityType: 'Individual',
        pan: 'ASDPS9900Q',
        email: 'vikram.singhania@singhaniagroup.com',
        mobile: '+91 98100 21220',
        city: 'New Delhi',
        state: 'Delhi',
        tags: ['Individual', 'ITR (Audit)', 'Capital Gains'],
      },
    ];

    const createdClients: any[] = [];
    for (let i = 0; i < clientsData.length; i++) {
      const c = clientsData[i];
      let existingClient = await Client.findOne({ tenantId: TENANT_ID, pan: c.pan });
      if (!existingClient) {
        existingClient = await Client.create({
          tenantId: TENANT_ID,
          name: c.name,
          clientNumber: `CL-${1001 + i}`,
          fileNo: `FILE-PDG-${1001 + i}`,
          entityType: c.entityType,
          email: c.email,
          mobile: c.mobile,
          pan: c.pan,
          gstin: c.gstin,
          panVerified: true,
          gstinVerified: !!c.gstin,
          address: `Plot ${10 + i}, Commercial Complex, Sector 18`,
          city: c.city,
          state: c.state,
          pincode: '110001',
          openingBalance: (i % 3 === 0) ? 15000 : 0,
          tags: c.tags,
          assignedUsers: [DEEPAK_USER_ID, allUsers[1]._id],
          subscribedServices: createdServices.slice(0, 4).map(s => ({
            serviceId: s._id,
            subscribedAt: new Date(),
            customUsers: [allUsers[1]._id],
          })),
          autoInvoice: true,
          allowNotifications: true,
          allowLogin: false,
          isActive: true,
        });
        console.log(` + Client: ${c.name} (${c.entityType})`);
      }
      createdClients.push(existingClient);
    }
    console.log(`✅ Seeded ${createdClients.length} clients.`);

    // 7. Seed Active & Completed Tasks (25 Tasks)
    console.log('\n📋 Seeding Tasks (25 tasks across services)...');
    const taskStatuses = ['Pending', 'In Progress', 'Under Review', 'Completed', 'In Progress'];
    const priorities = ['Medium', 'High', 'Urgent', 'Low'];

    for (let i = 0; i < 25; i++) {
      const client = createdClients[i % createdClients.length];
      const service = createdServices[i % createdServices.length];
      const assignee = allUsers[(i % (allUsers.length - 1)) + 1] || deepakUser;
      const status = taskStatuses[i % taskStatuses.length];
      const priority = priorities[i % priorities.length];

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (i % 2 === 0 ? (i + 2) : -(i % 3))); // some upcoming, some due soon

      await Task.create({
        tenantId: TENANT_ID,
        clientId: client._id,
        serviceId: service._id,
        assigneeIds: [assignee._id],
        description: `Compliance filing for ${service.name} (${client.name}).`,
        status: status,
        priority: priority,
        period: {
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          label: `${now.toLocaleString('default', { month: 'short' })} ${now.getFullYear()}`,
        },
        dueDate: dueDate,
        completedAt: status === 'Completed' ? new Date() : undefined,
        creationType: 'manual',
        isBillable: true,
        billingAmount: service.defaultBillingRate || 2000,
        checklist: service.checklist.map((step: any, idx: number) => ({
          stepName: step.stepName,
          isCompleted: status === 'Completed' || (status === 'Under Review' && idx < 2),
          completedAt: status === 'Completed' ? new Date() : undefined,
        })),
        tags: [service.frequency?.type || 'general'],
      });
    }
    console.log(`✅ Seeded 25 active tasks with checklists.`);

    // 8. Seed Invoices & Receipts
    console.log('\n💰 Seeding Invoices & Payment Receipts...');
    for (let i = 0; i < 5; i++) {
      const client = createdClients[i];
      const invoiceNo = `INV-PDG-2026-00${i + 1}`;
      const existingInv = await Invoice.findOne({ tenantId: TENANT_ID, invoiceNo });

      if (!existingInv) {
        const rate = 5000 + (i * 2500);
        const gst = rate * 0.18;
        const grandTotal = rate + gst;
        const isPaid = i === 0 || i === 1;
        const isPartiallyPaid = i === 2;
        const amountPaid = isPaid ? grandTotal : isPartiallyPaid ? 3000 : 0;
        const amountDue = grandTotal - amountPaid;

        const inv = await Invoice.create({
          tenantId: TENANT_ID,
          clientId: client._id,
          invoiceNo: invoiceNo,
          date: new Date(Date.now() - (i * 5 * 86400000)),
          dueDate: new Date(Date.now() + (10 * 86400000)),
          paymentTerms: 'Due on Receipt',
          items: [
            {
              referenceType: 'Manual',
              particulars: `Professional Fee for ${createdServices[i].name}`,
              sacCode: createdServices[i].sacCode || '998231',
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
          notes: 'Thank you for your business!',
        });

        // If paid or partially paid, create matching receipt
        if (amountPaid > 0) {
          await Receipt.create({
            tenantId: TENANT_ID,
            clientId: client._id,
            receiptNo: `RCT-PDG-2026-00${i + 1}`,
            date: new Date(),
            paymentMode: i % 2 === 0 ? 'NEFT/RTGS' : 'UPI',
            referenceNumber: `TXN${Math.floor(100000000 + Math.random() * 900000000)}`,
            totalAmount: amountPaid,
            unallocatedAmount: 0,
            settlements: [
              {
                invoiceId: inv._id,
                settledAmount: amountPaid,
                tdsDeducted: 0,
              },
            ],
            notes: 'Advance & invoice settlement receipt.',
          });
        }
      }
    }
    console.log(`✅ Seeded invoices and receipts.`);

    // 9. Seed DSC Records
    console.log('\n🔒 Seeding Digital Signature Certificates (DSC)...');
    const dscData = [
      {
        certName: 'Rahul Agrawal - Director Class 3 DSC',
        client: createdClients[0],
        tokenType: 'ePass2003',
        auth: 'eMudhra',
        loc: 'Cabinet 1, Locker A-04',
      },
      {
        certName: 'Sunil Mehta - Partner Class 3 DSC',
        client: createdClients[1],
        tokenType: 'ProxKey',
        auth: 'Vsign',
        loc: 'Cabinet 1, Locker B-12',
      },
      {
        certName: 'Vikram Singhania - Individual DSC',
        client: createdClients[9],
        tokenType: 'mToken',
        auth: 'Capricorn',
        loc: 'Director Desk Safe',
      },
    ];

    for (const d of dscData) {
      const existingDsc = await DSC.findOne({ tenantId: TENANT_ID, certificateName: d.certName });
      if (!existingDsc) {
        await DSC.create({
          tenantId: TENANT_ID,
          clientId: d.client._id,
          certificateName: d.certName,
          certificateClass: 'Class 3',
          tokenType: d.tokenType,
          tokenSerialNumber: `EP2003-${Math.floor(100000 + Math.random() * 900000)}`,
          issuingAuthority: d.auth,
          issueDate: new Date('2025-01-15'),
          expiryDate: new Date('2027-01-14'), // Valid for 2 years
          physicalLocation: d.loc,
          status: 'In Office',
          createdBy: DEEPAK_USER_ID,
          alertMilestonesSent: [],
        });
      }
    }
    console.log(`✅ Seeded DSC hardware tokens.`);

    // 10. Seed Physical In/Out Documents
    console.log('\n📦 Seeding Physical Documents (Docs In/Out)...');
    const physDocs = [
      {
        title: 'Original Title Deed - Okhla Commercial Property',
        type: 'Original Deeds',
        client: createdClients[0],
        loc: 'Safe Vault B - Box 3',
      },
      {
        title: 'HDFC Current Account Cheque Book (Sl. 1001-1050)',
        type: 'Cheque Book',
        client: createdClients[1],
        loc: 'Drawer 2 - Compliance Desk',
      },
      {
        title: 'Common Seal & Rubber Stamp - Apex FinTech',
        type: 'Company Seal',
        client: createdClients[0],
        loc: 'Locker 4',
      },
    ];

    for (const pd of physDocs) {
      const existingPd = await PhysicalDocument.findOne({ tenantId: TENANT_ID, documentName: pd.title });
      if (!existingPd) {
        await PhysicalDocument.create({
          tenantId: TENANT_ID,
          clientId: pd.client._id,
          date: new Date(),
          category: 'Received',
          documentType: pd.type,
          documentName: pd.title,
          isReturnable: true,
          location: pd.loc,
          custodianUserId: allUsers[1]._id,
          status: 'In Custody',
          receivedByPersonName: 'Priya Sharma',
          movements: [
            {
              movementType: 'Received',
              date: new Date(),
              location: pd.loc,
              custodianUserId: allUsers[1]._id,
              receivedByPersonName: 'Priya Sharma',
              isReturnable: true,
              notes: 'Received for audit verification & ROC filing.',
            },
          ],
          notes: 'Important physical document in office custody.',
        });
      }
    }
    console.log(`✅ Seeded physical document tracking.`);

    console.log(`\n======================================================`);
    console.log(`🎉 SUCCESS! PD Gupta practice data fully seeded on Atlas:`);
    console.log(` - 5 Users (Deepak Super Admin + 4 Staff members)`);
    console.log(` - ${attendanceCount} Attendance entries (Past 14 days)`);
    console.log(` - 59 CA Services (Advance Tax, GST, MCA, TDS, Audits, etc.)`);
    console.log(` - 10 Real Indian Business Clients`);
    console.log(` - 25 Compliance & Audit Tasks`);
    console.log(` - Invoices & Receipts (Billing module)`);
    console.log(` - DSC Hardware Tokens`);
    console.log(` - Physical Documents (Docs In/Out Vault)`);
    console.log(`======================================================\n`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seedPdGuptaData();
