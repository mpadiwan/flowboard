import { randomUUID } from 'node:crypto';
import type { Board, User } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';
import { prisma } from '../../src/lib/prisma';
import { issueTokenPair } from '../../src/lib/tokens';

// Rows are inserted directly; the password is a placeholder, never a real hash.
// Tests need a real boardId: a made-up UUID fails the board lookup with 404.

export async function createUser(email = `user-${randomUUID()}@flowboard.test`): Promise<User> {
  return prisma.user.create({ data: { email, password: 'not-a-real-hash' } });
}

// A valid Authorization header for the user, signed directly so route tests skip the
// bcrypt cost of register/login (auth.test.ts covers those).
export function bearer(userId: string): string {
  return `Bearer ${issueTokenPair(userId).accessToken}`;
}

// Authorization headers that authenticate must reject with 401 (AC-2.6), as [label, header].
export function rejectedAuthHeaders(userId: string): [string, string][] {
  const { refreshToken } = issueTokenPair(userId);
  return [
    ['a non-Bearer scheme', `Basic ${Buffer.from('a:b').toString('base64')}`],
    ['a Bearer header with no token', 'Bearer '],
    ['a malformed token', 'Bearer not-a-jwt'],
    [
      'an expired token',
      `Bearer ${jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, { expiresIn: -10 })}`,
    ],
    ['a token signed with another secret', `Bearer ${jwt.sign({ sub: userId }, 'x'.repeat(32))}`],
    ['a token with no sub claim', `Bearer ${jwt.sign({}, env.JWT_ACCESS_SECRET)}`],
    ['a refresh token (ADR-004)', `Bearer ${refreshToken}`],
  ];
}

export async function createBoard(ownerId: string, name = 'Test board'): Promise<Board> {
  return prisma.board.create({ data: { name, ownerId } });
}
