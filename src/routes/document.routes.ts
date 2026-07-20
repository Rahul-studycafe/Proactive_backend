import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { getTaskDocuments, uploadDocument, deleteDocument, getClientDocuments, uploadClientDocument } from '../controllers/document.controller';

import fs from 'fs';
import path from 'path';
import multer from 'multer';

// Configure multer storage dynamically
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Note: since this is used for tasks, we assume the upload form provides:
    // req.body.clientId, req.params.taskId, and req.body.category
    const clientId = req.body.clientId || req.params.clientId || 'unknown-client';
    const taskId = req.params.taskId || req.body.taskId;
    const category = req.body.category || 'uncategorized';
    
    // Construct path depending on if it's a task document or client document
    let dir;
    if (taskId) {
      dir = path.join(process.cwd(), 'public', 'uploads', 'clients', clientId, 'tasks', taskId, category);
    } else {
      dir = path.join(process.cwd(), 'public', 'uploads', 'clients', clientId, 'documents', category);
    }
    
    // Ensure directory exists
    fs.mkdirSync(dir, { recursive: true });
    
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Add timestamp to prevent overwrites
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });

const router = Router();

router.use(authenticate);

// Task Documents routes
router.get('/task/:taskId', authorize('task', 'view'), getTaskDocuments);
router.post('/task/:taskId', authorize('task', 'edit'), upload.single('file'), uploadDocument);

// Client Documents routes
router.get('/client/:clientId', authorize('client', 'view'), getClientDocuments);
router.post('/client/:clientId', authorize('client', 'edit'), upload.single('file'), uploadClientDocument);

router.delete('/:id', authorize('task', 'delete'), deleteDocument); // Need to eventually split or update permissions if client-only

export default router;
