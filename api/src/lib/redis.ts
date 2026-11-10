import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

// ARCH §9.1, ADR-005. With the offline queue off, commands reject at once while Redis
// is down instead of queueing, so nothing that awaits Redis can hang a request.
// ioredis keeps reconnecting in the background.
export const redis: Redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});

// Without a listener, ioredis reports every failed reconnect on the console.
redis.on('error', (err: Error) => {
  logger.error({ err }, 'redis connection error');
});
