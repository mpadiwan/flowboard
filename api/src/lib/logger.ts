import pino, { type Logger, type LoggerOptions } from 'pino';
import { env } from '../config/env';

// Structured JSON logging from day one, so there is never a console.log to replace.
// Exported without the transport so tests can build the same logger on a captured stream.
// pino-http's per-request child loggers inherit this redaction (ARCH §10).
export const loggerOptions: LoggerOptions = {
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
};

export const logger: Logger = pino({
  ...loggerOptions,
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});
