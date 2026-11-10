import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { logger } from './logger';
import { redis } from './redis';

// Token signing, verification and the Redis `refresh:{sub}:{jti}` key in one place, so
// the options can't drift (ADR-004 §6). Every Redis call here fails closed (ADR-005 §4):
// a token is never issued or accepted without its key being written or checked.

const ALGORITHM = 'HS256';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AccessClaims {
  sub: string;
}

export interface RefreshClaims {
  sub: string;
  jti: string;
}

const refreshKey = (sub: string, jti: string): string => `refresh:${sub}:${jti}`;

async function withRedis<T>(command: () => Promise<T>): Promise<T> {
  try {
    return await command();
  } catch (err) {
    logger.error({ err }, 'redis unavailable — refusing token operation');
    throw new AppError('Service unavailable', 503, 'SERVICE_UNAVAILABLE');
  }
}

export function invalidRefreshToken(): AppError {
  return new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
}

export function signAccessToken(sub: string): string {
  return jwt.sign({ sub }, env.JWT_ACCESS_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: env.JWT_ACCESS_TTL,
  });
}

export function signRefreshToken(sub: string, jti: string): string {
  return jwt.sign({ sub, jti }, env.JWT_REFRESH_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: env.JWT_REFRESH_TTL_SECONDS,
  });
}

/** Signs a new pair and stores its refresh token id with the same TTL as the JWT. */
export async function issueTokenPair(userId: string): Promise<TokenPair> {
  const jti = randomUUID();
  await withRedis(() => redis.set(refreshKey(userId, jti), '1', 'EX', env.JWT_REFRESH_TTL_SECONDS));
  return { accessToken: signAccessToken(userId), refreshToken: signRefreshToken(userId, jti) };
}

/** Signature and expiry only, no database or Redis call (ARCH §8). Throws on a bad token. */
export function verifyAccess(token: string): AccessClaims {
  // Pinning the algorithm rejects tokens signed with anything else, including `none`.
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [ALGORITHM] });
  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    throw new AppError('Invalid or expired token', 401, 'UNAUTHORIZED');
  }
  return { sub: payload.sub };
}

/** Signature and expiry only; consumeRefresh does the Redis check. Throws a 401 AppError. */
export function verifyRefresh(token: string): RefreshClaims {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: [ALGORITHM] });
  } catch {
    // Expired, bad signature or malformed all get FR-A3's single code, not UNAUTHORIZED.
    throw invalidRefreshToken();
  }
  if (
    typeof payload === 'string' ||
    typeof payload.sub !== 'string' ||
    typeof payload.jti !== 'string'
  ) {
    throw invalidRefreshToken();
  }
  return { sub: payload.sub, jti: payload.jti };
}

/**
 * Deletes the token's key and reports whether it was still live. The DEL result is the
 * check, so two concurrent calls with the same token can't both get true (ADR-004 §3).
 */
export async function consumeRefresh({ sub, jti }: RefreshClaims): Promise<boolean> {
  const deleted = await withRedis(() => redis.del(refreshKey(sub, jti)));
  return deleted === 1;
}
