import { PrismaClient } from '@prisma/client';

// One client per process (ARCH §3, C2.2). It reads DATABASE_URL itself; env.ts has
// already validated it at startup.
export const prisma: PrismaClient = new PrismaClient();
