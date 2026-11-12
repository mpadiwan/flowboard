# Retro: day-14, health checks and DLQ documentation

## What changed

- `routes/health.ts`: `GET /health` returns `{ status: 'ok', uptime }` with no dependency checks (FR-H1). `GET /ready` runs Prisma `SELECT 1` and Redis `PING` in parallel, each capped at 2s by `withTimeout` (ADR-005 §5). If both pass it returns `{ status: 'ready', db: 'ok', redis: 'ok' }`, otherwise `503 NOT_READY` through `AppError` (FR-H2). Both routes are public and not rate limited.
- `Promise.allSettled`, not `Promise.all`, so the `readiness check failed` log names every failing dependency. The 503 body stays generic: no hostnames, ports or driver messages.
- `withTimeout` clears its timer in `finally`, so no 2s timer outlives a probe. Without that, each `/ready` call would leave one behind and Jest would report an open handle.
- `app.ts`: the health router is mounted at the root after helmet, CORS and the body parser, and before the feature routers. Probes get the access line and the security headers, and the 503 goes through `globalErrorHandler`.
- `health.test.ts`: `/health` 200, `/ready` 200, `/ready` 503 with `$queryRaw` or `ping` mocked to reject, and the log shape. `withTimeout` is tested on fake timers (rejects at 2000ms, clears its timer on resolve and on reject), so the suite never waits 2s.
- AGENTS.md: the day-13 / day-14 line is ticked. Its DLQ section already matched `worker/src/consumer.ts` (`moveToDlq`) and `worker/src/events.ts` (the key), which covers AC-6.6. No content change.

## Verified live (dev stack through Nginx)

| Action                       | `GET /api/ready`                 | Logged reason                                                             |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| all up                       | 200 `ready`, `db: ok, redis: ok` | —                                                                         |
| `docker compose stop db`     | 503 `NOT_READY` in 0.01s         | `db: "… Can't reach database server at db:5432"`                          |
| `docker compose start db`    | 200                              | —                                                                         |
| `docker compose stop redis`  | 503 `NOT_READY` in 0.006s        | `redis: "Stream isn't writeable and enableOfflineQueue options is false"` |
| `docker compose start redis` | 200                              | —                                                                         |
| `docker compose pause db`    | 503 `NOT_READY` in **2.01s**     | `db: "db timed out after 2000ms"`                                         |
| `docker compose unpause db`  | 200                              | —                                                                         |

- `/api/health` stayed 200 throughout. The 503 body never carried a driver message or hostname.
- **A stopped container fails fast, and a paused one hangs.** `stop` removes the hostname, so Prisma fails at once. Only `pause` exercises the 2s cap, which is the case ADR-005 §5 guards against.

## Gotchas

- **pino serializes an `Error` only under `err`.** Under any other key, such as `{ db: err }`, it logs `{}`. `/ready` logs each check's message string instead, as the worker's `errorMessage` does. This rule is now in `knowledge/rules/coding-standards.md` § Logging.
- **Error bodies are not exact outside production.** In `NODE_ENV=test`, a 5xx body also carries the AppError's `stack`, so a `toEqual` on the whole body fails. Assert the fields one by one. The production no-stack case belongs to `security.test.ts`.
- **`expect.any()` trips `no-unsafe-assignment`** (coding-standards § Tests already says so). Cast `res.body` to a response interface and assert its fields.

## Backlog

- **Probe noise.** Every `/health` and `/ready` call writes an info access line. Under a real orchestrator polling every few seconds, consider pino-http `autoLogging.ignore` for the probe paths.
- **A deliberate 503 is logged as "Unhandled error".** `globalErrorHandler` logs every 5xx with that label and a stack, so a failed probe writes three error-level lines: `readiness check failed`, `Unhandled error`, and the 503 access line. The same applies to refresh and logout's fail-closed 503. Consider logging a 5xx `AppError` with its own message and no stack. That is a change to `globalErrorHandler`, so it is out of day-14 scope; raise it at the Security Gate self-review.
- **No Compose healthcheck on `api`.** One could `curl` `/ready`, but nothing depends on `api` being healthy (Nginx proxies lazily), so it was left out of scope.
