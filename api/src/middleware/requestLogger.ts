import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger, LevelWithSilent } from 'pino';
import pinoHttp, { type HttpLogger } from 'pino-http';
import { logger } from '../lib/logger';

// Nginx's $request_id is 32 hex chars (ADR-002). Anything else is replaced, so an
// oversized or newline-laden header can never be written into the logs.
const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

function requestId(req: IncomingMessage, res: ServerResponse): string {
  const inbound = req.headers['x-request-id'];
  const id = typeof inbound === 'string' && REQUEST_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

// pino-http 9 never passes an error here; res.err is how a handler flags one.
function levelFor(_req: IncomingMessage, res: ServerResponse): LevelWithSilent {
  if (res.err || res.statusCode >= 500) return 'error';
  if (res.statusCode >= 400) return 'warn';
  return 'info';
}

// NFR-8, ARCH §10: one JSON line per request with its ID, method, URL, status and
// responseTime. Bodies are not logged; headers pass through the base logger's redaction.
export function createRequestLogger(base: Logger): HttpLogger {
  return pinoHttp({ logger: base, genReqId: requestId, customLogLevel: levelFor });
}

export const requestLogger: HttpLogger = createRequestLogger(logger);
