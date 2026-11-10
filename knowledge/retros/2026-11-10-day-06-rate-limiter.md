# Retro: day-06, Redis client and rate limiter

## What changed

- `lib/redis.ts` (ioredis 5.11.1, `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, `error` listener on the logger).
- `middleware/rateLimiter.ts`: `MULTI INCR; EXPIRE NX; TTL` on `rate:auth:{ip}`; RateLimit-Limit/Remaining headers, Retry-After on 429; fails open with a `warn`.
- Attached to `/auth/register` and `/auth/login`. `trust proxy` = 1 pulled forward from day-11 (ADR-002), because the limiter is the first reader of `req.ip`.

## Verified live (dev stack through Nginx)

- `rate:auth:<client ip>` has TTL 900 in redis-cli (AC-5.1); the 101st request gets 429 with `Retry-After`.
- A spoofed `X-Forwarded-For: 1.2.3.4` is ignored: the key stays the real client IP.
- `docker compose stop redis`: login and register still answer in about 5 ms (422 or 201), the api stays up, and it logs `failing open`. After `start redis` the limiter enforces again.

## Backlog

- **Reconnect log noise:** while Redis is down, the `error` listener logs at ERROR on every reconnect attempt (8 lines in about 3 s, then about one every 2 s). Consider logging only on a state change (`end`/`ready`), or throttling.
- **Uncovered `req.ip ?? 'unknown'` branch** (rateLimiter.ts:15, 83% branches on the file). Only reachable without a socket address; all such clients would share one `rate:auth:unknown` bucket. Leave it, or test it in day-09.
- **The graphify PostToolUse hook doesn't fire:** `.claude/settings.json` calls bare `graphify`, which is not on the hook's PATH (`~/.local/bin`), and `|| true` hides the failure. The graph was a day stale until a manual `~/.local/bin/graphify update .`. Use the absolute path in the hook.
- The brief §5.5 "failed login rate limit … 429 after N attempts" item is the per-email lockout (`ACCOUNT_LOCKED`), which is day-12. Today's per-IP 429 covers only part of it.
