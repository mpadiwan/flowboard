# ADR-008: Integration tests against real Postgres and Redis in an isolated Compose project

- **Status:** Accepted
- **Date:** 2026-11-09
- **Epic:** EPIC-TESTING

## Context

The trainer runs `docker compose -f docker-compose.test.yml exec api npx jest` exactly as written. The brief requires a separate test database, at least 80% line and branch coverage, and a happy-path test plus an error-path test for every endpoint. Two things about that command matter:

- **Same project name:** with no `name:` in the file, Compose would use the directory name as the project name, the same as the dev stack. Services with the same names would then replace the dev containers.
- **Parallel workers:** `npx jest` with no flags runs test files in parallel workers, and those would race on one database.

## Decision

1. **Standalone test stack:** `docker-compose.test.yml` is a complete file, not an override, and its first line is `name: flowboard-test`.
   - **`api`:** built from the same Dockerfile, with `NODE_ENV=test` and the test `DATABASE_URL`. Its command runs `prisma migrate deploy`, then keeps the container alive for `exec`.
   - **`db`:** `postgres:16` with storage in `tmpfs`, so it is fast and disposable.
   - **`redis`:** `redis:7`.
   - **Not included:** there is no worker and no Nginx.
2. **Workflow:** `docker compose -f docker-compose.test.yml up -d --build`, then the brief's command, unchanged. The README documents both lines.
3. **Jest configuration** (`api/jest.config.ts`), so the bare `npx jest` behaves correctly:
   - **`maxWorkers: 1`:** test files run one at a time.
   - **`globalSetup`:** checks that `NODE_ENV === 'test'` and that the database name ends in `_test`, and refuses to run otherwise.
   - **`setupFilesAfterEnv`:** runs `TRUNCATE "AuditLog","Task","Board","User" CASCADE` and `redis.flushdb()` in `beforeEach`.
   - **Coverage:** `collectCoverage: true`, with `collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/types/**']`.
   - **Threshold:** `coverageThreshold: { global: { lines: 80, branches: 80 } }`, so a coverage drop fails the run.
4. **Supertest** imports `app` from `src/app.ts` and never starts a server. Routes have no prefix (ADR-002).
5. **Test helpers** live in `tests/helpers/`:
   - `createUser()` inserts a user row directly. `bearer(userId)` signs an access token for it, so route tests skip bcrypt's cost of 12 on every test. `auth.test.ts` goes through the real register and login instead.
   - `rejectedAuthHeaders(userId)` lists the Authorization headers that must get a 401 (AC-2.6).
   - `createBoard(ownerId)` creates a real board. The handbook's `boardId: 'some-uuid'` example fails UUID validation, so tests need a real board.
6. **Required test cases** are listed in the requirements doc, §4. They include register (success and duplicate email), login (success and wrong password), refresh, replay, logout, 403 for another user's task, 413 above 10kb, Helmet headers, mass-assignment stripping, no stack trace in production (`NODE_ENV` stubbed within the test), the rate limiter returning 429, the rate limiter failing open (Redis mocked to throw), lockout, and `/ready` returning 503 (Prisma or Redis mocked to reject).
7. **Worker tests:** the event-publishing tests assert `XLEN tasks:events` and the fields of the last entry. They don't test the worker. Worker handlers and the consumer loop (retries, the DLQ write and XACK order) get separate unit tests in `worker/tests/`, with Redis and Prisma mocked and no coverage threshold (OQ-6). They need no stack, so they run on the host with `npm --prefix worker test`.
8. **Tests ship with features:** each feature commit includes its tests. Day 6 of the 7-day plan only closes coverage gaps.

## Consequences

- **Serial runs are slower**, but deterministic.
- **Stack must be up:** the trainer has to run `up -d` before the `exec` command. The README states this, and so does the test command's preamble.

## Security Gate one-liner

> "Tests hit a real Postgres and Redis in a separate Compose project, so they can't touch dev data. Jest runs serially with a truncate before each test, and the coverage threshold is enforced in config, so a drop fails the build."
