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
    const userId = requireUserId(req); // 401 if the router's guard didn't set req.user
    const { id } = IdParamSchema.parse(req.params);
    const task = await getOwnedTask(id, userId); // 404 / 403 inside (lib/ownership.ts)
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
- Ownership: load, then check — 404 if missing, 403 if not the caller's (ADR-003). Use `getOwnedBoard` / `getOwnedTask` from `lib/ownership.ts`; don't re-implement the check in a handler.
- A write after an ownership check ends in `.catch(rethrowGone('Task not found', 'TASK_NOT_FOUND'))` (or the board equivalent). A concurrent delete in between gives P2025, and this keeps the resource's own 404 code instead of the generic `NOT_FOUND`.
- `req.user` is optional in the type (`types/express.d.ts`). Read it only through `requireUserId(req)`, never `req.user!.id`.

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
- Create real fixtures through helpers (`createUser()`, `createBoard()`); never fake IDs such as `'some-uuid'`.
- Protected-route tests authenticate with `request.agent(app).set('Authorization', bearer(user.id))`. `bearer()` signs a token directly, so bcrypt cost 12 stays in `auth.test.ts` only. The 401 cases use a bare `request(app)` and `rejectedAuthHeaders()`.
- To prove a write is atomic, make its second step fail with `jest.spyOn(module, 'fn').mockRejectedValueOnce(...)` on the imported module namespace, then assert the first write isn't there.
- Mock only to reach failure branches (Redis throwing, Prisma rejecting) — never to skip real behaviour on the happy path.
- Every test starts from an empty Redis too (`redis.flushdb()` in `afterEnv.ts`), and `beforeAll` waits for `redis.status === 'ready'`. With `enableOfflineQueue: false`, commands sent while the client is still connecting reject, and the fail-open limiter would let a request through without counting it, so a test could pass for the wrong reason.
- Rate-limit tests pin the client IP with `X-Forwarded-For` (trust proxy = 1 uses the last entry), so the `rate:auth:{ip}` key is predictable and two IPs can be compared. Send `{}` bodies so allowed requests stop at Zod with a 422 and skip bcrypt.
- Assert 4xx bodies with `toEqual`, but 5xx bodies with `toMatchObject`: outside production `globalErrorHandler` adds `stack` to every 5xx body (NFR-7), so `toEqual` fails in the test stack.
- Worker tests (`worker/tests/`) are unit tests: `jest.mock` replaces `lib/redis` and `lib/prisma` with plain `jest.fn()` objects, and `tests/setup/env.ts` sets placeholder env in `setupFiles`, before `config/env.ts` loads. The worker isn't in the test stack (ADR-008 #7, OQ-6).
- Reach a `jest.mock` factory's functions through a cast (`redis as unknown as { xack: jest.Mock }`), not `jest.mocked(redis.xack)`. `jest.mocked` on a method trips `@typescript-eslint/unbound-method`, and ioredis overloads its stream commands, so the typed mock picks the wrong overload.
- Assert command order with `mock.invocationCallOrder` when order is the contract: row before `XACK`, DLQ `XADD` before `XACK`.
- `expect.stringMatching()` returns `any`; cast it (`as string`) where it's a spread argument, or `no-unsafe-argument` fails lint.
- Refresh and logout tests take a stored pair from `issueTokenPair(user.id)` after `createUser()`, not from register/login, so only the tests about those two routes pay bcrypt cost 12. To reach a fail-closed branch, `jest.spyOn(redis, 'set' | 'del').mockRejectedValueOnce(...)`, then assert the key is untouched.
- `expect.any()` / `expect.objectContaining()` return `any` and trip `no-unsafe-assignment`. To assert a logger call, read `spy.mock.calls[0]` with an `as unknown as [...]` tuple cast instead.
- To test code that runs at import (`config/env.ts`), load a fresh copy with `jest.requireActual(path)` inside `jest.isolateModules`. `require()` fails `no-require-imports`, and ts-jest leaves `import()` as a real dynamic import that Jest rejects without `--experimental-vm-modules`. Swap env with `jest.replaceProperty(process, 'env', …)` and restore it in a `finally`; stub `process.exit` to throw.

## Dependencies

- Pin exact versions (no `^`/`~`), stay on the brief's major versions, and commit lockfiles.
- New runtime dependencies need a reason in the PR/commit body.
- After `package.json` changes, recreate the containers with `docker compose [-f docker-compose.test.yml] up -d --build --renew-anon-volumes`. `/app/node_modules` is an anonymous volume, so `--build` alone keeps the old modules ("Cannot find module").
- The worker's Prisma client comes from `api/prisma/schema.prisma`: run `npm run prisma:generate` in `worker/` after a schema change (the image does it at build). The script copies the schema into the git-ignored `worker/prisma/` first, because Prisma resolves `@prisma/client` from the schema's folder and would otherwise generate into `api/node_modules`.

## Worker and streams (from day-08)

- Parse every Redis Stream reply and entry with Zod. ioredis types `XREADGROUP`, `XAUTOCLAIM` and `XPENDING` replies loosely, and stream fields are untrusted input like a request body.
- `XACK` only after the handler's write succeeds. A failure leaves the message pending for `XAUTOCLAIM`; never ack on error.
- The consumer loop must survive Redis: log, pause, retry. A `NOGROUP` error means Redis lost its data, so the loop recreates `audit-group` from `0` (startup still uses `$`, ADR-006).
- Anything persisted from an error (the DLQ's `error` field) uses Prisma's `errorFormat: 'minimal'`, so no source excerpts end up in Redis or the logs.
