import bcrypt from 'bcrypt';
import { prisma } from '../src/lib/prisma';
import { SEED_USER_EMAIL, seed } from '../prisma/seed';

// Brief Day 3 / ARCH C2.3: the seed loads without errors and is safe to run twice.

const PASSWORD = 'seed-test-password';

async function counts(): Promise<{ users: number; boards: number; tasks: number }> {
  const [users, boards, tasks] = await Promise.all([
    prisma.user.count(),
    prisma.board.count(),
    prisma.task.count(),
  ]);
  return { users, boards, tasks };
}

describe('prisma seed', () => {
  it('creates 1 user, 2 boards and 3 tasks on the first board', async () => {
    const summary = await seed(PASSWORD);

    expect(summary).toEqual({ users: 1, boards: 2, tasks: 3 });
    expect(await counts()).toEqual({ users: 1, boards: 2, tasks: 3 });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: SEED_USER_EMAIL },
      include: { boards: { include: { tasks: true } } },
    });
    expect(user.boards).toHaveLength(2);
    expect(user.boards.map((board) => board.tasks.length).sort()).toEqual([0, 3]);
  });

  it('stores a bcrypt hash, never the plain password', async () => {
    await seed(PASSWORD);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: SEED_USER_EMAIL } });
    expect(user.password).not.toBe(PASSWORD);
    expect(user.password).toMatch(/^\$2b\$12\$/);
    expect(await bcrypt.compare(PASSWORD, user.password)).toBe(true);
  });

  it('is idempotent: a second run adds no rows and keeps the first hash', async () => {
    await seed(PASSWORD);
    const first = await prisma.user.findUniqueOrThrow({ where: { email: SEED_USER_EMAIL } });

    await seed(PASSWORD);

    expect(await counts()).toEqual({ users: 1, boards: 2, tasks: 3 });
    const second = await prisma.user.findUniqueOrThrow({ where: { email: SEED_USER_EMAIL } });
    expect(second.password).toBe(first.password);
  });
});
