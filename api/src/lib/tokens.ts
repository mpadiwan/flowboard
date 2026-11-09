import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

// Token signing and verification in one place, so the options can't drift (ADR-004 §6).
// verifyRefresh and the Redis `refresh:{sub}:{jti}` key join with day-07; until then a
// refresh token is issued but there is no route that accepts it.

const ALGORITHM = 'HS256';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AccessClaims {
  sub: string;
}

export function issueTokenPair(userId: string): TokenPair {
  const accessToken = jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: env.JWT_ACCESS_TTL,
  });
  const refreshToken = jwt.sign({ sub: userId, jti: randomUUID() }, env.JWT_REFRESH_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: env.JWT_REFRESH_TTL_SECONDS,
  });
  return { accessToken, refreshToken };
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
