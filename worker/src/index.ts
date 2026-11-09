import { env } from './config/env';
import { logger } from './lib/logger';

function waitForShutdownSignal(): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    process.once('SIGTERM', () => resolve('SIGTERM'));
    process.once('SIGINT', () => resolve('SIGINT'));
  });
}

async function main(): Promise<void> {
  logger.info({ env: env.NODE_ENV }, 'worker started');

  // The tasks:events consumer loop (ADR-006) arrives with day-08. Until then the worker
  // only stays alive and shuts down cleanly. Signal listeners alone don't keep Node's
  // event loop running, so an idle timer does.
  const keepAlive = setInterval(() => undefined, 60_000);
  const signal = await waitForShutdownSignal();
  clearInterval(keepAlive);

  logger.info({ signal }, 'worker shutting down');
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.fatal({ err }, 'worker crashed');
    process.exit(1);
  });
