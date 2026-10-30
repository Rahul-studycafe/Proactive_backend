import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  portalLogin,
  portalRequestOtp,
  portalVerifyOtp,
  portalSendMagicLink,
  portalVerifyMagicLink,
  portalLogout
} from '../controllers/portal-auth.controller';
import { getPublicWebsiteConfig } from '../controllers/website-cms.controller';
import {
  getPortalProfile,
  updatePortalProfile,
  changePortalPassword
} from '../controllers/portal-profile.controller';
import {
  getComplianceCalendar,
  getPortalDocuments,
  downloadPortalDocument,
  getPortalInvoices,
  getPortalReceipts,
  getPortalLedger,
  getPortalInvoicePdf,
  getPortalDocumentRequests,
  fulfillPortalDocumentRequest,
  createPortalQueryTicket,
  getPortalQueryTickets,
  getPortalQueryTicketById
} from '../controllers/portal-hub.controller';
import { getInvoiceUpiQr } from '../controllers/payment-gateway.controller';
import { clientAuthenticate } from '../middlewares/client-auth';

const portalDocStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    const uploadPath = path.join(process.cwd(), 'uploads', 'portal');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `portal-doc-${uniqueSuffix}${ext}`);
  }
});

const uploadPortalDoc = multer({
  storage: portalDocStorage,
  limits: { fileSize: 25 * 1024 * 1024 }
});

const router = Router();

// ─── Public Portal Authentication Routes ─────────────────────────
router.get('/website-config', getPublicWebsiteConfig);
router.get('/branding', getPublicWebsiteConfig);
router.post('/auth/login', portalLogin);
router.post('/auth/request-otp', portalRequestOtp);
router.post('/auth/verify-otp', portalVerifyOtp);
router.post('/auth/send-magic-link', portalSendMagicLink);
router.post('/auth/verify-magic-link', portalVerifyMagicLink);

// ─── Protected Client Portal Routes ──────────────────────────────
router.get('/profile', clientAuthenticate, getPortalProfile);
router.put('/profile', clientAuthenticate, updatePortalProfile);
router.post('/auth/change-password', clientAuthenticate, changePortalPassword);
router.post('/auth/logout', clientAuthenticate, portalLogout);

// ─── Part 26: Compliance, Documents & Billing Hub ─────────────────
// Phase 126: Client Compliance Calendar & Milestone API
router.get('/compliance-calendar', clientAuthenticate, getComplianceCalendar);
router.get('/compliance', clientAuthenticate, getComplianceCalendar);

// Phase 127: Client Documents Repository & Return Vault
router.get('/documents', clientAuthenticate, getPortalDocuments);
router.get('/documents/:id/download', clientAuthenticate, downloadPortalDocument);

// Phase 128 & Part 27: Client Invoices, Receipts, Ledger & UPI QR
router.get('/invoices', clientAuthenticate, getPortalInvoices);
router.get('/invoices/:id/pdf', clientAuthenticate, getPortalInvoicePdf);
router.get('/invoices/:id/upi-qr', clientAuthenticate, getInvoiceUpiQr);
router.get('/receipts', clientAuthenticate, getPortalReceipts);
router.get('/ledger', clientAuthenticate, getPortalLedger);

// Phase 129: Direct Document Request Fulfillment Service
router.get('/document-requests', clientAuthenticate, getPortalDocumentRequests);
router.post('/requests/:id/fulfill', clientAuthenticate, uploadPortalDoc.single('file'), fulfillPortalDocumentRequest);

// Phase 130: Client Service Requests & Support Query API
router.post('/queries', clientAuthenticate, createPortalQueryTicket);
router.get('/queries', clientAuthenticate, getPortalQueryTickets);
router.get('/queries/:id', clientAuthenticate, getPortalQueryTicketById);

export default router;
