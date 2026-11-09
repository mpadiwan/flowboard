import { Prisma } from '@prisma/client';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { z } from 'zod';
import app from '../src/app';
import { env } from '../src/config/env';
import { AppError, globalErrorHandler, isAppError } from '../src/errors/AppError';

// The globalErrorHandler mapping table (ARCH §7). Each case throws one error type
// from a throwaway route and checks the response shape.

interface ErrorResponse {
  success: false;
  message: string;
  code: string;
  details?: { path: string; message: string }[];
  stack?: string;
}

function appThrowing(err: unknown): Express {
  const testApp = express();
  testApp.get('/boom', (_req: Request, _res: Response, next: NextFunction) => {
    next(err);
  });
  testApp.use(globalErrorHandler);
  return testApp;
}

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Prisma failure', {
    code,
    clientVersion: Prisma.prismaVersion.client,
  });
}

describe('globalErrorHandler', () => {
  it('maps an AppError to its own status and code', async () => {
    const res = await request(
      appThrowing(new AppError('Task not found', 404, 'TASK_NOT_FOUND')),
    ).get('/boom');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Task not found', code: 'TASK_NOT_FOUND' });
  });

  it('defaults an AppError to 500 INTERNAL_ERROR', () => {
    const err = new AppError('Something broke');

    expect(isAppError(err)).toBe(true);
    expect(err).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' });
    expect(isAppError(new Error('plain'))).toBe(false);
  });

  it('maps a ZodError to 422 VALIDATION_ERROR with details', async () => {
    const result = z.object({ title: z.string() }).safeParse({});
    const res = await request(appThrowing(result.error)).get('/boom');

    expect(res.status).toBe(422);
    const body = res.body as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Validation failed: title: Required');
    expect(body.details).toEqual([{ path: 'title', message: 'Required' }]);
  });

  it('maps a ZodError with no issues to a generic validation message', async () => {
    const res = await request(appThrowing(new z.ZodError([]))).get('/boom');

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).message).toBe('Validation failed');
  });

  it('maps Prisma P2025 to 404 NOT_FOUND', async () => {
    const res = await request(appThrowing(prismaError('P2025'))).get('/boom');

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('NOT_FOUND');
  });

  it('maps Prisma P2002 to 409 CONFLICT', async () => {
    const res = await request(appThrowing(prismaError('P2002'))).get('/boom');

    expect(res.status).toBe(409);
    expect((res.body as ErrorResponse).code).toBe('CONFLICT');
  });

  it('maps any other Prisma error to 500', async () => {
    const res = await request(appThrowing(prismaError('P2003'))).get('/boom');

    expect(res.status).toBe(500);
    expect((res.body as ErrorResponse).code).toBe('INTERNAL_ERROR');
  });

  it('maps an unknown error to 500 and includes the stack outside production', async () => {
    const res = await request(appThrowing(new Error('db exploded'))).get('/boom');

    expect(res.status).toBe(500);
    const body = res.body as ErrorResponse;
    expect(body).toMatchObject({ code: 'INTERNAL_ERROR', message: 'db exploded' });
    expect(body.stack).toBeDefined();
  });

  it('maps a thrown non-Error value to a generic 500', async () => {
    const res = await request(appThrowing('a string')).get('/boom');

    expect(res.status).toBe(500);
    expect((res.body as ErrorResponse).message).toBe('Internal server error');
  });

  it('never sends a stack or the real message in production (NFR-7)', async () => {
    const replaced = jest.replaceProperty(env, 'NODE_ENV', 'production');
    try {
      const res = await request(appThrowing(new Error('secret detail'))).get('/boom');

      expect(res.status).toBe(500);
      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Internal server error');
      expect(body).not.toHaveProperty('stack');
    } finally {
      replaced.restore();
    }
  });

  // Called directly: over HTTP, Express's fallback handler would abort the socket.
  it('delegates to Express when headers were already sent', () => {
    const err = new Error('too late');
    const status = jest.fn();
    const res = { headersSent: true, status } as unknown as Response;
    const next = jest.fn();

    globalErrorHandler(err, {} as Request, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(status).not.toHaveBeenCalled();
  });
});

describe('body-parser errors', () => {
  // express.json's default 100kb limit applies until day-11 lowers it to 10kb.
  it('maps an oversized body to 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'a'.repeat(200 * 1024) });

    expect(res.status).toBe(413);
    expect((res.body as ErrorResponse).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('maps an unsupported charset to its own 4xx status', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{}');

    expect(res.status).toBe(415);
    expect((res.body as ErrorResponse).code).toBe('INVALID_REQUEST_BODY');
  });
});
