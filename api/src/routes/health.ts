import { Router, type NextFunction, type Request, type Response } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

// FR-H1, FR-H2, ARCH §10. Public probes (ARCH §12 rule 1): no authenticate, no rate limit.

// ADR-005 §5: a dependency that hangs must not hang the probe.
const READY_TIMEOUT_MS = 2000;

// Rejects if the check has not settled within ms. The timer is always cleared, so no
// timeout outlives the request.
export async function withTimeout<T>(check: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([check, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// pino serializes an Error only under `err`; under any other key it would log as {}.
function checkResult(result: PromiseSettledResult<unknown>): string {
  if (result.status === 'fulfilled') {
    return 'ok';
  }
  return result.reason instanceof Error ? result.reason.message : String(result.reason);
}

// Liveness only: no dependency checks, so a Postgres or Redis outage never fails it.
export const health = (_req: Request, res: Response): void => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
};

// Both checks run in parallel. allSettled, not all, so the log names every failing
// dependency; the 503 body stays generic.
export const ready = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [db, cache] = await Promise.allSettled([
      // ARCH §12 rule 4: the only raw SQL in src/.
      withTimeout(prisma.$queryRaw`SELECT 1`, READY_TIMEOUT_MS, 'db'),
      withTimeout(redis.ping(), READY_TIMEOUT_MS, 'redis'),
    ]);
    if (db.status === 'rejected' || cache.status === 'rejected') {
      logger.error({ db: checkResult(db), redis: checkResult(cache) }, 'readiness check failed');
      throw new AppError('Service not ready', 503, 'NOT_READY');
    }
    res.json({ success: true, data: { status: 'ready', db: 'ok', redis: 'ok' } });
  } catch (err) {
    next(err);
  }
};

const router: Router = Router();

router.get('/health', health);
router.get('/ready', ready);

export default router;
