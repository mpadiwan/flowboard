import type { ChainableCommander } from 'ioredis';
import request from 'supertest';
import app from '../src/app';
import { env } from '../src/config/env';
import { logger } from '../src/lib/logger';
import { redis } from '../src/lib/redis';

// NFR-5, AC-4.4, AC-5.1, AC-5.4. Bodies are empty, so every allowed request stops at
// Zod with a 422 and never pays the bcrypt cost. X-Forwarded-For pins the client IP
// (trust proxy = 1, ADR-002), which makes the Redis key predictable.

const IP = '203.0.113.1';
const OTHER_IP = '203.0.113.2';

interface ErrorResponse {
  success: false;
  message: string;
  code: string;
}

async function hit(path: string, ip = IP): Promise<request.Response> {
  return request(app).post(path).set('X-Forwarded-For', ip).send({});
}

async function hitTimes(path: string, times: number, ip = IP): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    const res = await hit(path, ip);
    expect(res.status).toBe(422);
  }
}

// Stands in for redis.multi() to reach the failure branches without stopping Redis.
function fakeMulti(exec: () => Promise<unknown>): ChainableCommander {
  const chain = { incr: () => chain, expire: () => chain, ttl: () => chain, exec };
  return chain as unknown as ChainableCommander;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('rateLimiter', () => {
  it('lets a request under the limit through and reports the remaining budget', async () => {
    const res = await hit('/auth/login');

    expect(res.status).toBe(422);
    expect(res.headers['ratelimit-limit']).toBe(String(env.RATE_LIMIT_MAX));
    expect(res.headers['ratelimit-remaining']).toBe(String(env.RATE_LIMIT_MAX - 1));
    expect(res.headers['retry-after']).toBeUndefined();
  });

  it.each(['/auth/login', '/auth/register'])(
    'returns 429 on %s once the limit is exceeded (AC-4.4)',
    async (path) => {
      await hitTimes(path, env.RATE_LIMIT_MAX);

      const res = await hit(path);

      expect(res.status).toBe(429);
      expect((res.body as ErrorResponse).code).toBe('RATE_LIMIT_EXCEEDED');
      expect(res.headers['ratelimit-remaining']).toBe('0');
      const retryAfter = Number(res.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(env.RATE_LIMIT_WINDOW_SECONDS);
    },
  );

  it('shares one bucket between register and login', async () => {
    await hitTimes('/auth/register', env.RATE_LIMIT_MAX);

    const res = await hit('/auth/login');

    expect(res.status).toBe(429);
  });

  it('keeps a separate bucket per client IP', async () => {
    await hitTimes('/auth/login', env.RATE_LIMIT_MAX);

    expect((await hit('/auth/login')).status).toBe(429);
    expect((await hit('/auth/login', OTHER_IP)).status).toBe(422);
  });

  it('stores the counter under rate:auth:{ip} with a TTL (AC-5.1)', async () => {
    await hit('/auth/login');

    expect(await redis.get(`rate:auth:${IP}`)).toBe('1');
    const ttl = await redis.ttl(`rate:auth:${IP}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(env.RATE_LIMIT_WINDOW_SECONDS);
  });

  it('fails open and logs a warning when Redis rejects (AC-5.4)', async () => {
    jest
      .spyOn(redis, 'multi')
      .mockReturnValue(fakeMulti(() => Promise.reject(new Error('Connection is closed.'))));
    const warn = jest.spyOn(logger, 'warn');

    const res = await hit('/auth/login');

    expect(res.status).toBe(422);
    expect(warn).toHaveBeenCalledTimes(1);
    const [fields, message] = warn.mock.calls[0] as unknown as [{ err: unknown }, string];
    expect(fields.err).toBeInstanceOf(Error);
    expect(message).toBe('rate limiter unavailable — failing open');
  });

  it('fails open when the transaction returns no replies', async () => {
    jest.spyOn(redis, 'multi').mockReturnValue(fakeMulti(() => Promise.resolve(null)));

    const res = await hit('/auth/register');

    expect(res.status).toBe(422);
    expect(res.headers['ratelimit-limit']).toBeUndefined();
  });
});
