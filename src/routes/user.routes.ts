import { Router } from 'express';
import { createUser } from '../controllers/user.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// Create a new user (requires 'user.create' permission)
router.post('/', authorize('user', 'create'), createUser);

export default router;
