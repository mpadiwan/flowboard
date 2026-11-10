import { env } from './config/env';
import { ensureGroup, runConsumer } from './consumer';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { blockingRedis, redis, waitForReady } from './lib/redis';

// ADR-006 §6: SIGTERM or SIGINT lets the current batch finish, then the worker
// disconnects from Postgres and both Redis connections and exits 0.

async function main(): Promise<void> {
  logger.info({ env: env.NODE_ENV }, 'worker started');

  let stopping = false;
  const stop = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'worker shutting down');
    stopping = true;
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  await Promise.all([waitForReady(redis), waitForReady(blockingRedis)]);
  await ensureGroup();
  await runConsumer(() => stopping);

  await prisma.$disconnect();
  await Promise.all([redis.quit(), blockingRedis.quit()]);
  logger.info('worker stopped');
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.fatal({ err }, 'worker crashed');
    process.exit(1);
  });
