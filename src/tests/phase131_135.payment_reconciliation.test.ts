import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import app from '../app';
import connectDB from '../config/db';
import { generateClientToken } from '../services/client-auth.service';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { ClientUser } from '../models/ClientUser';
import { Invoice } from '../models/Invoice';
import { Receipt } from '../models/Receipt';
import { PaymentGatewayConfig } from '../models/PaymentGatewayConfig';
import { PaymentTransaction } from '../models/PaymentTransaction';

describe('Part 27 (Phases 131–135): Payment Gateway, Dynamic UPI & Instant Reconciliation Engine', () => {
  let tenantId: mongoose.Types.ObjectId;
  let clientId: mongoose.Types.ObjectId;
  let clientUserId: mongoose.Types.ObjectId;
  let staffToken: string;
  let clientToken: string;

  let otherTenantId: mongoose.Types.ObjectId;
  let otherStaffToken: string;

  let testInvoiceId: string;
  const webhookSecret = 'test_webhook_secret_key_12345';

  beforeAll(async () => {
    await connectDB();

    tenantId = new mongoose.Types.ObjectId();
    clientId = new mongoose.Types.ObjectId();
    clientUserId = new mongoose.Types.ObjectId();

    otherTenantId = new mongoose.Types.ObjectId();

    const ts = Date.now();

    // Create Organizations with unique slugs
    await Organization.create([
      { _id: tenantId, name: 'Apex Tax Consultants', slug: `apex-pay-${ts}`, isActive: true, lastReceiptNumber: 10 },
      { _id: otherTenantId, name: 'Other Auditors', slug: `other-pay-${ts}`, isActive: true }
    ]);

    // Create Roles
    const roleA = await Role.create({
      tenantId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    const roleB = await Role.create({
      tenantId: otherTenantId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    // Create Staff Users
    await User.create([
      {
        tenantId,
        name: 'Rahul Senior Accountant',
        username: `rahul_${ts}`,
        email: `rahul.staff.${ts}@apex.com`,
        password: 'password123',
        roleId: roleA._id
      },
      {
        tenantId: otherTenantId,
        name: 'Other Staff',
        username: `other_${ts}`,
        email: `other.staff.${ts}@other.com`,
        password: 'password123',
        roleId: roleB._id
      }
    ]);

    // Obtain Staff JWT Tokens via Auth endpoint
    const loginResA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `rahul.staff.${ts}@apex.com`, password: 'password123' });
    staffToken = loginResA.body.data.accessToken;

    const loginResB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `other.staff.${ts}@other.com`, password: 'password123' });
    otherStaffToken = loginResB.body.data.accessToken;

    // Create Client
    await Client.create({
      _id: clientId,
      tenantId,
      name: 'Nexus Retailers Pvt Ltd',
      fileNo: `F-${ts}`,
      pan: 'ABCDE1234F',
      gstin: '27ABCDE1234F1Z5',
      allowLogin: true,
      entityType: 'Private Limited'
    });

    // Create ClientUser
    await ClientUser.create({
      _id: clientUserId,
      tenantId,
      clientId,
      name: 'Vikram Merchant',
      email: `vikram.${ts}@nexus.com`,
      phone: '9876543210',
      password: 'password123',
      isActive: true,
      isPrimaryContact: true
    });

    clientToken = generateClientToken({
      clientUserId: clientUserId.toString(),
      clientId: clientId.toString(),
      tenantId: tenantId.toString(),
      role: 'Client',
      isClient: true,
      tokenVersion: 0
    }).accessToken;

    // Create Unpaid Sample Invoice
    const inv = await Invoice.create({
      tenantId,
      clientId,
      invoiceNo: `INV-${ts}`,
      date: new Date(),
      dueDate: new Date(Date.now() + 15 * 86400 * 1000),
      status: 'Unpaid',
      items: [
        {
          referenceType: 'Manual',
          particulars: 'Comprehensive GST & TDS Compliance Review',
          quantity: 1,
          rate: 12000,
          discount: 0,
          taxableAmount: 12000,
          gstPercentage: 18,
          gstAmount: 2160,
          total: 14160
        }
      ],
      totals: {
        subtotal: 12000,
        totalDiscount: 0,
        totalTaxable: 12000,
        totalGst: 2160,
        roundOff: 0,
        grandTotal: 14160,
        amountPaid: 0,
        amountDue: 14160
      }
    });

    testInvoiceId = inv._id.toString();
  });

  afterAll(async () => {
    await Invoice.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
    await Receipt.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
    await PaymentGatewayConfig.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
    await PaymentTransaction.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
    await ClientUser.deleteMany({ clientId });
    await Client.deleteMany({ _id: clientId });
    await User.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
    await Role.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
    await Organization.deleteMany({ _id: { $in: [tenantId, otherTenantId] } });
    await mongoose.disconnect();
  });

  // ─── Phase 131: Payment Gateway Configuration ─────────────────────
  describe('Phase 131: Payment Gateway Configuration & Secret Encryption', () => {
    it('POST /api/v1/tenant-settings/payment-gateways should configure gateway and encrypt secret keys', async () => {
      const res = await request(app)
        .post('/api/v1/tenant-settings/payment-gateways')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          provider: 'Razorpay',
          keyId: 'rzp_test_Apex123456789',
          keySecret: 'secret_key_apex_987654321',
          webhookSecret,
          upiVpa: 'apexadvisors@hdfcbank',
          merchantName: 'Apex Tax Consultants LLP',
          acceptedModes: ['UPI', 'CreditCard', 'NetBanking'],
          isEnabled: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.provider).toBe('Razorpay');
      expect(res.body.data.upiVpa).toBe('apexadvisors@hdfcbank');

      // Verify AES-256-CBC encryption in database
      const dbConfig = await PaymentGatewayConfig.findOne({ tenantId, provider: 'Razorpay' });
      expect(dbConfig).toBeDefined();
      expect(dbConfig!.encryptedKeySecret).toBeDefined();
      expect(dbConfig!.encryptedKeySecret).not.toBe('secret_key_apex_987654321');
      expect(dbConfig!.iv).toBeDefined();
    });

    it('GET /api/v1/tenant-settings/payment-gateways should list configs with masked credentials', async () => {
      const res = await request(app)
        .get('/api/v1/tenant-settings/payment-gateways')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const cfg = res.body.data[0];
      expect(cfg.provider).toBe('Razorpay');
      expect(cfg.hasSecret).toBe(true);
      expect(cfg.encryptedKeySecret).toBeUndefined(); // Sensitive ciphertext is masked
    });
  });

  // ─── Phase 132: Dynamic UPI QR Code & Payment Links ───────────────
  describe('Phase 132: Dynamic UPI QR Code & Payment Link Generator', () => {
    it('GET /api/v1/invoices/:id/upi-qr should return valid NPCI URI and base64 QR image', async () => {
      const res = await request(app)
        .get(`/api/v1/invoices/${testInvoiceId}/upi-qr`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.amountDue).toBe(14160);
      expect(res.body.data.upiVpa).toBe('apexadvisors@hdfcbank');
      expect(res.body.data.merchantName).toBe('Apex Tax Consultants LLP');

      // NPCI UPI URI assertion
      expect(res.body.data.upiUri).toContain('upi://pay?');
      expect(res.body.data.upiUri).toContain('pa=apexadvisors%40hdfcbank');
      expect(res.body.data.upiUri).toContain('am=14160.00');
      expect(res.body.data.upiUri).toContain('cu=INR');

      // Base64 QR Image assertion
      expect(res.body.data.qrBase64).toMatch(/^data:image\/png;base64,/);
    });

    it('GET /api/v1/portal/invoices/:id/upi-qr should allow client portal users to fetch QR code for their invoice', async () => {
      const res = await request(app)
        .get(`/api/v1/portal/invoices/${testInvoiceId}/upi-qr`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.amountDue).toBe(14160);
      expect(res.body.data.amount).toBe(14160);
      expect(res.body.data.upiVpa).toBe('apexadvisors@hdfcbank');
      expect(res.body.data.upiId).toBe('apexadvisors@hdfcbank');
      expect(res.body.data.qrBase64).toMatch(/^data:image\/png;base64,/);
      expect(res.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(res.body.data.npciUri).toContain('upi://pay?');
    });

    it('POST /api/v1/portal/invoices/:id/payment-link should allow client portal users to generate checkout payment link', async () => {
      const res = await request(app)
        .post(`/api/v1/portal/invoices/${testInvoiceId}/payment-link`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentLinkId).toBeDefined();
      expect(res.body.data.shortUrl).toBeDefined();
    });

    it('POST /api/v1/invoices/:id/payment-link should generate and attach payment link to invoice', async () => {
      const res = await request(app)
        .post(`/api/v1/invoices/${testInvoiceId}/payment-link`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.paymentLinkId).toBeDefined();
      expect(res.body.data.shortUrl).toBeDefined();

      const updatedInv = await Invoice.findById(testInvoiceId);
      expect(updatedInv!.paymentLinkId).toBe(res.body.data.paymentLinkId);
    });
  });

  // ─── Phase 133 & 134: Webhook Signature & ACID Reconciliation ─────
  describe('Phase 133 & 134: Webhook Signature Verification & ACID Auto-Reconciliation', () => {
    const paymentId = `pay_test_${Date.now()}`;

    it('POST /api/v1/client-payments/webhook should reject payload when HMAC signature is invalid', async () => {
      const rawPayload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              amount: 1416000,
              currency: 'INR',
              method: 'upi',
              notes: {
                tenantId: tenantId.toString(),
                invoiceId: testInvoiceId
              }
            }
          }
        }
      });

      const res = await request(app)
        .post('/api/v1/client-payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', 'invalid_tampered_signature_hex')
        .send(rawPayload);

      expect(res.status).toBe(400);
      const errMsg = res.body.error?.message || res.body.message;
      expect(errMsg).toContain('Invalid webhook signature');
    });

    it('POST /api/v1/client-payments/webhook should verify HMAC signature and reconcile payment atomically', async () => {
      const webhookPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              amount: 1416000, // 14,160 in paise
              currency: 'INR',
              method: 'upi',
              notes: {
                tenantId: tenantId.toString(),
                invoiceId: testInvoiceId
              }
            }
          }
        }
      };

      const rawBody = JSON.stringify(webhookPayload);
      const authenticSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const res = await request(app)
        .post('/api/v1/client-payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', authenticSignature)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reconciled).toBe(true);

      // Verify Invoice status changed to Paid with 0 amountDue
      const reconciledInvoice = await Invoice.findById(testInvoiceId);
      expect(reconciledInvoice!.status).toBe('Paid');
      expect(reconciledInvoice!.totals.amountDue).toBe(0);
      expect(reconciledInvoice!.totals.amountPaid).toBe(14160);

      // Verify Receipt document created
      const receipt = await Receipt.findOne({ referenceNumber: paymentId });
      expect(receipt).toBeDefined();
      expect(receipt!.totalAmount).toBe(14160);
      expect(receipt!.paymentMode).toBe('UPI');
      expect(receipt!.receiptNo).toMatch(/^RCT-\d+/);
      expect(receipt!.settlements.length).toBe(1);
      expect(receipt!.settlements[0].invoiceId.toString()).toBe(testInvoiceId);
    });

    it('should be idempotent and not duplicate receipt if same webhook is delivered twice', async () => {
      const webhookPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              amount: 1416000,
              currency: 'INR',
              method: 'upi',
              notes: {
                tenantId: tenantId.toString(),
                invoiceId: testInvoiceId
              }
            }
          }
        }
      };

      const rawBody = JSON.stringify(webhookPayload);
      const authenticSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const res = await request(app)
        .post('/api/v1/client-payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', authenticSignature)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.data.alreadyProcessed).toBe(true);

      // Verify total receipt count for this reference ID is strictly 1
      const count = await Receipt.countDocuments({ referenceNumber: paymentId });
      expect(count).toBe(1);
    });
  });

  // ─── Phase 135: Payment Transactions Audit Ledger ─────────────────
  describe('Phase 135: Payment Transactions Audit Ledger', () => {
    it('GET /api/v1/client-payments/transactions should list captured transactions', async () => {
      const res = await request(app)
        .get('/api/v1/client-payments/transactions')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions.length).toBeGreaterThanOrEqual(1);

      const tx = res.body.data.transactions[0];
      expect(tx.status).toBe('Captured');
      expect(tx.amount).toBe(14160);
      expect(tx.paymentMethod).toBe('UPI');
      expect(tx.receiptId).toBeDefined();
    });

    it('should enforce strict tenant isolation so Tenant B cannot see Tenant A transactions', async () => {
      const res = await request(app)
        .get('/api/v1/client-payments/transactions')
        .set('Authorization', `Bearer ${otherStaffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.transactions.length).toBe(0);
    });

    it('POST /api/v1/portal/invoices/:id/confirm-payment should allow client to directly confirm payment with UTR and issue receipt', async () => {
      const directInv = await Invoice.create({
        tenantId,
        clientId,
        invoiceNo: `INV-CONFIRM-${Date.now()}`,
        date: new Date(),
        items: [
          {
            referenceType: 'Manual',
            particulars: 'Tax Consultation Direct',
            quantity: 1,
            rate: 2500,
            discount: 0,
            taxableAmount: 2500,
            gstPercentage: 0,
            gstAmount: 0,
            total: 2500
          }
        ],
        totals: {
          subtotal: 2500,
          totalDiscount: 0,
          totalTaxable: 2500,
          totalGst: 0,
          roundOff: 0,
          grandTotal: 2500,
          amountPaid: 0,
          amountDue: 2500
        },
        status: 'Unpaid'
      });

      const utr = `UTR${Date.now()}`;
      const res = await request(app)
        .post(`/api/v1/portal/invoices/${directInv._id}/confirm-payment`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ utrNumber: utr });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.receipt).toBeDefined();
      expect(res.body.data.receipt.receiptNo).toMatch(/^RCT-/);
      expect(res.body.data.receipt.totalAmount).toBe(2500);

      const settled = await Invoice.findById(directInv._id);
      expect(settled!.status).toBe('Paid');
      expect(settled!.totals.amountDue).toBe(0);
    });
  });
});
