import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import {
  createTemplateHandler,
  getTemplatesHandler,
  getTemplateByIdHandler,
  updateTemplateHandler,
  deleteTemplateHandler,
  queryAudienceHandler,
  sendBulkNotificationHandler
} from '../controllers/notification.controller';

const router = Router();

router.use(authenticate);

// Phase 116: Audience Query Builder
router.post('/audience', queryAudienceHandler);

// Phase 117: Asynchronous Bulk Communications
router.post('/send-bulk', sendBulkNotificationHandler);

// Phase 116: Template Master CRUD
router.post('/templates', createTemplateHandler);
router.get('/templates', getTemplatesHandler);
router.get('/templates/:id', getTemplateByIdHandler);
router.put('/templates/:id', updateTemplateHandler);
router.delete('/templates/:id', deleteTemplateHandler);

export default router;
