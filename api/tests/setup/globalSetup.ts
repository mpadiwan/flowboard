import { env } from '../../src/config/env';

// ADR-008: tests truncate every table, so refuse to run anywhere but a *_test database.
export default function globalSetup(): void {
  const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);
  if (env.NODE_ENV !== 'test' || !databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests: NODE_ENV=${env.NODE_ENV}, database=${databaseName}. ` +
        'Use docker compose -f docker-compose.test.yml.',
    );
  }
}
