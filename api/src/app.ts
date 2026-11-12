import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { globalErrorHandler, notFound } from './errors/AppError';
import { requestLogger } from './middleware/requestLogger';
import auditLogsRouter from './routes/auditLogs';
import authRouter from './routes/auth';
import boardsRouter from './routes/boards';
import tasksRouter from './routes/tasks';

// Builds the Express app without listening, so Supertest can import it (ARCH §3, C1.5).
// Middleware order follows ARCH §6: pino-http first, ahead of helmet.
const app: Express = express();

// ADR-002: trust exactly one hop (Nginx), so req.ip is the client address the rate
// limiter keys on, and extra X-Forwarded-For entries from the client are ignored.
app.set('trust proxy', 1);

// NFR-8. First, so 413s, malformed JSON, 404s and errors are all logged and timed.
app.use(requestLogger);

// NFR-4, ARCH §12 rule 7. Mounted before the routers, so 404s and errors get the
// headers too. Auth is a Bearer header, not a cookie, so CORS needs no credentials.
app.use(helmet());
app.use(cors({ origin: env.ALLOWED_ORIGINS }));
// Larger bodies get 413 PAYLOAD_TOO_LARGE; this also bounds Zod's input (OQ-8).
app.use(express.json({ limit: '10kb' }));

// Feature routers are mounted here at the root (Nginx strips /api, ADR-002).
app.use('/auth', authRouter);
app.use('/boards', boardsRouter);
app.use('/tasks', tasksRouter);
app.use('/audit-logs', auditLogsRouter);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
