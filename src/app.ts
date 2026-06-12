import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middlewares/errorHandler';
import { asyncHandler } from './utils/asyncHandler';
import { ApiError } from './utils/ApiError';
import { sendSuccess } from './utils/ApiResponse';

const app: Express = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req: Request, res: Response) => {
    sendSuccess(res, 200, 'API is running');
});

// Dummy Route to test asyncHandler and ApiError (Phase 2 & Phase 3 test)
app.get('/error-test', asyncHandler(async (req: Request, res: Response) => {
    throw new ApiError(400, 'This is a test error to verify the global error handler', 'TEST_ERROR');
}));

// Fallback for 404 Not Found
app.use((req: Request, res: Response, next: NextFunction) => {
    next(new ApiError(404, 'Route not found', 'NOT_FOUND'));
});

// Global Error Handler (Phase 2)
app.use(errorHandler);

export default app;
