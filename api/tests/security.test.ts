import type { User } from '@prisma/client';
import request from 'supertest';
import app from '../src/app';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import { bearer, createUser } from './helpers/factories';

// NFR-4, NFR-7, AC-3.5, AC-4.1 to AC-4.3, AC-4.6: the security middleware in app.ts and the
// day-12 guarantees, exercised through the real app so the middleware order is under test too.

const ALLOWED_ORIGIN = env.ALLOWED_ORIGINS[0];
const DISALLOWED_ORIGIN = 'https://evil.example.com';

interface ErrorResponse {
  success: false;
  message: string;
  code: string;
  stack?: string;
}

interface BoardResponse {
  success: true;
  data: Record<string, unknown> & { id: string };
}

type Agent = ReturnType<typeof request.agent>;

let me: User;
let api: Agent;

beforeEach(async () => {
  me = await createUser();
  api = request.agent(app).set('Authorization', bearer(me.id));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('helmet (AC-4.1)', () => {
  it('sets security headers on a successful response', async () => {
    const res = await api.get('/boards');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });

  it('sets them on error responses too', async () => {
    const res = await request(app).get('/nope');

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('ROUTE_NOT_FOUND');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('CORS (AC-4.2)', () => {
  it('allows an origin in ALLOWED_ORIGINS', async () => {
    const res = await api.get('/boards').set('Origin', ALLOWED_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('sends no Access-Control-Allow-Origin header to any other origin', async () => {
    const res = await api.get('/boards').set('Origin', DISALLOWED_ORIGIN);

    expect(res.headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('answers a preflight from an allowed origin with 204', async () => {
    const res = await request(app)
      .options('/boards')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization, Content-Type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('gives a preflight from another origin no allow header', async () => {
    const res = await request(app)
      .options('/boards')
      .set('Origin', DISALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers).not.toHaveProperty('access-control-allow-origin');
  });
});

describe('body size limit (AC-4.3)', () => {
  it('rejects a 15kb body with 413 in the JSON error format', async () => {
    const res = await api.post('/boards').send({ name: 'a'.repeat(15 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      success: false,
      message: 'Request body too large',
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('accepts a body under 10kb, which then reaches validation', async () => {
    const res = await api.post('/boards').send({ name: 'a'.repeat(5 * 1024) });

    // Past the body parser: the board schema's 100-character name limit answers now.
    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 INVALID_JSON for a malformed body', async () => {
    const res = await api.post('/boards').set('Content-Type', 'application/json').send('{"name":');

    expect(res.status).toBe(400);
    expect((res.body as ErrorResponse).code).toBe('INVALID_JSON');
  });
});

describe('mass assignment (AC-3.5)', () => {
  it('strips isAdmin and ownerId: the request succeeds and neither is stored', async () => {
    const other = await createUser();

    const res = await api.post('/boards').send({ name: 'Mine', isAdmin: true, ownerId: other.id });

    expect(res.status).toBe(201);
    const { data } = res.body as BoardResponse;
    expect(data).not.toHaveProperty('isAdmin');
    expect(data.ownerId).toBe(me.id);
    const stored = await prisma.board.findUniqueOrThrow({ where: { id: data.id } });
    expect(stored).not.toHaveProperty('isAdmin');
    expect(stored.ownerId).toBe(me.id);
  });
});

describe('production errors (NFR-7, AC-4.6)', () => {
  it('sends no stack and no internal message on a 500', async () => {
    jest.spyOn(prisma.board, 'findMany').mockRejectedValueOnce(new Error('connection refused'));
    const replaced = jest.replaceProperty(env, 'NODE_ENV', 'production');
    try {
      const res = await api.get('/boards');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
      expect(res.body as ErrorResponse).not.toHaveProperty('stack');
    } finally {
      replaced.restore();
    }
  });
});
