import bcrypt from 'bcrypt';
import { Priority, TaskStatus } from '@prisma/client';
import { env } from '../src/config/env';
import { logger } from '../src/lib/logger';
import { prisma } from '../src/lib/prisma';

// Development seed (ARCH C2.3): 1 user, 2 boards, 3 tasks on the first board.
// Run with `npx prisma db seed`. It is idempotent: every row is an upsert with
// `update: {}`, so a second run finds the rows and changes nothing.

export const SEED_USER_EMAIL = 'dev@flowboard.test';

// Board and Task have no natural unique key, so fixed ids are what make the upserts
// idempotent. They are valid v4 UUIDs, so `GET /tasks/:id` accepts them.
const BOARD_IDS = {
  product: '00000000-0000-4000-8000-00000000b001',
  personal: '00000000-0000-4000-8000-00000000b002',
} as const;

const TASKS = [
  {
    id: '00000000-0000-4000-8000-00000000a001',
    title: 'Set up the project repository',
    description: 'Docker Compose stack, TypeScript and the error handler.',
    status: TaskStatus.DONE,
    priority: Priority.HIGH,
  },
  {
    id: '00000000-0000-4000-8000-00000000a002',
    title: 'Design the database schema',
    description: 'User, Board, Task and AuditLog in Prisma.',
    status: TaskStatus.IN_PROGRESS,
    priority: Priority.MEDIUM,
  },
  {
    id: '00000000-0000-4000-8000-00000000a003',
    title: 'Write the API documentation',
    description: null,
    status: TaskStatus.TODO,
    priority: Priority.LOW,
  },
];

export interface SeedSummary {
  users: number;
  boards: number;
  tasks: number;
}

export async function seed(password: string): Promise<SeedSummary> {
  // The hash is computed on every run but only written on the first (update: {}).
  const hash = await bcrypt.hash(password, env.BCRYPT_COST);
  const user = await prisma.user.upsert({
    where: { email: SEED_USER_EMAIL },
    create: { email: SEED_USER_EMAIL, password: hash },
    update: {},
  });

  const product = await prisma.board.upsert({
    where: { id: BOARD_IDS.product },
    create: { id: BOARD_IDS.product, name: 'Product launch', ownerId: user.id },
    update: {},
  });
  await prisma.board.upsert({
    where: { id: BOARD_IDS.personal },
    create: { id: BOARD_IDS.personal, name: 'Personal', ownerId: user.id },
    update: {},
  });

  for (const task of TASKS) {
    await prisma.task.upsert({
      where: { id: task.id },
      create: { ...task, boardId: product.id },
      update: {},
    });
  }

  return { users: 1, boards: Object.keys(BOARD_IDS).length, tasks: TASKS.length };
}

async function main(): Promise<void> {
  try {
    if (env.NODE_ENV === 'production') {
      throw new Error('Refusing to seed a production database');
    }
    if (!env.SEED_USER_PASSWORD) {
      throw new Error('SEED_USER_PASSWORD is not set (see .env.example)');
    }
    const summary = await seed(env.SEED_USER_PASSWORD);
    logger.info({ ...summary, email: SEED_USER_EMAIL }, 'Seed complete');
  } catch (err) {
    logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Only when run directly (`prisma db seed`); tests import seed() without running main().
if (require.main === module) {
  void main();
}
