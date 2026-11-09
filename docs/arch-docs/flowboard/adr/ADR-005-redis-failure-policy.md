# ADR-005: Redis client settings and failure policy

- **Status:** Accepted
- **Date:** 2026-11-09
- **Epic:** EPIC-REDIS, EPIC-OBSERVABILITY

## Context

The brief says a Redis failure in the rate limiter must be "handled gracefully". The API must not crash or block all traffic. It also requires `/ready` to return 503 when Redis is down. The handbook's example code breaks both requirements:

1. **Port fallback never applies:** `Number(process.env.REDIS_PORT) ?? 6379` never falls back, because `Number(undefined)` is `NaN`, and `??` only replaces `null` or `undefined`.
2. **Commands hang while Redis is down:** by default ioredis queues commands while disconnected. The rate limiter and `/ready` then hang instead of failing.
3. **Async throws are lost:** the rate limiter throws inside an `async` middleware, and Express 4 doesn't catch that. The result is an unhandled rejection and a request that never gets a response.
4. **A counter can lose its expiry:** a separate `INCR` followed by `EXPIRE` can leave a key with no TTL if the process dies in between.

## Decision

1. **Typed env values:** env values are parsed with `z.coerce.number().default(6379)` in `config/env.ts`. Nothing else reads `process.env`.
2. **Client options:** `enableOfflineQueue: false, maxRetriesPerRequest: 1`. Commands reject quickly while Redis is down, and ioredis keeps reconnecting in the background.
3. **Rate limiter:**
   ```ts
   try {
     const [[, count]] = await redis.multi().incr(key).expire(key, WINDOW, 'NX').exec();
     if (count > MAX) return next(new AppError('Too many requests', 429, 'RATE_LIMIT_EXCEEDED'));
     return next();
   } catch (err) {
     logger.warn({ err }, 'rate limiter unavailable — failing open');
     return next();
   }
   ```
   - **Atomic:** `MULTI` sends both commands as one unit, and `EXPIRE … NX` only sets the TTL on the first hit.
   - **Response headers:** the limiter sets `RateLimit-Limit`, `RateLimit-Remaining` and `Retry-After` (on 429).
4. **Failure policy for each Redis use:**

   | Use                | Policy                               | Reason                                                                               |
   | ------------------ | ------------------------------------ | ------------------------------------------------------------------------------------ |
   | Rate limiter       | Fail **open** (log `warn`, continue) | A cache outage must not lock every user out. Bcrypt cost 12 still slows brute force. |
   | Login lockout      | Fail **open**                        | Same reason.                                                                         |
   | Refresh / logout   | Fail **closed** (503)                | Skipping the revocation check would let a revoked token through.                     |
   | `publishTaskEvent` | Log `error`, still return 2xx        | The task change is already committed ([ADR-006](ADR-006-async-audit-worker.md)).     |
   | `/ready`           | 503 `NOT_READY`                      | That is its purpose.                                                                 |

5. **Readiness timeouts:** `/ready` wraps each check in a 2s timeout (`Promise.race`), so a dependency that hangs can't hang the probe.

## Consequences

- **Rate limits lapse during an outage:** while Redis is down, rate limiting is effectively off. The `warn` logs make this visible.
- **Test needed:** the brief requires a test for the fail-open path. Mock `redis.multi` to throw, then expect the request to go through.

## Security Gate one-liner

> "If Redis dies, the rate limiter logs and lets traffic through, because availability beats a cache. Refresh fails closed, because skipping the revocation check is a security hole. The client is set to fail fast instead of queueing, so nothing hangs."
