import { randomUUID } from 'node:crypto';
import type { Board } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';

// Tests need a real boardId: a made-up UUID fails the board lookup with 404.
// Until auth and boards routes exist (week-01, day-04) the board and its owner are
// inserted directly; the password is a placeholder, never a real hash.
export async function createBoard(name = 'Test board'): Promise<Board> {
  const owner = await prisma.user.create({
    data: { email: `owner-${randomUUID()}@flowboard.test`, password: 'not-a-real-hash' },
  });
  return prisma.board.create({ data: { name, ownerId: owner.id } });
}
