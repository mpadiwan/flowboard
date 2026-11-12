# Retro: week-02 complete, Redis, worker, auth hardening, test suite

## What changed

- **Ownership-check vs write race** (open since day-02): `rethrowGone(message, code)` in `lib/ownership.ts` turns a Prisma P2025 on the write into the resource's own 404. It's used at the three check-then-write sites: PATCH and DELETE `/tasks/:id` (`TASK_NOT_FOUND`) and DELETE `/boards/:id` (`BOARD_NOT_FOUND`). Any other error is rethrown unchanged. A failed write still publishes no event. ARCH §7 documents it.
- **Coverage gaps closed:**
  - api `config/env.ts` exit path: `tests/env.test.ts` loads the module in an isolated registry with a short `JWT_ACCESS_SECRET` and asserts the stderr message and `exit(1)`.
  - api `rateLimiter.ts:15`: a direct call with no `req.ip` lands in `rate:auth:unknown`.
  - worker `consumer.ts:42` (a non-Error failure is recorded as its string form in the DLQ) and `:80` (XPENDING no longer lists the entry, so it stays pending).
- **Test helper:** `prismaError(code)` moved from `errors.test.ts` to `helpers/factories.ts`, so the race tests in `tasks.test.ts` and `boards.test.ts` share it.
- **Dev Redis is durable:** AOF on a `redisdata` volume in `docker-compose.yml`. The stream, `audit-group` and refresh keys survive a recreate. The test stack stays ephemeral.
- **Tooling:**
  - `.husky/pre-push` runs `npm --prefix worker test`.
  - The graphify `PostToolUse` hook calls `$HOME/.local/bin/graphify`, so it no longer no-ops.
  - README documents the `tsx watch` restart on macOS and that `down -v` now also drops Redis.

## Non-obvious constraints found

1. **`require()` fails lint and `import()` fails Jest.** `@typescript-eslint/no-require-imports` rejects `require` in tests. ts-jest keeps a dynamic `import()` as-is, which Jest refuses without `--experimental-vm-modules`. `jest.requireActual` inside `jest.isolateModules` loads a fresh copy through Jest's own registry and passes both.
2. **The env test must restore `process.env` before asserting.** `jest.replaceProperty` swaps the whole object; it is restored in a `finally` so a failed assertion can't leak a bad secret into later tests in the file.
3. **A PrismaPromise accepts `.catch`.** `prisma.task.update(...).catch(rethrowGone(...))` keeps the `Task` type, because the handler returns `never`.

## Verified

- **Brief's command:** `docker compose -f docker-compose.test.yml exec api npx jest` passes 163 tests in 9 suites, with 99.73% lines and 98.52% branches (threshold 80/80). Before: 157 tests, 98.67% / 95.38%.
- **Worker:** `npm --prefix worker test` passes 18 tests, with 96.03% lines and 89.47% branches (before: 78.94%). `consumer.ts` is at 100%.
- **Checks:** `npm run typecheck`, `npm run lint` and `prettier --check .` are clean.
- **Graph:** `rethrowGone()` is called by `updateTask`, `deleteTask` and `deleteBoard` only, matching the plan. The repaired hook had already put it in the graph during APPLY.
- **Live, dev stack through Nginx:** 48 of 48 checks pass. The api and worker were restarted first, so the new code was running.

| Milestone          | Checked live                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `day-01`           | Unknown route returns `404 ROUTE_NOT_FOUND` through the global handler; malformed JSON returns 400                                                                          |
| `day-02`           | Task create, PATCH, list by `boardId`, delete; missing title, empty PATCH and bad UUID return 422 with `details`; `isAdmin` is stripped                                     |
| `day-03`           | `prisma migrate status`: 1 migration, schema up to date. The seed reruns cleanly and `dev@flowboard.test` exists once                                                       |
| `day-04`           | Board create and get; another user's board returns 403, and creating a task on it returns 403                                                                               |
| `week-01 complete` | Register 201 (no password in the body), duplicate 409, wrong password 401, login 200; `/boards`, `/tasks` and `/audit-logs` return 401 without a token                      |
| `day-06`           | The 101st login from one IP returns `429 RATE_LIMIT_EXCEEDED`. With Redis stopped, login fails open (422, not 5xx)                                                          |
| `day-07`           | Refresh 200 with a new token, replay of the old one 401, logout 204, refresh after logout 401. With Redis stopped, refresh fails closed (503)                               |
| `day-08`           | 3 events, then 3 AuditLog rows newest first (`DELETED,UPDATED,CREATED`), invisible to another user; `limit=101` returns 422; XPENDING is 0                                  |
| `day-08` DLQ       | An event with an unknown `userId` reached `tasks:events:dlq` after about 60s with `deliveries 3`, the right `originalId` and all 9 AGENTS.md fields; the original was acked |
| `day-09`           | Covered by the two suites above                                                                                                                                             |
| week-02 gap        | `docker compose up -d --force-recreate redis` kept the stream length, `audit-group` and a refresh key (refresh still returned 200)                                          |

- **Hooks:** `sh .husky/pre-push` runs the worker suite (18 pass, exit 0).
- **Cleanup:** the run filled this machine's `rate:auth:*` bucket, which I deleted afterwards. The `e2e-*@flowboard.test` users and their board are still in the dev database.

## Closed from earlier backlogs

| Item                                                        | From                    | Resolution                                           |
| ----------------------------------------------------------- | ----------------------- | ---------------------------------------------------- |
| Ownership-check vs write race (P2025 → generic `NOT_FOUND`) | day-02, day-04, week-01 | `rethrowGone` at all three write sites, with tests   |
| `env.ts` failure branch untested                            | day-02                  | `tests/env.test.ts`                                  |
| `rateLimiter.ts:15` `req.ip ?? 'unknown'` uncovered         | day-06, day-09          | Direct-call unit test                                |
| ARCH §8 describes the stored refresh key ahead of time      | week-01                 | True since day-07; wording checked, no change needed |
| Redis has no volume in dev                                  | day-08                  | AOF + `redisdata` volume                             |
| Worker tests run only by hand                               | day-09                  | `.husky/pre-push`                                    |
| graphify `PostToolUse` hook is a no-op                      | day-01 … day-09         | Absolute `$HOME/.local/bin/graphify` path            |
| `tsx watch` doesn't reload on the macOS bind mount          | day-07                  | Documented: `docker compose restart api`             |

## Backlog

| Item                                                                             | Why deferred                                                                                                                                  |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Redis reconnect log noise (day-06) and each Redis 503 logged twice (day-07)      | day-13 reworks request and error logging with pino-http; fix both there.                                                                      |
| `tar` (via bcrypt's install-time node-pre-gyp) and Zod 3 advisories (OQ-8)       | Assess in day-11/12 hardening and record for the Security Gate. Zod 4 is forbidden by the brief.                                              |
| Board delete doesn't audit cascaded tasks (OQ-7)                                 | Waiting for the trainer's answer.                                                                                                             |
| Duplicate AuditLog row on a crash before `XACK`; event lost when `XADD` fails    | Accepted in ADR-006.                                                                                                                          |
| Worker `env.ts` exit path (`env.ts:25-30`) and the `development` logger branches | Same pattern as the api's, now tested there. The worker has no threshold (OQ-6).                                                              |
| api `redis.ts:17` (the `error` listener body)                                    | Only a real connection error reaches it; it will change with the day-13 log-noise fix.                                                        |
| The DLQ `error` field is Prisma's multi-line message, with leading blank lines   | It meets the AGENTS.md format (the last error message) and has no source frame. Collapsing whitespace before `XADD` is a one-liner if wanted. |
