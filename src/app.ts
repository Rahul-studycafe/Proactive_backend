import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middlewares/errorHandler';
import { authenticate } from './middlewares/authenticate';
import { asyncHandler } from './utils/asyncHandler';
import { ApiError } from './utils/ApiError';
import { sendSuccess } from './utils/ApiResponse';
import authRoutes from './routes/auth.routes';
import healthRoutes from './routes/health.routes';
import userRoutes from './routes/user.routes';
import roleRoutes from './routes/role.routes';

const app: Express = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── Public Routes (no auth required) ────────────────────────────
app.get('/', (req: Request, res: Response) => {
    sendSuccess(res, 200, 'API is running');
});

// Dummy Route to test asyncHandler and ApiError (Phase 2 & Phase 3 test)
app.get('/error-test', asyncHandler(async (req: Request, res: Response) => {
    throw new ApiError(400, 'This is a test error to verify the global error handler', 'TEST_ERROR');
}));

// Auth routes are public (register, login, refresh)
app.use('/api/v1/auth', authRoutes);

// Health check endpoint (public)
app.use('/api/v1/health', healthRoutes);

// ─── Protected Routes (auth required, tenant-scoped) ────────────
// All routes below this line require a valid JWT.
// The authenticate middleware extracts tenantId from the token
// and sets AsyncLocalStorage context so the Mongoose tenant plugin
// auto-scopes every query.
app.use('/api/v1', authenticate);

// Future protected routes will be mounted here, e.g.:
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/roles', roleRoutes);
// app.use('/api/v1/clients', clientRoutes);
// app.use('/api/v1/tasks', taskRoutes);
// app.use('/api/v1/invoices', invoiceRoutes);

// ─── Fallback & Error Handling ───────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
    next(new ApiError(404, 'Route not found', 'NOT_FOUND'));
});

// Global Error Handler (Phase 2)
app.use(errorHandler);

export default app;