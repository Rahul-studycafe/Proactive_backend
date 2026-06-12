import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app: Express = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req: Request, res: Response) => {
    res.status(200).json({ status: 'OK', message: 'API is running' });
});

// To be updated in Phase 2 with global error handler

export default app;
