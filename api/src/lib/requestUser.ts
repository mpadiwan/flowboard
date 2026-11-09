import type { Request } from 'express';
import { AppError } from '../errors/AppError';

/** The caller's user id, set by the router's guard. 401 if the guard didn't run. */
export function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return req.user.id;
}
