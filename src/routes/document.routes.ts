import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { getTaskDocuments, uploadDocument, deleteDocument } from '../controllers/document.controller';

const router = Router();

router.use(authenticate);

// Documents routes
router.get('/task/:taskId', authorize('task', 'view'), getTaskDocuments);
router.post('/task/:taskId', authorize('task', 'edit'), uploadDocument);
router.delete('/:id', authorize('task', 'delete'), deleteDocument); // Requires task delete permission for now, or maybe a dedicated 'deleteDocument' permission

export default router;
