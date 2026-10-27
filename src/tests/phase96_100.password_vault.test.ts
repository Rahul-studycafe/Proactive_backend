import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import * as xlsx from 'xlsx';
import mongoose from 'mongoose';
import app from '../app';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { ClientPassword } from '../models/ClientPassword';
import { PasswordAuditLog } from '../models/PasswordAuditLog';
import { PortalMaster } from '../models/PortalMaster';
import { encryptPassword, decryptPassword } from '../utils/crypto-vault';
import dotenv from 'dotenv';

dotenv.config();
jest.setTimeout(30000);

describe('Part 20: Security Vault & Client Passwords (Phases 96–100)', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;
  let clientAId: string;
  let clientBId: string;
  let userAId: string;
  let createdPasswordId: string;

  const orgASlug = 'vault-orga-p20';
  const orgBSlug = 'vault-orgb-p20';
  const userAEmail = 'adminA.vault20@example.com';
  const userBEmail = 'adminB.vault20@example.com';

  beforeAll(async () => {
    await connectDB();

    // Clean up any stale records from previous runs
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({ name: 'Vault Accounting Firm A', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {},
    });

    const userA = await User.create({
      tenantId: orgAId,
      name: 'Admin User A',
      username: 'admin_a_vault20',
      email: userAEmail,
      password: 'password123',
      roleId: roleA._id,
    });
    userAId = (userA._id as mongoose.Types.ObjectId).toString();

    const loginResA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userAEmail, password: 'password123' });
    tokenA = loginResA.body.data.accessToken;

    const clientA = await Client.create({
      tenantId: orgAId,
      name: 'Acme Technologies Pvt Ltd',
      fileNo: 'ACME-101',
      pan: 'ABCDE1234F',
      gstin: '27ABCDE1234F1Z5',
      contactPersonName: 'Rajesh',
      email: 'rajesh@acme.com',
      mobile: '9876543210',
    });
    clientAId = (clientA._id as mongoose.Types.ObjectId).toString();

    // Setup Org B (for multi-tenant isolation testing)
    const orgB = await Organization.create({ name: 'Vault Accounting Firm B', slug: orgBSlug });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const roleB = await Role.create({
      tenantId: orgBId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {},
    });

    await User.create({
      tenantId: orgBId,
      name: 'Admin User B',
      username: 'admin_b_vault20',
      email: userBEmail,
      password: 'password123',
      roleId: roleB._id,
    });

    const loginResB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userBEmail, password: 'password123' });
    tokenB = loginResB.body.data.accessToken;

    const clientB = await Client.create({
      tenantId: orgBId,
      name: 'Beta Global Corp',
      fileNo: 'BETA-202',
      pan: 'XYZAB5678G',
      contactPersonName: 'Anita',
      email: 'anita@beta.com',
      mobile: '9876543211',
    });
    clientBId = (clientB._id as mongoose.Types.ObjectId).toString();
  });

  afterAll(async () => {
    // Clean up test data
    if (orgAId) {
      await ClientPassword.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
      await PasswordAuditLog.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
      await Client.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
      await User.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
      await Role.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
      await Organization.deleteOne({ _id: orgAId });
    }
    if (orgBId) {
      await ClientPassword.deleteMany({ tenantId: orgBId }).setOptions({ skipTenantPlugin: true });
      await PasswordAuditLog.deleteMany({ tenantId: orgBId }).setOptions({ skipTenantPlugin: true });
      await Client.deleteMany({ tenantId: orgBId }).setOptions({ skipTenantPlugin: true });
      await User.deleteMany({ tenantId: orgBId }).setOptions({ skipTenantPlugin: true });
      await Role.deleteMany({ tenantId: orgBId }).setOptions({ skipTenantPlugin: true });
      await Organization.deleteOne({ _id: orgBId });
    }
    await mongoose.disconnect();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 97: Cryptographic Engine Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('Phase 97: AES-256-CBC Cryptographic Engine with Unique IVs', () => {
    it('should encrypt identical plaintext passwords into different ciphertexts due to random IVs', () => {
      const plaintext = 'ClientSecret@2026';
      const enc1 = encryptPassword(plaintext);
      const enc2 = encryptPassword(plaintext);

      expect(enc1.encryptedPassword).toBeDefined();
      expect(enc1.iv).toBeDefined();
      expect(enc2.encryptedPassword).toBeDefined();
      expect(enc2.iv).toBeDefined();

      // IVs must be distinct
      expect(enc1.iv).not.toEqual(enc2.iv);
      // Ciphertexts must be distinct because IV differs
      expect(enc1.encryptedPassword).not.toEqual(enc2.encryptedPassword);

      // Both must decrypt cleanly back to the identical plaintext
      const dec1 = decryptPassword(enc1.encryptedPassword, enc1.iv);
      const dec2 = decryptPassword(enc2.encryptedPassword, enc2.iv);

      expect(dec1).toBe(plaintext);
      expect(dec2).toBe(plaintext);
    });

    it('should throw error when decrypting with tampered IV or ciphertext', () => {
      const { encryptedPassword, iv } = encryptPassword('SensitivePassword#123');

      // Invalid IV length (not 16 bytes)
      expect(() => {
        decryptPassword(encryptedPassword, 'short_iv_123');
      }).toThrow();

      // Corrupted / truncated ciphertext
      expect(() => {
        decryptPassword('invalid_hex_or_truncated', iv);
      }).toThrow();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 96 & 98: Password Vault CRUD & Data Masking
  // ───────────────────────────────────────────────────────────────────────────
  describe('Phase 96 & 98: Password Vault CRUD & Security Masking', () => {
    it('should fetch portal master catalog including default statutory portals', async () => {
      const res = await request(app)
        .get('/api/v1/passwords/portals')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(5);

      const gstPortal = res.body.data.find((p: any) => p.name.includes('GST'));
      expect(gstPortal).toBeDefined();
    });

    it('should create an encrypted client credential and return masked data', async () => {
      const res = await request(app)
        .post('/api/v1/passwords')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          portalName: 'GST Portal',
          portalUrl: 'https://services.gst.gov.in',
          username: '27ABCDE1234F1Z5',
          password: 'MyGstPortalSecret@2026',
          notes: 'Primary director netbanking login linked',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe('27ABCDE1234F1Z5');
      expect(res.body.data.portalName).toBe('GST Portal');
      expect(res.body.data.maskedPassword).toBe('••••••••');
      expect(res.body.data.isConfigured).toBe(true);

      // Verify no ciphertext or IV is leaked in response
      expect(res.body.data.encryptedPassword).toBeUndefined();
      expect(res.body.data.iv).toBeUndefined();

      createdPasswordId = res.body.data._id;
      expect(createdPasswordId).toBeDefined();

      // Check database directly: ciphertext must be encrypted
      const docInDb = await ClientPassword.findById(createdPasswordId).select('+encryptedPassword +iv');
      expect(docInDb).toBeDefined();
      expect(docInDb!.encryptedPassword).not.toBe('MyGstPortalSecret@2026');
      expect(docInDb!.iv).toBeDefined();
    });

    it('should list client credentials with masked secrets and support query filtering', async () => {
      const res = await request(app)
        .get(`/api/v1/passwords?clientId=${clientAId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.passwords.length).toBe(1);
      expect(res.body.data.passwords[0].username).toBe('27ABCDE1234F1Z5');
      expect(res.body.data.passwords[0].maskedPassword).toBe('••••••••');
      expect(res.body.data.passwords[0].encryptedPassword).toBeUndefined();
    });

    it('should update credential metadata and re-encrypt when new password provided', async () => {
      const updateRes = await request(app)
        .put(`/api/v1/passwords/${createdPasswordId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          username: '27ABCDE1234F1Z5_UPDATED',
          password: 'NewChangedSecret@2027',
          notes: 'Updated credentials after annual renewal',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.username).toBe('27ABCDE1234F1Z5_UPDATED');
      expect(updateRes.body.data.notes).toBe('Updated credentials after annual renewal');
      expect(updateRes.body.data.maskedPassword).toBe('••••••••');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 99: Password Reveal & Statutory Audit Logging
  // ───────────────────────────────────────────────────────────────────────────
  describe('Phase 99: Password Reveal & Statutory Audit Logging', () => {
    it('should decrypt and reveal plaintext password while recording audit log entry', async () => {
      const revealRes = await request(app)
        .post(`/api/v1/passwords/${createdPasswordId}/reveal`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          purpose: 'Quarterly GSTR-3B tax return filing',
        });

      expect(revealRes.status).toBe(200);
      expect(revealRes.body.success).toBe(true);
      expect(revealRes.body.data.password).toBe('NewChangedSecret@2027');
      expect(revealRes.body.data.username).toBe('27ABCDE1234F1Z5_UPDATED');
      expect(revealRes.body.data.portalName).toBe('GST Portal');

      // Verify audit log document created
      const auditRes = await request(app)
        .get(`/api/v1/passwords/audit-log?passwordId=${createdPasswordId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.data.logs.length).toBeGreaterThanOrEqual(1);
      const latestLog = auditRes.body.data.logs[0];
      expect(latestLog.purpose).toBe('Quarterly GSTR-3B tax return filing');
      expect(latestLog.portalName).toBe('GST Portal');
      expect(latestLog.accessedByUserId).toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 100: Bulk Excel Import
  // ───────────────────────────────────────────────────────────────────────────
  describe('Phase 100: Password Bulk Spreadsheet Import', () => {
    it('should ingest an Excel file, match clients, and encrypt credentials in batch', async () => {
      // Build in-memory Excel workbook using xlsx
      const workbook = xlsx.utils.book_new();
      const rows = [
        {
          'Client File No': 'ACME-101',
          'Portal Name': 'Income Tax e-Filing Portal',
          'Username': 'ABCDE1234F',
          'Password': 'IncomeTaxSecret@2026',
          'Notes': 'Imported from firm spreadsheet',
        },
        {
          'Client File No': 'ACME-101',
          'Portal Name': 'MCA (Ministry of Corporate Affairs) / V3',
          'Username': 'mca_acme_admin',
          'Password': 'McaSecretPassword@2026',
          'Notes': 'ROC filing login',
        },
      ];
      const worksheet = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(workbook, worksheet, 'ClientPasswords');
      const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const importRes = await request(app)
        .post('/api/v1/passwords/bulk-import')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', excelBuffer, 'client_passwords_import.xlsx');

      expect(importRes.status).toBe(200);
      expect(importRes.body.success).toBe(true);
      expect(importRes.body.data.totalRows).toBe(2);
      expect(importRes.body.data.importedCount).toBe(2);
      expect(importRes.body.data.skippedErrors.length).toBe(0);

      // Verify imported Income Tax credential can be revealed
      const itCred = await ClientPassword.findOne({
        tenantId: orgAId,
        clientId: clientAId,
        portalName: 'Income Tax e-Filing Portal',
      });
      expect(itCred).toBeDefined();

      const itRevealRes = await request(app)
        .post(`/api/v1/passwords/${itCred!._id}/reveal`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(itRevealRes.status).toBe(200);
      expect(itRevealRes.body.data.password).toBe('IncomeTaxSecret@2026');
      expect(itRevealRes.body.data.username).toBe('ABCDE1234F');
    });

    it('should report skipped errors for missing columns or unknown clients gracefully', async () => {
      const workbook = xlsx.utils.book_new();
      const rows = [
        {
          'Client File No': 'UNKNOWN-999',
          'Portal Name': 'TRACES',
          'Username': 'TAN123',
          'Password': 'Pass',
        },
      ];
      const worksheet = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(workbook, worksheet, 'InvalidData');
      const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app)
        .post('/api/v1/passwords/bulk-import')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', excelBuffer, 'invalid_import.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.importedCount).toBe(0);
      expect(res.body.data.skippedErrors.length).toBe(1);
      expect(res.body.data.skippedErrors[0]).toContain('not found in this organization');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Multi-Tenancy Security Isolation Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('Multi-Tenancy Security Isolation', () => {
    it('should prevent Tenant B from reading or revealing Tenant A passwords', async () => {
      // Tenant B tries to reveal Tenant A password
      const revealAttempt = await request(app)
        .post(`/api/v1/passwords/${createdPasswordId}/reveal`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(revealAttempt.status).toBe(404);

      // Tenant B query for passwords must not return Tenant A passwords
      const listAttempt = await request(app)
        .get(`/api/v1/passwords`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(listAttempt.status).toBe(200);
      expect(listAttempt.body.data.passwords.length).toBe(0);

      // Tenant B cannot access Tenant A audit logs
      const auditAttempt = await request(app)
        .get(`/api/v1/passwords/audit-log`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(auditAttempt.status).toBe(200);
      expect(auditAttempt.body.data.logs.length).toBe(0);
    });
  });
});
