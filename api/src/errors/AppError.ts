import { Prisma } from '@prisma/client';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * An HTTP error with a status code and a stable machine-readable code.
 * Usage: throw new AppError('Task not found', 404, 'TASK_NOT_FOUND')
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

interface ValidationDetail {
  path: string;
  message: string;
}

interface ErrorBody {
  success: false;
  message: string;
  code: string;
  details?: ValidationDetail[];
  stack?: string;
}

interface HttpError {
  statusCode: number;
  body: ErrorBody;
}

// body-parser (behind express.json) attaches `type` and `status` to the errors it raises.
interface BodyParserError extends Error {
  type: string;
  status: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  if (!(err instanceof Error)) return false;
  const candidate = err as Partial<BodyParserError>;
  return typeof candidate.type === 'string' && typeof candidate.status === 'number';
}

function errorBody(message: string, code: string): ErrorBody {
  return { success: false, message, code };
}

// Mapping table: ARCH §7. The jsonwebtoken (→ 401) branch joins this function with
// week-01, when that package is added.
function toHttpError(err: unknown): HttpError {
  if (isAppError(err)) {
    return { statusCode: err.statusCode, body: errorBody(err.message, err.code) };
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    const first = details[0];
    const message = first
      ? `Validation failed: ${first.path || 'request'}: ${first.message}`
      : 'Validation failed';
    return { statusCode: 422, body: { ...errorBody(message, 'VALIDATION_ERROR'), details } };
  }

  if (isBodyParserError(err)) {
    if (err.type === 'entity.too.large') {
      return { statusCode: 413, body: errorBody('Request body too large', 'PAYLOAD_TOO_LARGE') };
    }
    if (err.type === 'entity.parse.failed') {
      return { statusCode: 400, body: errorBody('Malformed JSON in request body', 'INVALID_JSON') };
    }
    if (err.status < 500) {
      return { statusCode: err.status, body: errorBody(err.message, 'INVALID_REQUEST_BODY') };
    }
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2025: the record to update or delete no longer exists. P2002: unique constraint.
    if (err.code === 'P2025') {
      return { statusCode: 404, body: errorBody('Resource not found', 'NOT_FOUND') };
    }
    if (err.code === 'P2002') {
      return { statusCode: 409, body: errorBody('Resource already exists', 'CONFLICT') };
    }
  }

  const message =
    env.NODE_ENV !== 'production' && err instanceof Error ? err.message : 'Internal server error';
  return { statusCode: 500, body: errorBody(message, 'INTERNAL_ERROR') };
}

/** Turns any unmatched route into a 404 handled by globalErrorHandler. */
export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(`Route ${req.method} ${req.path} not found`, 404, 'ROUTE_NOT_FOUND'));
};

/**
 * The last middleware in app.ts. Every error reaches the client in the standard shape
 * { success: false, message, code }; stack traces are never sent in production.
 */
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const { statusCode, body } = toHttpError(err);

  if (statusCode >= 500) {
    logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
    if (env.NODE_ENV !== 'production' && err instanceof Error) {
      body.stack = err.stack;
    }
  } else {
    logger.debug(
      { code: body.code, statusCode, method: req.method, url: req.originalUrl },
      body.message,
    );
  }

  res.status(statusCode).json(body);
}
