import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { logger } from '../lib/logger';
import { redis } from '../lib/redis';
import { LoginSchema } from '../schemas/auth';

// NFR-6, ARCH §9.2: after LOGIN_MAX_FAILURES failed logins for one email, login returns
// 429 ACCOUNT_LOCKED for LOGIN_LOCKOUT_SECONDS. Unknown emails count too, so the lockout
// behaves the same whether or not the account exists. Fails open (ADR-005): a Redis error
// is logged and never blocks a login or changes its result. The email is never logged.

const failKey = (email: string): string => `login:fail:${email}`;
const lockKey = (email: string): string => `login:lock:${email}`;

// Runs after rateLimiter and before login. Attempts while locked never reach the handler,
// so they don't extend the lock. A missing or invalid email passes through to the
// handler's own LoginSchema parse (422); the same normalisation keeps the keys in step.
export const loginLockout = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as { email?: unknown } | undefined;
    const email = LoginSchema.shape.email.safeParse(body?.email);
    if (!email.success) {
      return next();
    }

    // -2: no lock key. Any other value means locked; -1 (no TTL) can't happen, but would
    // still lock, and Retry-After then falls back to the full window.
    const ttl = await redis.ttl(lockKey(email.data));
    if (ttl !== -2) {
      res.setHeader('Retry-After', ttl > 0 ? ttl : env.LOGIN_LOCKOUT_SECONDS);
      return next(new AppError('Too many failed login attempts', 429, 'ACCOUNT_LOCKED'));
    }
    next();
  } catch (err) {
    logger.warn({ err }, 'login lockout unavailable — failing open');
    next();
  }
};

// Called by login on every 401. The counter's TTL starts at the first failure (EXPIRE NX,
// as in rateLimiter), so failures spread over more than the window never add up to a lock.
export async function recordLoginFailure(email: string): Promise<void> {
  try {
    const replies = await redis
      .multi()
      .incr(failKey(email))
      .expire(failKey(email), env.LOGIN_LOCKOUT_SECONDS, 'NX')
      .exec();
    const count = replies?.[0]?.[1];
    if (typeof count !== 'number') {
      throw new Error('Unexpected login lockout reply from Redis');
    }

    if (count >= env.LOGIN_MAX_FAILURES) {
      await redis
        .multi()
        .set(lockKey(email), '1', 'EX', env.LOGIN_LOCKOUT_SECONDS)
        .del(failKey(email))
        .exec();
    }
  } catch (err) {
    logger.warn({ err }, 'login lockout unavailable — failure not recorded');
  }
}

// Called by login on success: the count starts again from zero.
export async function clearLoginFailures(email: string): Promise<void> {
  try {
    await redis.del(failKey(email));
  } catch (err) {
    logger.warn({ err }, 'login lockout unavailable — failures not cleared');
  }
}
