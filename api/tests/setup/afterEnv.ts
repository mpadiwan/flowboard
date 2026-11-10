import { prisma } from '../../src/lib/prisma';
import { redis } from '../../src/lib/redis';

// ADR-008: every test starts from empty tables and an empty Redis. This static TRUNCATE
// is test-only; src/ keeps the no-raw-SQL rule.

// Commands sent before the client is ready reject (no offline queue), and the rate
// limiter would silently fail open, so wait for the connection first.
beforeAll(async () => {
  if (redis.status !== 'ready') {
    await new Promise<void>((resolve) => redis.once('ready', () => resolve()));
  }
});

beforeEach(async () => {
  await prisma.$executeRaw`TRUNCATE "AuditLog", "Task", "Board", "User" CASCADE`;
  await redis.flushdb();
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});
