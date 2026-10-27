import { Router } from 'express';
import multer from 'multer';
import {
  getPortals,
  createPassword,
  getPasswords,
  getPasswordById,
  updatePassword,
  deletePassword,
  revealPassword,
  getAuditLogs,
  bulkImport,
} from '../controllers/password-vault.controller';

const router = Router();

// Configure multer memory storage for spreadsheet parsing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Portal Catalog
router.get('/portals', getPortals);

// Statutory Access Audit Logs
router.get('/audit-log', getAuditLogs);

// Bulk Import Excel Spreadsheet
router.post('/bulk-import', upload.single('file'), bulkImport);

// Reveal Decrypted Password (Audit-Logged)
router.post('/:id/reveal', revealPassword);

// Standard Credentials CRUD
router.get('/', getPasswords);
router.post('/', createPassword);
router.get('/:id', getPasswordById);
router.put('/:id', updatePassword);
router.delete('/:id', deletePassword);

export default router;
