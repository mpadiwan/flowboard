import pino, { type Logger } from 'pino';
import { env } from '../config/env';

// Structured JSON logging from day one, so there is never a console.log to replace.
// Request logging (pino-http with request IDs) is added with day-13 (ARCH §10).
export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.refreshToken',
      '*.password',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});
