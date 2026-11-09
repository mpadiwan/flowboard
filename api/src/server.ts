import app from './app';
import { env } from './config/env';
import { logger } from './lib/logger';

// The only file that calls listen().
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api listening');
});

const FORCE_EXIT_AFTER_MS = 10_000;

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'api shutting down');
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'error while closing http server');
      process.exit(1);
    }
    process.exit(0);
  });
  // Open keep-alive connections can hold close() open; don't outlive Compose's stop timeout.
  setTimeout(() => process.exit(1), FORCE_EXIT_AFTER_MS).unref();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
