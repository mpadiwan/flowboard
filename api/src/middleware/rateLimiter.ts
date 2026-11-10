import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { logger } from '../lib/logger';
import { redis } from '../lib/redis';

// NFR-5, ADR-005: RATE_LIMIT_MAX requests per IP per window, one bucket shared by
// login and register (ARCH §9.2). Fails open: if Redis errors, log and let the request through.
export const rateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const key = `rate:auth:${req.ip ?? 'unknown'}`;

    // One atomic round trip. EXPIRE NX sets the TTL on the first hit only, so the
    // counter can never be left without an expiry.
    const replies = await redis
      .multi()
      .incr(key)
      .expire(key, env.RATE_LIMIT_WINDOW_SECONDS, 'NX')
      .ttl(key)
      .exec();
    const count = replies?.[0]?.[1];
    const ttl = replies?.[2]?.[1];
    if (typeof count !== 'number' || typeof ttl !== 'number') {
      throw new Error('Unexpected rate limiter reply from Redis');
    }

    res.setHeader('RateLimit-Limit', env.RATE_LIMIT_MAX);
    res.setHeader('RateLimit-Remaining', Math.max(0, env.RATE_LIMIT_MAX - count));

    if (count > env.RATE_LIMIT_MAX) {
      res.setHeader('Retry-After', ttl);
      return next(new AppError('Too many requests', 429, 'RATE_LIMIT_EXCEEDED'));
    }
    next();
  } catch (err) {
    logger.warn({ err }, 'rate limiter unavailable — failing open');
    next();
  }
};
