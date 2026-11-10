import { PrismaClient } from '@prisma/client';

// One client per process, generated from api/prisma/schema.prisma (ADR-001). It reads
// DATABASE_URL itself; env.ts has already validated it at startup. Minimal error format
// keeps source excerpts out of the logs and the DLQ's `error` field (ARCH §9.3).
export const prisma: PrismaClient = new PrismaClient({ errorFormat: 'minimal' });
