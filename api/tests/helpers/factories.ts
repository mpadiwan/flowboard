import { randomUUID } from 'node:crypto';
import type { Board, User } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';

// Rows are inserted directly; the password is a placeholder, never a real hash.
// Tests need a real boardId: a made-up UUID fails the board lookup with 404.

// The seed user that the day-04 actingUser stub resolves every request to.
// week-01 replaces this with a register-and-login helper that returns a token.
export const ACTING_USER_EMAIL = 'dev@flowboard.test';

export async function createUser(email = `user-${randomUUID()}@flowboard.test`): Promise<User> {
  return prisma.user.create({ data: { email, password: 'not-a-real-hash' } });
}

export async function createActingUser(): Promise<User> {
  return createUser(ACTING_USER_EMAIL);
}

export async function createBoard(ownerId: string, name = 'Test board'): Promise<Board> {
  return prisma.board.create({ data: { name, ownerId } });
}
