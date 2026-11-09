import pino, { type Logger } from 'pino';
import { env } from '../config/env';

// Same configuration as the api logger, so both services emit the same JSON shape.
export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['*.password', '*.refreshToken', '*.accessToken'],
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});
