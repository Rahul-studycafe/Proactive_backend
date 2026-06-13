import { Router } from 'express';
import { getHealthMetrics } from '../controllers/health.controller';

const router = Router();

router.get('/', getHealthMetrics);

export default router;
