# AGENTS.md — FlowBoard

> The project's AI context file. Every AI assistant working in this repo reads this first.
> Keep it current: the Security Gate reviews it (DLQ format, rules, decisions).

## Project

FlowBoard is a REST API for boards and tasks (like the backend of Trello or Jira). It is the capstone of the Stratpoint Node.js Engineering Program, Part 2, and is graded at the **Security Gate** against [the project brief](docs/flowboard-project-brief.docx.md) §5.

- **Architecture:** [ARCH-flowboard.md](docs/arch-docs/flowboard/ARCH-flowboard.md) and ADRs in [docs/arch-docs/flowboard/adr/](docs/arch-docs/flowboard/adr/)
- **API contract and acceptance criteria:** [flowboard-requirements.md](docs/requirements/flowboard-requirements.md)
- **When the brief and the handbook disagree, the brief wins.** Open questions: ARCH §14.

## Stack

Major versions are fixed by the brief; versions are pinned exactly in each `package.json`. **Never upgrade to Express 5, Prisma 6+, Zod 4, Jest 30 or Pino 9+.**

| Concern                    | Choice                                             |
| -------------------------- | -------------------------------------------------- |
| Runtime                    | Node.js 22 on `node:22-slim` (not Alpine, ADR-001) |
| Language                   | TypeScript 5, strict                               |
| HTTP                       | Express 4                                          |
| ORM / DB                   | Prisma 5 / PostgreSQL 16                           |
| Validation                 | Zod 3                                              |
| Cache, rate limits, events | Redis 7 via ioredis 5                              |
| Auth                       | jsonwebtoken 9, bcrypt 5 (cost 12)                 |
| Logging                    | Pino 8 (+ pino-http)                               |
| Tests                      | Jest 29, ts-jest, Supertest 6                      |
| Infra                      | Docker Compose v2, Nginx (Alpine)                  |

## Layout

```
api/src/app.ts            builds the Express app (no listen)
api/src/server.ts         the only listen()
api/src/config/env.ts     Zod-validated env; the only reader of process.env
api/src/errors/AppError.ts  AppError, isAppError, notFound, globalErrorHandler
api/src/lib/              prisma, redis, logger, events, tokens
api/src/middleware/       authenticate, rateLimiter, loginLockout
api/src/routes/           auth, boards, tasks, auditLogs, health (one file per resource)
api/src/schemas/          Zod schemas (+ z.infer types)
api/tests/                integration tests, one file per route group
worker/src/               index (bootstrap), consumer loop, handlers/
nginx/nginx.conf          /api/* → api:3000 with the prefix stripped
```

## Error Handling

- All async route handlers use try/catch.
- Errors are passed to `next(err)` — never `res.send()` / `res.status().json()` in a catch block.
- HTTP errors use our `AppError` class (`api/src/errors/AppError.ts`): `throw new AppError('Task not found', 404, 'TASK_NOT_FOUND')`.
- `globalErrorHandler` is the last middleware and owns the mapping (ARCH §7): AppError → its status; ZodError → 422 `VALIDATION_ERROR`; body too large → 413; malformed JSON → 400; Prisma P2025 → 404, P2002 → 409; JWT errors → 401; everything else → 500.
- No stack traces in responses when `NODE_ENV=production`. Always log the full error server-side.
- Express 4 does not catch async throws: any `async` middleware wraps its body in try/catch and calls `next(err)`.

## TypeScript Rules

- Strict mode is on — no implicit `any`, and no explicit `any` either (ESLint enforces it).
- All function parameters and return types are annotated.
- Prefer interfaces for object shapes, type aliases for unions/intersections.
- Request types come from Zod: `type CreateTaskInput = z.infer<typeof CreateTaskSchema>` — never a duplicate hand-written interface.
- `npx tsc --noEmit` must pass with zero errors (`npm run typecheck` checks api and worker).

## Response Format

- Success: `{ success: true, data: ... }`
- Error: `{ success: false, message: '...', code: '...' }` (422 adds `details: [{ path, message }]`)
- `DELETE` and logout return `204` with no body.

## Security Rules (ARCH §12)

1. Every board, task and audit route requires `Authorization: Bearer <accessToken>`. Only `/auth/*`, `/health` and `/ready` are public.
2. Ownership goes through `Board.ownerId` (tasks have no `userId`, ADR-003): load the resource, 404 if missing, 403 if `ownerId !== req.user.id`. List queries filter by owner.
3. Parse every body, param and query with Zod. Use plain `z.object()` (strips unknown keys) — never `.passthrough()` or `.strict()`. **Never spread `req.body` into Prisma**; build `data` from the parsed result (ADR-007).
4. No raw SQL (except `SELECT 1` in `/ready`).
5. No secrets in code. Read config only through `config/env.ts`.
6. Never return or log passwords, hashes or tokens. Logger redaction covers `authorization`, `password`, `refreshToken`, `accessToken`.
7. No `console.log` anywhere (ESLint `no-console`); use `logger`.
8. Redis failure policy (ADR-005): rate limiting and lockout **fail open**; refresh/logout **fail closed** (503); a failed `publishTaskEvent` is logged and the response still succeeds.

## Key Decisions

| ADR                                                                      | Decision                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [001](docs/arch-docs/flowboard/adr/ADR-001-container-runtime.md)         | `node:22-slim` + OpenSSL; migrations run on api start; worker generates Prisma from `api/prisma` |
| [002](docs/arch-docs/flowboard/adr/ADR-002-nginx-prefix-and-exposure.md) | Nginx strips `/api`; api port not published; `trust proxy` = 1                                   |
| [003](docs/arch-docs/flowboard/adr/ADR-003-ownership-via-board.md)       | Ownership via `Board.ownerId`; board delete cascades to tasks                                    |
| [004](docs/arch-docs/flowboard/adr/ADR-004-token-strategy.md)            | 15m access / 7d refresh with `jti` in Redis; atomic `DEL` detects replay                         |
| [005](docs/arch-docs/flowboard/adr/ADR-005-redis-failure-policy.md)      | ioredis `enableOfflineQueue: false`; per-use fail-open / fail-closed                             |
| [006](docs/arch-docs/flowboard/adr/ADR-006-async-audit-worker.md)        | Audit via `tasks:events` + `audit-group`; XAUTOCLAIM retries; DLQ after 3                        |
| [007](docs/arch-docs/flowboard/adr/ADR-007-validation-contract.md)       | Zod strips unknown fields; 422 with `details`                                                    |
| [008](docs/arch-docs/flowboard/adr/ADR-008-testing-strategy.md)          | Real Postgres + Redis in `flowboard-test` Compose project; serial Jest; 80% threshold            |
| [009](docs/arch-docs/flowboard/adr/ADR-009-commit-convention.md)         | Milestone tags verbatim; Conventional Commits otherwise                                          |

## Dead-Letter Queue Format

_Filled in with `day-14` (brief §5.6 requires it here). Draft: ARCH §9.3._

## Implemented So Far

Only build on what exists. Tick a line when its milestone commit lands.

- [x] `day-01` — Docker Compose stack, Nginx, TypeScript, env config, logger, AppError + global error handler
- [x] `day-02` — typed task routes with Zod
- [x] `day-03` — Prisma schema, migration, seed
- [x] `day-04` — boards CRUD, full route layer
- [x] `week-01 complete` — register/login, `authenticate`, AuditLog on task mutations (sync, in-transaction until `day-08`)
- [ ] `day-06` — Redis client, rate limiter
- [ ] `day-07` — refresh rotation, logout
- [ ] `day-08` — events, worker consumer, DLQ
- [ ] `day-09` / `week-02 complete` — test suite, ≥80% coverage
- [ ] `day-11` / `day-12` — helmet, CORS, 10kb limit, ownership, lockout, mass assignment
- [ ] `day-13` / `day-14` — pino-http, `/health`, `/ready`, DLQ docs
- [ ] `week-03 complete` — Security Gate self-review

## Git Conventions

- **Milestone commits** use the brief's tag and text exactly, in order (full list: ADR-009), e.g. `day-01: environment setup, AppError, global error handler`.
- **All other commits** use Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `build:`, `chore:`.
- commitlint accepts both; husky runs lint-staged (ESLint + Prettier) before each commit. Never bypass hooks with `--no-verify`.
- Never commit `.env` or secrets. Never backdate commits.

## Quality Gates

Before any milestone commit:

1. `npm run typecheck` — zero errors
2. `npm run lint` — zero errors
3. Tests pass with coverage ≥ 80% lines and branches (from plan Day 2): `docker compose -f docker-compose.test.yml exec api npx jest`
4. The milestone's acceptance criteria in the requirements doc are met

## Workflow

Every task follows Explore → Plan → Act → Verify (`/evaluate` → `/plan` → `/apply` → `/validate`). Never accept generated code without reading it; be able to explain every line at the Security Gate. Reusable prompts live in `knowledge/prompts/dev/`, standards in `knowledge/rules/`, the implement-and-test chain in `knowledge/patterns/`.
