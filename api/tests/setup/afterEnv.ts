import { prisma } from '../../src/lib/prisma';

// ADR-008: every test starts from empty tables. This static TRUNCATE is test-only;
// src/ keeps the no-raw-SQL rule. Redis flushdb joins here with day-06.
beforeEach(async () => {
  await prisma.$executeRaw`TRUNCATE "AuditLog", "Task", "Board", "User" CASCADE`;
});

afterAll(async () => {
  await prisma.$disconnect();
});
