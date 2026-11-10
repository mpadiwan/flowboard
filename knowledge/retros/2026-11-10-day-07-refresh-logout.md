# Retro: day-07, refresh token rotation and logout

## What changed

- `lib/tokens.ts`: `signAccessToken` / `signRefreshToken` (sync, pure), async `issueTokenPair` that `SET refresh:{sub}:{jti} 1 EX JWT_REFRESH_TTL_SECONDS`, `verifyRefresh` (any JWT failure → 401 `INVALID_REFRESH_TOKEN`), `consumeRefresh` (one `DEL`, its result is the replay check). A private `withRedis` turns any Redis rejection into 503 `SERVICE_UNAVAILABLE` (fail closed, ADR-005).
- `POST /auth/refresh` and `POST /auth/logout` (FR-A3, FR-A4), not rate limited. Register and login now fail with 503 if the refresh key can't be stored, instead of issuing a token that could never be refreshed.
- Test factories sign tokens directly, so `bearer()` stays sync and the boards/tasks tests didn't change.
- ARCH §7 note on the refresh error code and the 503; OQ-9 (expired token at logout → 401).

## Verified live (dev stack through Nginx)

- `redis-cli TTL refresh:<userId>:<jti>` → 604799 right after register (AC-5.2).
- Refresh 200 (AC-2.3); replay 401 `INVALID_REFRESH_TOKEN` (AC-2.4); logout 204, refresh afterwards 401, second logout 204 (AC-2.5).
- `docker compose stop redis`: refresh and logout return 503 `SERVICE_UNAVAILABLE`; the api stays up. No token appears in the api logs.
- Jest: 143/143, 98% lines, 95% branches; `tokens.ts` 100/100. Two concurrent refreshes with one token: exactly one 200.

## Backlog

- **Each 503 is logged twice at ERROR:** `withRedis` logs the Redis cause, then `globalErrorHandler` logs the `AppError` as "Unhandled error" (every 5xx). Pass the cause along (`new AppError(...)` with `{ cause }`, or a `cause` field the handler logs) and drop the first log line. Revisit with pino-http in day-13.
- **`tsx watch` doesn't reload the dev api** for edits on the macOS bind mount: the new routes returned 404 until `docker compose restart api`. Try polling (`CHOKIDAR_USEPOLLING=true` or tsx's `--poll` equivalent), or document the restart.
- **Mistake caught by tests:** the 503 assertions used `toEqual` and failed on the dev-only `stack` field. Rule added to `knowledge/rules/coding-standards.md`.
- **Deviation from the plan:** no `issuePair()` factory; tests import `issueTokenPair` directly, since the helper would only have passed the call through.
- `routes/auth.ts:37` (register rethrow for a non-P2002 Prisma error) is still uncovered. It was uncovered before day-07; pick it up in day-09.
