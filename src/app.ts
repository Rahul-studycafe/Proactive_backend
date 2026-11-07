import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { errorHandler } from './middlewares/error-handler';
import { authenticate } from './middlewares/authenticate';
import { asyncHandler } from './utils/async-handler';
import { ApiError } from './common/errors/api-error';
import { sendSuccess } from './common/responses/api-response';
import authRoutes from './routes/auth.routes';
import healthRoutes from './routes/health.routes';
import userRoutes from './routes/user.routes';
import roleRoutes from './routes/role.routes';
import masterRoutes from './routes/master.routes';
import clientRoutes from './routes/client.routes';
import serviceRoutes from './routes/service.routes';
import taskRoutes from './routes/task.routes';
import invoiceRoutes from './routes/invoice.routes';
import paymentRoutes from './routes/payment.routes';
import packageRoutes from './routes/package.routes';
import documentRoutes from './routes/document.routes';
import receiptRoutes from './routes/receipt.routes';
import ledgerRoutes from './routes/ledger.routes';
import dashboardRoutes from './routes/dashboard.routes';
import holidayRoutes from './routes/holiday.routes';
import tenantSettingsRoutes from './routes/tenant-settings.routes';
import attendanceRoutes from './routes/attendance.routes';
import automationRoutes from './routes/automation.routes';
import analyticsRoutes from './routes/analytics.routes';
import dscRoutes from './routes/dsc.routes';
import creditNoteRoutes from './routes/credit-note.routes';
import docsInOutRoutes from './routes/physical-document.routes';
import documentRequestRoutes from './routes/document-request.routes';
import publicDocumentRequestRoutes from './routes/public-document-request.routes';
import complianceRoutes from './routes/compliance.routes';
import passwordVaultRoutes from './routes/password-vault.routes';
import expenseRoutes from './routes/expense.routes';
import billingRoutes from './routes/billing.routes';
import quotationRoutes from './routes/quotation.routes';
import reportRoutes from './routes/report.routes';
import notificationRoutes from './routes/notification.routes';
import accountingRoutes from './routes/accounting.routes';
import portalRoutes from './routes/portal.routes';
import clientPaymentRoutes from './routes/client-payment.routes';

const app: Express = express();

// Trust the first proxy (e.g. Render/Heroku load balancer) to ensure correct client IP for rate-limiting
app.set('trust proxy', 1);

// Middleware
// Configure Helmet: disable frameguard & CSP restriction so Next.js apps (port 8080 & 3005) can embed previews
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: false,
    contentSecurityPolicy: false,
  })
);
const configuredOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_APP_URL,
  process.env.PORTAL_URL,
  'http://localhost:8080',
  'http://localhost:3005',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3005',
  'http://127.0.0.1:3000',
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      configuredOrigins.includes(origin) ||
      configuredOrigins.some((c) => c && origin.startsWith(c.replace(/\/+$/, ''))) ||
      /^https?:\/\/(?:[a-zA-Z0-9-]+\.)*automationcafe\.in(?::\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }
    // Permissive fallback to ensure multi-subdomain and custom tenant domains work seamlessly
    return callback(null, true);
  },
  credentials: true,
}));
// Static directories for file uploads and public documents
const staticOptions = {
  setHeaders: (res: Response) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
  },
};

app.use('/public', express.static(path.join(process.cwd(), 'public'), staticOptions));
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads'), staticOptions));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), staticOptions));
app.use((req, res, next) => {
  console.log(`[HTTP Request] ${req.method} ${req.url}`);
  next();
});
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// ─── Public Routes (no auth required) ────────────────────────────
app.get('/', (req: Request, res: Response) => {
    sendSuccess(res, 200, 'API is running');
});

// Dummy Route to test asyncHandler and ApiError (Phase 2 & Phase 3 test)
app.get('/error-test', asyncHandler(async (req: Request, res: Response) => {
    throw new ApiError(400, 'This is a test error to verify the global error handler', 'TEST_ERROR');
}));

// Graceful URL rewrite: If incoming request is missing '/api/v1' prefix (e.g. /auth/login -> /api/v1/auth/login)
app.use((req: Request, _res: Response, next: NextFunction) => {
    if (
        !req.url.startsWith('/api/') &&
        !req.url.startsWith('/public') &&
        !req.url.startsWith('/uploads') &&
        req.url !== '/' &&
        req.url !== '/error-test'
    ) {
        req.url = `/api/v1${req.url.startsWith('/') ? '' : '/'}${req.url}`;
    }
    next();
});

// Auth routes are public (register, login, refresh)
app.use('/api/v1/auth', authRoutes);

// Payment routes (has both public pricing and protected checkout)
app.use('/api/v1/payment', paymentRoutes);

// Health check endpoint (public)
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/public/document-requests', publicDocumentRequestRoutes);

// Client Portal routes (has its own public auth endpoints + clientAuthenticate middleware)
app.use('/api/v1/portal', portalRoutes);
app.use('/api/v1/client-payments', clientPaymentRoutes);

// ─── Protected Routes (auth required, tenant-scoped) ────────────
// All routes below this line require a valid JWT.
// The authenticate middleware extracts tenantId from the token
// and sets AsyncLocalStorage context so the Mongoose tenant plugin
// auto-scopes every query.
app.use('/api/v1', authenticate);

// Future protected routes will be mounted here, e.g.:
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/roles', roleRoutes);
app.use('/api/v1/masters', masterRoutes);
app.use('/api/v1/clients', clientRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/packages', packageRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/receipts', receiptRoutes);
app.use('/api/v1/ledger', ledgerRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/holidays', holidayRoutes);
app.use('/api/v1/tenant-settings', tenantSettingsRoutes);
app.use('/api/v1/tenant', tenantSettingsRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/automation', automationRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/dsc', dscRoutes);
app.use('/api/v1/credit-notes', creditNoteRoutes);
app.use('/api/v1/docs-in-out', docsInOutRoutes);
app.use('/api/v1/document-requests', documentRequestRoutes);
app.use('/api/v1/compliance', complianceRoutes);
app.use('/api/v1/passwords', passwordVaultRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/quotations', quotationRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/accounting', accountingRoutes);

// ─── Fallback & Error Handling ───────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
    next(new ApiError(404, 'Route not found', 'NOT_FOUND'));
});

// Global Error Handler (Phase 2)
app.use(errorHandler);

export default app;