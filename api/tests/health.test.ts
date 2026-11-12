import request from 'supertest';
import app from '../src/app';
import { logger } from '../src/lib/logger';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { withTimeout } from '../src/routes/health';

// FR-H1, FR-H2, AC-8.1 to AC-8.3. The mocked 503s stand in for a stopped container;
// the manual check stops db and redis by hand (day-14 retro).

interface ErrorResponse {
  success: false;
  message: string;
  code: string;
}

interface HealthResponse {
  success: true;
  data: { status: 'ok'; uptime: number };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /health', () => {
  it('returns 200 with uptime and needs no token', async () => {
    const res = await request(app).get('/health');
    const body = res.body as HealthResponse;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(typeof body.data.uptime).toBe('number');
    expect(body.data.uptime).toBeGreaterThanOrEqual(0);
  });
});

describe('GET /ready', () => {
  it('returns 200 when Postgres and Redis are reachable', async () => {
    const res = await request(app).get('/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { status: 'ready', db: 'ok', redis: 'ok' },
    });
  });

  it('returns 503 NOT_READY when the database check fails', async () => {
    jest
      .spyOn(prisma, '$queryRaw')
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED db:5432'));
    const error = jest.spyOn(logger, 'error');

    const res = await request(app).get('/ready');
    const body = res.body as ErrorResponse;

    expect(res.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.message).toBe('Service not ready');
    expect(body.code).toBe('NOT_READY');
    // Outside production the body carries the AppError's own stack, never the driver error.
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(error).toHaveBeenCalledWith(
      { db: 'connect ECONNREFUSED db:5432', redis: 'ok' },
      'readiness check failed',
    );
  });

  it('returns 503 NOT_READY when the Redis check fails', async () => {
    jest.spyOn(redis, 'ping').mockRejectedValueOnce(new Error('Connection is closed.'));
    const error = jest.spyOn(logger, 'error');

    const res = await request(app).get('/ready');
    const body = res.body as ErrorResponse;

    expect(res.status).toBe(503);
    expect(body.code).toBe('NOT_READY');
    expect(error).toHaveBeenCalledWith(
      { db: 'ok', redis: 'Connection is closed.' },
      'readiness check failed',
    );
  });

  it('logs a non-Error rejection as a string', async () => {
    jest.spyOn(redis, 'ping').mockRejectedValueOnce('socket hang up');
    const error = jest.spyOn(logger, 'error');

    const res = await request(app).get('/ready');

    expect(res.status).toBe(503);
    expect(error).toHaveBeenCalledWith(
      { db: 'ok', redis: 'socket hang up' },
      'readiness check failed',
    );
  });
});

// ADR-005 §5: the 2s cap, tested on fake timers instead of a real hanging dependency.
describe('withTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects when the check does not settle in time', async () => {
    const pending = withTimeout(new Promise<never>(() => undefined), 2000, 'db');
    jest.advanceTimersByTime(2000);

    await expect(pending).rejects.toThrow('db timed out after 2000ms');
  });

  it("resolves with the check's value and clears its timer", async () => {
    await expect(withTimeout(Promise.resolve('PONG'), 2000, 'redis')).resolves.toBe('PONG');
    expect(jest.getTimerCount()).toBe(0);
  });

  it("passes the check's own rejection through and clears its timer", async () => {
    const failure = new Error('Connection is closed.');

    await expect(withTimeout(Promise.reject(failure), 2000, 'redis')).rejects.toBe(failure);
    expect(jest.getTimerCount()).toBe(0);
  });
});
