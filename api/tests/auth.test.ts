import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { issueTokenPair, signAccessToken } from '../src/lib/tokens';
import { createUser } from './helpers/factories';

// FR-A1 to FR-A4, AC-2.1 to AC-2.5, AC-5.2. Register and login go through the real bcrypt
// cost, so they register only the users they need; refresh and logout take a stored pair
// straight from issueTokenPair. Lockout joins with day-12.

const EMAIL = 'ada@flowboard.test';
const PASSWORD = 'correct horse battery';

// Signature and claim checks run before any Redis lookup, so the user needn't exist.
const STRANGER = randomUUID();
const INVALID_REFRESH_TOKENS: [string, string][] = [
  [
    'an expired token',
    jwt.sign({ sub: STRANGER, jti: randomUUID() }, env.JWT_REFRESH_SECRET, { expiresIn: -10 }),
  ],
  [
    'a token signed with another secret',
    jwt.sign({ sub: STRANGER, jti: randomUUID() }, 'x'.repeat(32)),
  ],
  ['an access token (ADR-004)', signAccessToken(STRANGER)],
  ['a token with no jti', jwt.sign({ sub: STRANGER }, env.JWT_REFRESH_SECRET)],
  ['a malformed token', 'not-a-jwt'],
];

const INVALID_REFRESH_BODIES: [string, object][] = [
  ['a missing refreshToken', {}],
  ['an empty refreshToken', { refreshToken: '' }],
  ['a non-string refreshToken', { refreshToken: 42 }],
];

const INVALID_REFRESH_TOKEN_BODY = {
  success: false,
  message: 'Invalid or expired refresh token',
  code: 'INVALID_REFRESH_TOKEN',
};

// Matched, not equalled: outside production every 5xx body also carries `stack` (NFR-7).
const SERVICE_UNAVAILABLE_BODY = {
  success: false,
  message: 'Service unavailable',
  code: 'SERVICE_UNAVAILABLE',
};

interface ErrorResponse {
  success: false;
  message: string;
  code: string;
  details?: { path: string; message: string }[];
}

interface RegisterResponse {
  success: true;
  data: {
    user: { id: string; email: string; createdAt: string };
    accessToken: string;
    refreshToken: string;
  };
}

interface LoginResponse {
  success: true;
  data: { accessToken: string; refreshToken: string };
}

function decode(token: string): JwtPayload {
  const payload = jwt.decode(token);
  if (payload === null || typeof payload === 'string') {
    throw new Error('Expected a JWT with an object payload');
  }
  return payload;
}

// The Redis key a refresh token was stored under (ARCH §9.2).
function keyOf(refreshToken: string): string {
  const { sub, jti } = decode(refreshToken);
  return `refresh:${String(sub)}:${String(jti)}`;
}

async function expectStoredForSevenDays(refreshToken: string): Promise<void> {
  const ttl = await redis.ttl(keyOf(refreshToken));
  expect(ttl).toBeGreaterThan(env.JWT_REFRESH_TTL_SECONDS - 10);
  expect(ttl).toBeLessThanOrEqual(env.JWT_REFRESH_TTL_SECONDS);
}

// Stands in for a Redis outage on one command, without stopping Redis.
function failNext(command: 'set' | 'del'): void {
  jest.spyOn(redis, command).mockRejectedValueOnce(new Error('Connection is closed.'));
}

async function register(email = EMAIL, password = PASSWORD): Promise<request.Response> {
  return request(app).post('/auth/register').send({ email, password });
}

async function postRefresh(body: object): Promise<request.Response> {
  return request(app).post('/auth/refresh').send(body);
}

async function postLogout(body: object): Promise<request.Response> {
  return request(app).post('/auth/logout').send(body);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST /auth/register', () => {
  it('returns 201 with the user and a token pair, never the password', async () => {
    const res = await register();

    expect(res.status).toBe(201);
    const { data } = res.body as RegisterResponse;
    expect(Object.keys(data.user).sort()).toEqual(['createdAt', 'email', 'id']);
    expect(data.user.email).toBe(EMAIL);
    expect(typeof data.accessToken).toBe('string');
    expect(typeof data.refreshToken).toBe('string');
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });

  it('stores a bcrypt hash at cost 12 or higher (AC-2.1)', async () => {
    const res = await register();

    const { user } = (res.body as RegisterResponse).data;
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.password).not.toBe(PASSWORD);
    expect(bcrypt.getRounds(stored.password)).toBeGreaterThanOrEqual(12);
    expect(await bcrypt.compare(PASSWORD, stored.password)).toBe(true);
  });

  it('trims and lower-cases the email', async () => {
    const res = await register('  Ada@FlowBoard.TEST ');

    expect(res.status).toBe(201);
    expect((res.body as RegisterResponse).data.user.email).toBe(EMAIL);
  });

  it('strips unknown fields such as isAdmin (AC-3.5)', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: EMAIL, password: PASSWORD, isAdmin: true });

    expect(res.status).toBe(201);
    expect((res.body as RegisterResponse).data.user).not.toHaveProperty('isAdmin');
  });

  it('returns 409 EMAIL_TAKEN for a duplicate email, in any case (AC-2.1)', async () => {
    await register();

    const res = await register(EMAIL.toUpperCase());

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, code: 'EMAIL_TAKEN' });
    expect(await prisma.user.count()).toBe(1);
  });

  it('returns 500 INTERNAL_ERROR when the insert fails for any other reason', async () => {
    jest.spyOn(prisma.user, 'create').mockRejectedValueOnce(new Error('Connection lost'));

    const res = await register();

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
    expect(await prisma.user.count()).toBe(0);
    expect(await redis.keys('refresh:*')).toEqual([]);
  });

  it.each([
    ['a missing email', { password: PASSWORD }, 'email'],
    ['an invalid email', { email: 'not-an-email', password: PASSWORD }, 'email'],
    ['a 7-character password', { email: EMAIL, password: 'a'.repeat(7) }, 'password'],
    ['a 73-character password', { email: EMAIL, password: 'a'.repeat(73) }, 'password'],
    ['a password over 72 UTF-8 bytes', { email: EMAIL, password: 'é'.repeat(37) }, 'password'],
  ])('returns 422 for %s', async (_label, body, path) => {
    const res = await request(app).post('/auth/register').send(body);

    expect(res.status).toBe(422);
    const error = res.body as ErrorResponse;
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details?.[0]?.path).toBe(path);
  });
});

describe('POST /auth/login', () => {
  let userId: string;

  beforeEach(async () => {
    userId = ((await register()).body as RegisterResponse).data.user.id;
  });

  it('returns 200 with a 15-minute access token and a 7-day refresh token (AC-2.2)', async () => {
    const res = await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(200);
    const { data } = res.body as LoginResponse;
    expect(Object.keys(data).sort()).toEqual(['accessToken', 'refreshToken']);

    const access = jwt.verify(data.accessToken, env.JWT_ACCESS_SECRET) as JwtPayload;
    expect(access.sub).toBe(userId);
    expect((access.exp ?? 0) - (access.iat ?? 0)).toBe(15 * 60);

    const refresh = jwt.verify(data.refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;
    expect(refresh.sub).toBe(userId);
    expect(typeof refresh.jti).toBe('string');
    expect((refresh.exp ?? 0) - (refresh.iat ?? 0)).toBe(7 * 24 * 60 * 60);
  });

  it('accepts the email in any case', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: ' ADA@flowboard.test', password: PASSWORD });

    expect(res.status).toBe(200);
  });

  it('issues an access token that opens protected routes', async () => {
    const login = await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });
    const { accessToken } = (login.body as LoginResponse).data;

    const res = await request(app).get('/boards').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  });

  it('signs a fresh refresh token id on every login', async () => {
    const first = await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });
    const second = await request(app)
      .post('/auth/login')
      .send({ email: EMAIL, password: PASSWORD });

    const jti = (res: request.Response): unknown =>
      decode((res.body as LoginResponse).data.refreshToken).jti;
    expect(jti(first)).not.toBe(jti(second));
  });

  it('stores the refresh token id in Redis with a 7-day TTL (AC-5.2)', async () => {
    const res = await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });

    await expectStoredForSevenDays((res.body as LoginResponse).data.refreshToken);
  });

  it('returns 503 SERVICE_UNAVAILABLE when the refresh token cannot be stored (ADR-005)', async () => {
    failNext('set');

    const res = await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject(SERVICE_UNAVAILABLE_BODY);
  });

  it('returns 401 INVALID_CREDENTIALS for a wrong password (AC-2.2)', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: EMAIL, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      message: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('returns the identical 401 for an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/auth/login')
      .send({ email: EMAIL, password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@flowboard.test', password: PASSWORD });

    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it.each([
    ['a missing password', { email: EMAIL }, 'password'],
    ['an empty password', { email: EMAIL, password: '' }, 'password'],
    ['an invalid email', { email: 'ada', password: PASSWORD }, 'email'],
  ])('returns 422 for %s', async (_label, body, path) => {
    const res = await request(app).post('/auth/login').send(body);

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).details?.[0]?.path).toBe(path);
  });
});

describe('POST /auth/refresh', () => {
  let userId: string;

  beforeEach(async () => {
    userId = (await createUser()).id;
  });

  it('returns 200 with a new pair and rotates the Redis key (AC-2.3)', async () => {
    const old = await issueTokenPair(userId);

    const res = await postRefresh({ refreshToken: old.refreshToken });

    expect(res.status).toBe(200);
    const { data } = res.body as LoginResponse;
    expect(Object.keys(data).sort()).toEqual(['accessToken', 'refreshToken']);
    expect(decode(data.refreshToken).sub).toBe(userId);
    expect(decode(data.refreshToken).jti).not.toBe(decode(old.refreshToken).jti);
    expect(await redis.exists(keyOf(old.refreshToken))).toBe(0);
    await expectStoredForSevenDays(data.refreshToken);
  });

  it('issues an access token that opens protected routes', async () => {
    const res = await postRefresh({ refreshToken: (await issueTokenPair(userId)).refreshToken });
    const { accessToken } = (res.body as LoginResponse).data;

    const boards = await request(app).get('/boards').set('Authorization', `Bearer ${accessToken}`);

    expect(boards.status).toBe(200);
  });

  it('returns 401 INVALID_REFRESH_TOKEN when a used token is replayed (AC-2.4)', async () => {
    const { refreshToken } = await issueTokenPair(userId);
    await postRefresh({ refreshToken });

    const res = await postRefresh({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID_REFRESH_TOKEN_BODY);
  });

  it('lets only one of two concurrent refreshes with the same token succeed', async () => {
    const { refreshToken } = await issueTokenPair(userId);

    const results = await Promise.all([
      postRefresh({ refreshToken }),
      postRefresh({ refreshToken }),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 401]);
  });

  it.each(INVALID_REFRESH_TOKENS)(
    'returns 401 INVALID_REFRESH_TOKEN for %s',
    async (_label, token) => {
      const res = await postRefresh({ refreshToken: token });

      expect(res.status).toBe(401);
      expect(res.body).toEqual(INVALID_REFRESH_TOKEN_BODY);
    },
  );

  it.each(INVALID_REFRESH_BODIES)('returns 422 for %s', async (_label, body) => {
    const res = await postRefresh(body);

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).details?.[0]?.path).toBe('refreshToken');
  });

  it('returns 503 SERVICE_UNAVAILABLE when Redis is down, and keeps the token (ADR-005)', async () => {
    const { refreshToken } = await issueTokenPair(userId);
    failNext('del');

    const res = await postRefresh({ refreshToken });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject(SERVICE_UNAVAILABLE_BODY);
    expect(await redis.exists(keyOf(refreshToken))).toBe(1);
  });
});

describe('POST /auth/logout', () => {
  let refreshToken: string;

  beforeEach(async () => {
    ({ refreshToken } = await issueTokenPair((await createUser()).id));
  });

  it('returns 204 with no body and deletes the Redis key (AC-2.5)', async () => {
    const res = await postLogout({ refreshToken });

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await redis.exists(keyOf(refreshToken))).toBe(0);
  });

  it('makes the token unusable for refresh afterwards (AC-2.5)', async () => {
    await postLogout({ refreshToken });

    const res = await postRefresh({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID_REFRESH_TOKEN_BODY);
  });

  it('returns 204 again for a token that was already revoked', async () => {
    await postLogout({ refreshToken });

    const res = await postLogout({ refreshToken });

    expect(res.status).toBe(204);
  });

  it.each(INVALID_REFRESH_TOKENS)(
    'returns 401 INVALID_REFRESH_TOKEN for %s',
    async (_label, token) => {
      const res = await postLogout({ refreshToken: token });

      expect(res.status).toBe(401);
      expect(res.body).toEqual(INVALID_REFRESH_TOKEN_BODY);
    },
  );

  it.each(INVALID_REFRESH_BODIES)('returns 422 for %s', async (_label, body) => {
    const res = await postLogout(body);

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).details?.[0]?.path).toBe('refreshToken');
  });

  it('returns 503 SERVICE_UNAVAILABLE when Redis is down (ADR-005)', async () => {
    failNext('del');

    const res = await postLogout({ refreshToken });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject(SERVICE_UNAVAILABLE_BODY);
    expect(await redis.exists(keyOf(refreshToken))).toBe(1);
  });
});
