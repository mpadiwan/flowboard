import express, { type Express, type Request, type Response } from 'express';
import pino from 'pino';
import request from 'supertest';
import app from '../src/app';
import { loggerOptions } from '../src/lib/logger';
import { createRequestLogger } from '../src/middleware/requestLogger';

// NFR-8, ARCH §10. LOG_LEVEL is silent under test, so the log lines are checked on a
// logger built from the same options but writing to an in-memory sink.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.secret-access-token.sig';

interface LogLine {
  level: number;
  msg: string;
  req: { id: string; method: string; url: string; headers: Record<string, string> };
  res: { statusCode: number };
  responseTime: number;
}

interface Capture {
  lines: string[];
  logger: pino.Logger;
}

function capture(): Capture {
  const lines: string[] = [];
  const logger = pino({ ...loggerOptions, level: 'info' }, { write: (msg) => lines.push(msg) });
  return { lines, logger };
}

function parsed(lines: string[]): LogLine[] {
  return lines.map((line) => JSON.parse(line) as LogLine);
}

function appLogging(logger: pino.Logger): Express {
  const testApp = express();
  testApp.use(createRequestLogger(logger));
  testApp.get('/ok', (_req: Request, res: Response) => {
    res.json({ success: true });
  });
  testApp.get('/missing', (_req: Request, res: Response) => {
    res.status(404).json({ success: false });
  });
  testApp.get('/broken', (_req: Request, res: Response) => {
    res.status(500).json({ success: false });
  });
  testApp.get('/flagged', (_req: Request, res: Response) => {
    res.err = new Error('handled but flagged');
    res.json({ success: true });
  });
  return testApp;
}

describe('X-Request-Id', () => {
  it('generates a UUID when the request has none', async () => {
    const res = await request(app).get('/nowhere');

    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  it("echoes Nginx's request ID", async () => {
    const id = 'a3f1c0d2e4b5968778695a4b3c2d1e0f';

    const res = await request(app).get('/nowhere').set('X-Request-Id', id);

    expect(res.headers['x-request-id']).toBe(id);
  });

  it.each([
    ['too long', 'a'.repeat(65)],
    ['not in the allowed alphabet', 'abc def"}'],
  ])('replaces an inbound ID that is %s', async (_label, id) => {
    const res = await request(app).get('/nowhere').set('X-Request-Id', id);

    expect(res.headers['x-request-id']).toMatch(UUID);
  });
});

describe('request log line', () => {
  it('logs request ID, method, URL, status and duration as JSON', async () => {
    const { lines, logger } = capture();

    const res = await request(appLogging(logger)).get('/ok?page=1');

    const [line] = parsed(lines);
    expect(lines).toHaveLength(1);
    expect(line.req.id).toBe(res.headers['x-request-id']);
    expect(line.req.method).toBe('GET');
    expect(line.req.url).toBe('/ok?page=1');
    expect(line.res.statusCode).toBe(200);
    expect(typeof line.responseTime).toBe('number');
  });

  it('redacts the Authorization header and never writes the token', async () => {
    const { lines, logger } = capture();

    await request(appLogging(logger)).get('/ok').set('Authorization', `Bearer ${TOKEN}`);

    expect(parsed(lines)[0].req.headers.authorization).toBe('[REDACTED]');
    expect(lines.join('')).not.toContain(TOKEN);
  });

  it.each([
    ['/ok', 30],
    ['/missing', 40],
    ['/broken', 50],
    ['/flagged', 50],
  ])('logs %s at level %d', async (path, level) => {
    const { lines, logger } = capture();

    await request(appLogging(logger)).get(path);

    expect(parsed(lines)[0].level).toBe(level);
  });
});

describe('redaction paths', () => {
  it('censors passwords and tokens in logged objects', () => {
    const { lines, logger } = capture();

    logger.info({ req: { body: { password: 'hunter2hunter2', refreshToken: TOKEN } } }, 'body');
    logger.info({ user: { password: 'hunter2hunter2', accessToken: TOKEN } }, 'nested');

    const [body, nested] = lines.map(
      (line) => JSON.parse(line) as { req?: { body: object }; user?: object },
    );
    expect(body.req?.body).toEqual({ password: '[REDACTED]', refreshToken: '[REDACTED]' });
    expect(nested.user).toEqual({ password: '[REDACTED]', accessToken: '[REDACTED]' });
    expect(lines.join('')).not.toMatch(/hunter2|secret-access-token/);
  });
});
