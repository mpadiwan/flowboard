# Coding Standards

_The detail behind the rules in [AGENTS.md](../../AGENTS.md). Each rule cites the decision that produced it; when a rule changes, change the ADR first._

## Files and naming

| Thing                      | Convention                             | Example                                 |
| -------------------------- | -------------------------------------- | --------------------------------------- |
| Source files               | camelCase, one concern per file        | `rateLimiter.ts`, `taskUpdated.ts`      |
| Classes, interfaces, types | PascalCase                             | `AppError`, `TaskEvent`                 |
| Zod schemas                | PascalCase + `Schema`                  | `CreateTaskSchema`, `IdParamSchema`     |
| Inferred types             | schema name without `Schema` + `Input` | `CreateTaskInput`                       |
| Functions, variables       | camelCase                              | `publishTaskEvent`, `getOwnedTask`      |
| Constants                  | UPPER_SNAKE_CASE                       | `WINDOW_SECONDS`                        |
| Error codes                | UPPER_SNAKE_CASE                       | `TASK_NOT_FOUND`, `RATE_LIMIT_EXCEEDED` |
| Redis keys                 | colon-separated, lowercase (ARCH §9.2) | `refresh:{userId}:{jti}`                |

- Routes: one file per resource in `api/src/routes/`, exporting an Express `Router`. Mounted at the root in `app.ts` (Nginx strips `/api`, ADR-002).
- Shared clients (Prisma, Redis, logger) are singletons in `src/lib/` and exported by name: `import { logger } from '../lib/logger'`.
- `app.ts` builds the app; `server.ts` is the only file that calls `listen()`.

## Configuration

- Only `src/config/env.ts` reads `process.env`. It parses with Zod, applies defaults, and exits with a clear message on invalid config.
- Numbers come from `z.coerce.number()`, never `Number(x) ?? default` (`Number(undefined)` is `NaN`, ADR-005).
- A new variable goes into the env schema, `.env.example` (with a comment) and ARCH §11.3 in the same commit.

## Route handlers

```ts
export const getTask = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const task = await getOwnedTask(id, req.user.id); // 404 / 403 inside
    res.json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
};
```

- Parse `params`, `query` and `body` with Zod first; use only the parsed values (ADR-007).
- Build Prisma `data` from named fields of the parsed object. Never `...req.body`.
- Success responses always use `{ success: true, data }`; `DELETE` returns `res.status(204).end()`.
- Throw `AppError` for expected failures; let unexpected errors propagate to `next(err)`.
- Ownership: load, then check — 404 if missing, 403 if not the caller's (ADR-003).

## Middleware

- Async middleware wraps its whole body in try/catch and calls `next(err)` (Express 4 does not catch async throws).
- That rule is why `no-misused-promises` (`checksVoidReturn.arguments`) is relaxed only for `src/routes/**` and `src/middleware/**`. Async code in any other folder that is passed as a callback must handle its own promise.
- Redis-backed middleware decides its failure mode explicitly per ADR-005 and logs at `warn` when failing open.

## Errors

- Only `globalErrorHandler` writes error responses. New error types get a branch in `toHttpError()` (ARCH §7) rather than ad-hoc handling in routes.
- Error codes are stable strings clients can rely on; messages are for humans.
- Production responses never include `stack`; 500s use the generic message.

## Logging

- `logger.info/warn/error/debug` only — `console.*` fails lint.
- Log objects first, message second: `logger.error({ err, taskId }, 'failed to publish task event')`.
- Never log request bodies wholesale; redaction is a safety net, not a licence.
- Levels: `error` = needs attention; `warn` = degraded but handled (e.g. fail-open); `info` = lifecycle events; `debug` = diagnostic detail.

## TypeScript

- Strict mode, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`.
- No `any` (lint error). Use `unknown` and narrow.
- Every function declares its return type (lint: `explicit-function-return-type`; inline callbacks are exempt).
- Unused parameters required by a signature (e.g. Express's `next`) are prefixed with `_`.
- Prefer `interface` for object shapes, `type` for unions and `z.infer` results.
- TypeScript outside `api/src/` (`tests/`, `prisma/`) gets its own `tsconfig.json` that extends `api/tsconfig.json` with `rootDir: ".."` and is added to `npm run typecheck`; otherwise `tsc` skips it and ESLint's `projectService` fails on it.

## Tests (from plan Day 2)

- Integration tests use Supertest against `app` (never a listening server) and a real Postgres + Redis in the `flowboard-test` Compose project (ADR-008).
- Every endpoint has at least one happy-path and one error-path test; every feature commit ships with its tests.
- Test files live in `api/tests/` with their own `tsconfig.json`; `npm run typecheck` checks them, because ts-jest only transpiles (`isolatedModules`).
- Every test starts from empty tables (`TRUNCATE … CASCADE` in `tests/setup/afterEnv.ts`), so each test creates its own fixtures in `beforeEach`.
- Create real fixtures through helpers (`registerAndLogin()`, `createBoard()`); never fake IDs such as `'some-uuid'`.
- Mock only to reach failure branches (Redis throwing, Prisma rejecting) — never to skip real behaviour on the happy path.

## Dependencies

- Pin exact versions (no `^`/`~`), stay on the brief's major versions, and commit lockfiles.
- New runtime dependencies need a reason in the PR/commit body.
