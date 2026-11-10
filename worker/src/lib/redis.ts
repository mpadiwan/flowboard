import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

// Same settings as the api client (ARCH §9.1, ADR-005): with the offline queue off,
// commands reject at once while Redis is down, and ioredis keeps reconnecting.
function createRedis(name: string): Redis {
  const client = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  // Without a listener, ioredis reports every failed reconnect on the console.
  client.on('error', (err: Error) => {
    logger.error({ err, connection: name }, 'redis connection error');
  });
  return client;
}

// Group setup, XAUTOCLAIM, XPENDING, XACK and the DLQ XADD.
export const redis: Redis = createRedis('commands');

// XREADGROUP ... BLOCK only. A blocked connection can't serve other commands (ARCH §9.1).
export const blockingRedis: Redis = createRedis('blocking');

// Without the offline queue, a command sent before the connection is up rejects instead
// of waiting, so startup waits for 'ready' first.
export async function waitForReady(client: Redis): Promise<void> {
  if (client.status === 'ready') {
    return;
  }
  await new Promise<void>((resolve) => client.once('ready', () => resolve()));
}
