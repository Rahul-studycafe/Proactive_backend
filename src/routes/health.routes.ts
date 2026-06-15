import { Router } from 'express';
import { getHealthMetrics } from '../modules/health/controllers/health.controller';

const router = Router();

router.get('/', getHealthMetrics);

export default router;
