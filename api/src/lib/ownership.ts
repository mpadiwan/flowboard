import { Prisma, type Board, type Task } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { prisma } from './prisma';

// Ownership goes through Board.ownerId; tasks have no userId (ADR-003, ARCH §12 rule 2).
// Load first, then check: 404 if missing, 403 if it belongs to someone else.

export async function getOwnedBoard(id: string, userId: string): Promise<Board> {
  const board = await prisma.board.findUnique({ where: { id } });
  if (!board) {
    throw new AppError('Board not found', 404, 'BOARD_NOT_FOUND');
  }
  if (board.ownerId !== userId) {
    throw new AppError('You do not have access to this board', 403, 'FORBIDDEN');
  }
  return board;
}

export async function getOwnedTask(id: string, userId: string): Promise<Task> {
  const found = await prisma.task.findUnique({
    where: { id },
    include: { board: { select: { ownerId: true } } },
  });
  if (!found) {
    throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
  }
  if (found.board.ownerId !== userId) {
    throw new AppError('You do not have access to this task', 403, 'FORBIDDEN');
  }
  // The board join is only for the check; the response keeps the plain Task shape.
  const { board: _board, ...task } = found;
  return task;
}

// For the write that follows a check: a concurrent delete in between makes Prisma throw
// P2025, so report it with the resource's own 404 code instead of the generic NOT_FOUND.
// Use as `.catch(rethrowGone(...))`; any other error is rethrown unchanged.
export function rethrowGone(message: string, code: string): (err: unknown) => never {
  return (err: unknown): never => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError(message, 404, code);
    }
    throw err;
  };
}
