import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';

// TEMPORARY (day-04 only). Boards need an owner before auth exists, so every request
// acts as the seed user. week-01 deletes this file and mounts `authenticate` in its
// place; handlers read req.user either way, so they don't change.

// Must match SEED_USER_EMAIL in prisma/seed.ts (src/ can't import from prisma/).
const ACTING_USER_EMAIL = 'dev@flowboard.test';

export const actingUser = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (env.NODE_ENV === 'production') {
      throw new AppError('Acting-user stub is disabled in production', 500, 'ACTING_USER_DISABLED');
    }

    const user = await prisma.user.findUnique({
      where: { email: ACTING_USER_EMAIL },
      select: { id: true },
    });
    if (!user) {
      throw new AppError(
        'Acting user not found; run `npm run db:seed`',
        500,
        'ACTING_USER_MISSING',
      );
    }

    req.user = { id: user.id };
    next();
  } catch (err) {
    next(err);
  }
};
