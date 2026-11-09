import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { verifyAccess } from '../lib/tokens';

// Guards every board, task and audit route (ARCH §8, §12 rule 1). It only checks the
// access JWT's signature and expiry, so it needs no database or Redis call. A bad or
// expired token throws a jsonwebtoken error, which globalErrorHandler maps to 401.

const BEARER = /^Bearer\s+(\S+)$/i;

export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const token = BEARER.exec(req.headers.authorization ?? '')?.[1];
    if (!token) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { sub } = verifyAccess(token);
    req.user = { id: sub };
    next();
  } catch (err) {
    next(err);
  }
};
