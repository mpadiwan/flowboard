import bcrypt from 'bcrypt';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';

// FR-A1, FR-A2, AC-2.1, AC-2.2. These go through the real bcrypt cost, so they register
// only the users they need. Refresh, logout and lockout join with day-07 and day-12.

const EMAIL = 'ada@flowboard.test';
const PASSWORD = 'correct horse battery';

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

async function register(email = EMAIL, password = PASSWORD): Promise<request.Response> {
  return request(app).post('/auth/register').send({ email, password });
}

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
