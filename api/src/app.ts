import express, { type Express } from 'express';
import { globalErrorHandler, notFound } from './errors/AppError';
import authRouter from './routes/auth';
import boardsRouter from './routes/boards';
import tasksRouter from './routes/tasks';

// Builds the Express app without listening, so Supertest can import it (ARCH §3, C1.5).
// Middleware order follows ARCH §6; helmet, cors, the 10kb body limit and pino-http
// are added with their milestones (day-11, day-13).
const app: Express = express();

app.use(express.json());

// Feature routers are mounted here at the root (Nginx strips /api, ADR-002).
app.use('/auth', authRouter);
app.use('/boards', boardsRouter);
app.use('/tasks', tasksRouter);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
