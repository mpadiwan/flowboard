# Retro: day-13, Pino structured logging

## What changed

- `middleware/requestLogger.ts`: pino-http 9.0.0 (the last line on pino 8; pino-http 10 pulls pino 9). `genReqId` takes `X-Request-Id` only if it matches `/^[A-Za-z0-9-]{1,64}$/`, otherwise `randomUUID()`, and echoes it as the `X-Request-Id` response header. Level: `res.err` or 5xx → `error`, 4xx → `warn`, else `info`.
- `app.ts`: `requestLogger` is the first middleware, ahead of helmet, so 413s, malformed JSON and 404s are logged and timed.
- `lib/logger.ts`: options exported as `loggerOptions` so tests build the same logger on an in-memory sink. Redaction paths unchanged; pino-http's child loggers inherit them.
- `globalErrorHandler` adds `reqId: req.id`, so its stack-carrying line ties to the access line. Both are kept on purpose: one access line per request (NFR-8) and one error line with the real `err`.
- `logging.test.ts`: request ID generate / echo / replace, the access line's fields, levels 30/40/50, Authorization and body redaction. 203 tests; 99.8% lines, 98.8% branches.

## Verified live (dev stack through Nginx)

- `GET /api/boards` with a bearer token: response `X-Request-Id` equals Nginx's `request_id` in its JSON access log, and the api line shows `"authorization": "[REDACTED]"`.
- `POST /api/auth/login` with a password: neither the token nor the password appears anywhere in `docker compose logs api`.
- `grep console api/src worker/src` matches only a comment.

## Gotchas

- **Containers don't see host installs.** `api` keeps `node_modules` in an anonymous volume, so a new dependency must also be installed inside both the dev and test api containers (`docker compose [-f docker-compose.test.yml] exec api npm install`). The dev api crashed on `Cannot find module 'pino-http'` until then. The container's npm also re-adds `"dev": true` to the darwin-only `fsevents` entry in the bind-mounted lockfile; restore the host lockfile afterwards.
- **pino-http 9 never passes `err` to `customLogLevel`.** It removes an `'error'` listener it never adds, so the third argument is always undefined. Use `res.err`.
- **Child loggers own their level methods.** pino's `child()` calls `setLevel`, so the existing `jest.spyOn(logger, 'warn')` spies don't see pino-http's 4xx lines.

## Backlog

- **Access lines are verbose.** The default serializers log every request header and every response header, including helmet's full CSP. Consider `serializers` that keep `id`, `method`, `url` and `remoteAddress` for `req`, and `statusCode` for `res`. That would also shrink what redaction has to catch if a new secret-bearing header appears.
- **`npm audit`: `zod` (high, oversized constrained collections) and `tar` (critical, via bcrypt's node-pre-gyp).** Both predate day-13 and are not reachable through pino-http. The 10kb body limit bounds the zod case. Raise both at the Security Gate self-review.
