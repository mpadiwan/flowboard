// Runs before any test module loads, so config/env.ts validates these values. Redis and
// Prisma are mocked in every test, so DATABASE_URL is never connected to.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://unused:unused@localhost:5432/unused_test';
process.env.WORKER_CONSUMER_NAME = 'worker-test';
process.env.WORKER_MAX_DELIVERIES = '3';
process.env.WORKER_CLAIM_IDLE_MS = '30000';
