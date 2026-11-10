# FlowBoard — Architecture Document

|                                      |                                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                               | Draft 1 — ready for `/scaffold`                                                                                                                                                                          |
| Owner                                | Margaux Padiwan                                                                                                                                                                                          |
| Last updated                         | 2026-11-09                                                                                                                                                                                               |
| Sources                              | [Project Brief](../../flowboard-project-brief.docx.md) (authoritative), [Trainee Handbook](../../nodejs-part2-trainee-v4.docx.md), [7-Day Build Plan](https://claude.ai/artifact/7kD5XW7pBrQN9P5eiAwRDS) |
| Decisions                            | [adr/](adr/) — ADR-001 … ADR-009                                                                                                                                                                         |
| API contract and acceptance criteria | [docs/requirements/flowboard-requirements.md](../../requirements/flowboard-requirements.md)                                                                                                              |

Where the brief and the handbook disagree, the **brief wins**, because the trainer's Security Gate is graded against it. Each deviation is recorded in an ADR or in the [Open Questions](#14-open-questions) section.

---

## 1. Overview and scope

FlowBoard is a REST API for managing boards and tasks, similar to the backend of Trello or Jira. It is the capstone of the Node.js Engineering Program Part 2. A pass means the trainer can clone the repo, run `docker compose up`, run the test suite, and get correct answers to "why" questions at the Security Gate.

**In scope:** auth (JWT access and refresh tokens with rotation), boards CRUD, tasks CRUD, an audit log written asynchronously by a worker, Redis rate limiting and brute-force lockout, OWASP hardening, structured logging, health and readiness probes, and integration tests with at least 80% line and branch coverage.

**Out of scope:** any frontend or UI, real email, multi-user boards or sharing, roles and admins, pagination beyond `/audit-logs`, a production deployment target, Kubernetes, metrics and dashboards.

## 2. Stack

Major versions are fixed by the brief. **Do not take the newest major release.** Express 5, Prisma 6 and later, Zod 4, Jest 30 and Pino 9 and later all exist, but each one changes APIs the handbook and the tests depend on. Pin exact patch versions in `package.json` and commit the lockfile.

| Concern         | Choice                                                                  | Major to pin      |
| --------------- | ----------------------------------------------------------------------- | ----------------- |
| Runtime         | Node.js on `node:22-slim` ([ADR-001](adr/ADR-001-container-runtime.md)) | Node 22 LTS       |
| Language        | TypeScript, `strict: true`                                              | 5.x               |
| HTTP            | Express                                                                 | 4.x               |
| ORM             | Prisma + `@prisma/client` (same version in api and worker)              | 5.x               |
| Validation      | Zod                                                                     | 3.x               |
| DB              | PostgreSQL                                                              | 16                |
| Cache / streams | Redis + ioredis                                                         | 7 / 5.x           |
| Auth            | jsonwebtoken, bcrypt (cost 12)                                          | 9.x / 5.x         |
| Security        | helmet, cors                                                            | 7.x / 2.x         |
| Logging         | pino, pino-http (pino-pretty in development only)                       | 8.x / 9.x         |
| Tests           | jest, ts-jest, supertest                                                | 29.x / 29.x / 6.x |
| Dev runner      | tsx (watch mode)                                                        | 4.x               |
| Proxy           | nginx:alpine                                                            | —                 |
| Orchestration   | Docker Compose v2                                                       | —                 |

## 3. Component breakdown (by epic)

Each epic maps to one milestone group in the brief, and each bullet is roughly one dev task. The brief's commit tags appear in brackets.

### EPIC-FOUNDATION — Environment and skeleton [day-01]

- **C1.1 Repo layout**: `api/`, `worker/`, `nginx/`, `docs/`, `.env.example`, `.gitignore`, `README.md`, AI context file.
- **C1.2 Dockerfiles**: one each for `api` and `worker`. The worker builds from the repo root ([ADR-001](adr/ADR-001-container-runtime.md)).
- **C1.3 docker-compose.yml**: 5 services, healthchecks, named volumes ([§11](#11-infrastructure)).
- **C1.4 nginx.conf**: proxies `/api/` to `api:3000/` and strips the prefix ([ADR-002](adr/ADR-002-nginx-prefix-and-exposure.md)).
- **C1.5 TypeScript config**: strict mode. `app.ts` builds the app and `server.ts` calls `listen()`.
- **C1.6 Env config**: `src/config/env.ts` parses `process.env` with Zod and fails fast if a value is invalid.
- **C1.7 AppError and globalErrorHandler** ([§7](#7-error-handling)).
- **C1.8 Logger**: `src/lib/logger.ts` with Pino from day one, so no `console.log` ever needs replacing.

### EPIC-DATA — Data model and seed [day-03]

- **C2.1 Prisma schema** ([§4](#4-data-model)), plus the `init` migration.
- **C2.2 Prisma client singleton**: `src/lib/prisma.ts`.
- **C2.3 Idempotent seed**: `prisma/seed.ts` uses `upsert` to create 1 user (`dev@flowboard.test`, bcrypt-hashed), 2 boards and 3 tasks.

### EPIC-API — Boards and tasks [day-02, day-04]

- **C3.1 Zod schemas**: `src/schemas/` holds the task, board and auth schemas and `IdParamSchema`.
- **C3.2 Task routes**: `src/routes/tasks.ts`. GET list, GET by id, POST, PATCH, DELETE.
- **C3.3 Board routes**: `src/routes/boards.ts`. GET list, POST, GET by id, DELETE.
- **C3.4 Ownership checks** ([ADR-003](adr/ADR-003-ownership-via-board.md)).
- **C3.5 Audit log read**: `GET /audit-logs` ([OQ-4](#14-open-questions)).

### EPIC-AUTH — Authentication [week-01 complete, day-07]

- **C4.1 Register and login**: `src/routes/auth.ts`.
- **C4.2 `authenticate` middleware**, plus the `req.user` type augmentation in `src/types/express.d.ts`.
- **C4.3 Refresh rotation and logout** ([ADR-004](adr/ADR-004-token-strategy.md)).

### EPIC-REDIS — Redis, rate limiting, lockout [day-06, day-12]

- **C5.1 Redis client**: `src/lib/redis.ts` ([ADR-005](adr/ADR-005-redis-failure-policy.md)).
- **C5.2 `rateLimiter` middleware**: applied to `/auth/login` and `/auth/register` only.
- **C5.3 Login brute-force lockout**, counted per email.

### EPIC-EVENTS — Event stream and worker [day-08, day-14]

- **C6.1 `publishTaskEvent`**: `src/lib/events.ts`.
- **C6.2 Worker consumer loop**: `worker/src/index.ts` and `worker/src/consumer.ts`.
- **C6.3 Handlers**: `worker/src/handlers/taskCreated.ts`, `taskUpdated.ts` and `taskDeleted.ts`.
- **C6.4 Retries and DLQ** ([ADR-006](adr/ADR-006-async-audit-worker.md)).
- **C6.5 Graceful shutdown**: on SIGTERM or SIGINT, finish the batch, disconnect, then exit.

### EPIC-SECURITY — OWASP hardening [day-11, day-12]

- **C7.1 Security middleware**: helmet, CORS from `ALLOWED_ORIGINS`, a 10kb body limit, and `trust proxy`.
- **C7.2 Mass assignment prevention**: Zod schemas whitelist fields, and `req.body` is never spread into Prisma.
- **C7.3 No stack traces in production.**

### EPIC-OBSERVABILITY — Logging and probes [day-13, day-14]

- **C8.1 pino-http** with request IDs and redaction ([§10](#10-observability)).
- **C8.2 `GET /health` and `GET /ready`**: `src/routes/health.ts`.
- **C8.3 DLQ format documented** in the AI context file.

### EPIC-TESTING — Test suite and coverage [day-09, week-02 complete]

- **C9.1 Test stack**: `docker-compose.test.yml` and the Jest configuration ([ADR-008](adr/ADR-008-testing-strategy.md)).
- **C9.2 Integration tests**: one file per route group in `api/tests/`.
- **C9.3 Coverage**: a threshold of 80% lines and branches, enforced in the Jest config.

## 4. Data model

This is the handbook schema with three deliberate additions, marked **(+)** and explained in [ADR-003](adr/ADR-003-ownership-via-board.md).

```prisma
generator client {
  provider = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]   // (+) node:22-slim is Debian 12
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String     @id @default(uuid())
  email     String     @unique            // stored lower-cased
  password  String                        // bcrypt hash, never returned by the API
  createdAt DateTime   @default(now())
  boards    Board[]
  auditLogs AuditLog[]
}

model Board {
  id        String   @id @default(uuid())
  name      String
  ownerId   String
  owner     User     @relation(fields: [ownerId], references: [id])
  tasks     Task[]
  createdAt DateTime @default(now())

  @@index([ownerId])                                   // (+)
}

model Task {
  id          String     @id @default(uuid())
  title       String
  description String?
  status      TaskStatus @default(TODO)
  priority    Priority   @default(MEDIUM)
  boardId     String
  board       Board      @relation(fields: [boardId], references: [id], onDelete: Cascade)  // (+)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([boardId])                                   // (+)
}

model AuditLog {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  action    String   // CREATED | UPDATED | DELETED
  entity    String   // "Task"
  entityId  String   // task id; no FK, so the row outlives a deleted task
  createdAt DateTime @default(now())

  @@index([userId, createdAt])                         // (+)
}

enum TaskStatus { TODO IN_PROGRESS REVIEW DONE }
enum Priority   { LOW MEDIUM HIGH }
```

- **There is no `Task.userId`.** Ownership is resolved as `task → board → ownerId`.
- **`AuditLog.entityId` has no foreign key on purpose.** A `DELETED` audit row must survive after its task is gone.

## 5. API surface

The full contracts, status codes and acceptance criteria are in the [requirements doc](../../requirements/flowboard-requirements.md). In summary:

| Group  | Routes                                                                   | Auth                                 |
| ------ | ------------------------------------------------------------------------ | ------------------------------------ |
| Auth   | `POST /auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` | None (rate limited: register, login) |
| Boards | `GET, POST /boards` · `GET, DELETE /boards/:id`                          | Bearer                               |
| Tasks  | `GET, POST /tasks` · `GET, PATCH, DELETE /tasks/:id`                     | Bearer                               |
| Audit  | `GET /audit-logs`                                                        | Bearer                               |
| Probes | `GET /health` · `GET /ready`                                             | None                                 |

The api mounts routes at its root (`/tasks`), and clients call them through Nginx at `/api/tasks` ([ADR-002](adr/ADR-002-nginx-prefix-and-exposure.md)).

## 6. Request lifecycle — `PATCH /tasks/:id`

This is the walkthrough the Security Gate asks for:

1. The client sends `PATCH http://localhost/api/tasks/<id>` to Nginx on port 80.
2. Nginx matches `location /api/`, strips the prefix, and proxies to `http://api:3000/tasks/<id>`. It sets `X-Forwarded-For` and `X-Request-Id`.
3. The api middleware runs in this order: pino-http (gets a request ID and starts the timer) → helmet → cors → `express.json({ limit: '10kb' })` → router.
4. `authenticate` verifies the access JWT using only the signature and expiry, with no database or Redis call, and sets `req.user = { id }`. A missing or invalid token gives 401.
5. The handler parses `req.params` with `IdParamSchema` (UUID) and the body with `UpdateTaskSchema`, which strips unknown fields. A failure gives 422.
6. The handler loads the task with its board: a missing task gives 404, and `board.ownerId !== req.user.id` gives 403.
7. `prisma.task.update` sets only the fields Zod returned.
8. `publishTaskEvent` runs `XADD tasks:events * action UPDATED taskId … userId … payload … ts …`.
9. The api responds `200 { success: true, data: task }`, and pino-http logs the method, path, status and duration.
10. In parallel, the worker's `XREADGROUP GROUP audit-group worker-1 COUNT 10 BLOCK 5000 STREAMS tasks:events >` receives the message. The `taskUpdated` handler inserts an `AuditLog` row, then the worker runs `XACK`. If the handler fails, the message stays pending and is retried. On the 3rd failure the worker moves it to `tasks:events:dlq` ([ADR-006](adr/ADR-006-async-audit-worker.md)).

**About step 8:** if `XADD` fails, the task update has already committed. The api logs the error and still returns 200, so the user isn't blocked by audit infrastructure. That change will have no audit row. This trade-off is accepted and recorded in [ADR-006](adr/ADR-006-async-audit-worker.md).

## 7. Error handling

- **`AppError(message, statusCode, code)`** is defined in `src/errors/AppError.ts`, together with the `isAppError()` type guard and `globalErrorHandler`.
- **Async handlers** use `try/catch` and call `next(err)`. They never call `res.status().json()` inside a `catch`. This matters because Express 4 does not catch rejected promises.
- **Response shapes:**
  - Success: `{ success: true, data }`
  - Error: `{ success: false, message, code }`
  - Validation errors also include a `details` array ([ADR-007](adr/ADR-007-validation-contract.md)).
- **Mapping in `globalErrorHandler`**, checked in this order:

| Thrown                                                  | Status  | `code`                                                |
| ------------------------------------------------------- | ------- | ----------------------------------------------------- |
| `AppError`                                              | its own | its own                                               |
| `ZodError`                                              | 422     | `VALIDATION_ERROR` (+ `details: [{ path, message }]`) |
| body-parser error with `type === 'entity.too.large'`    | 413     | `PAYLOAD_TOO_LARGE`                                   |
| body-parser error with `type === 'entity.parse.failed'` | 400     | `INVALID_JSON`                                        |
| `Prisma…KnownRequestError` P2025                        | 404     | `NOT_FOUND`                                           |
| `Prisma…KnownRequestError` P2002                        | 409     | `CONFLICT`                                            |
| `jsonwebtoken` errors                                   | 401     | `UNAUTHORIZED`                                        |
| anything else                                           | 500     | `INTERNAL_ERROR`                                      |

- **Refresh tokens and fail-closed Redis** (day-07): `verifyRefresh` turns every `jsonwebtoken` error into `AppError 401 INVALID_REFRESH_TOKEN` (FR-A3), so the generic `UNAUTHORIZED` row applies only to access tokens. When Redis rejects on a fail-closed path (issuing a pair at register, login or refresh; the `DEL` at refresh or logout), `src/lib/tokens.ts` throws `AppError 503 SERVICE_UNAVAILABLE`. That is the same code Nginx's `@api_unavailable` page uses ([ADR-005](adr/ADR-005-redis-failure-policy.md)).

- **Unknown routes:** a final `notFound` middleware turns any unmatched route into `404 ROUTE_NOT_FOUND`.
- **Production:** when `NODE_ENV=production`, responses never contain `stack` and 500 errors use the generic message "Internal server error". The full error, with its stack, is always logged server-side.

## 8. Authentication

[ADR-004](adr/ADR-004-token-strategy.md) explains why the design is shaped this way.

- **Passwords** are hashed with bcrypt using `BCRYPT_COST`, default and minimum 12. Emails are lower-cased and trimmed before storage and lookup.
- **Access token:** `jwt.sign({ sub: userId }, JWT_ACCESS_SECRET, { expiresIn: '15m' })`.
- **Refresh token:** `jwt.sign({ sub: userId, jti: uuid }, JWT_REFRESH_SECRET, { expiresIn: '7d' })`. It is stored with `SET refresh:{userId}:{jti} 1 EX 604800`.
- **Separate secrets:** access and refresh tokens use different secrets, so a refresh token can never pass as an access token.
- **`authenticate`:** checks for `Authorization: Bearer <token>`, then runs `jwt.verify` with the access secret, then sets `req.user = { id: sub }`. It makes no database or Redis call.
- **Login:** a wrong email and a wrong password return the same `401 INVALID_CREDENTIALS`. When the email is unknown, the handler still runs `bcrypt.compare` against a dummy hash, so response timing doesn't reveal whether an account exists.

## 9. Redis

### 9.1 Client

`src/lib/redis.ts` is shared by the api and mirrored in the worker. The details are in [ADR-005](adr/ADR-005-redis-failure-policy.md).

```ts
new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT, // parsed by the env schema; never `Number(x) ?? 6379`
  enableOfflineQueue: false, // fail fast when Redis is down, instead of queueing forever
  maxRetriesPerRequest: 1,
});
```

- The worker uses its **own connection** for the blocking `XREADGROUP` call. A blocked connection can't serve other commands.
- Errors are logged with the Pino logger, never with `console.error`.

### 9.2 Keyspace

| Key                      | Type             | TTL                               | Written by                       | Purpose                                                                                                |
| ------------------------ | ---------------- | --------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `rate:auth:{ip}`         | string (counter) | `RATE_LIMIT_WINDOW_SECONDS` (900) | api                              | Per-IP limit on login and register, shared bucket. Uses `MULTI INCR; EXPIRE NX`.                       |
| `login:fail:{email}`     | string (counter) | `LOGIN_LOCKOUT_SECONDS` (900)     | api                              | Failed logins per email. Deleted on a successful login.                                                |
| `login:lock:{email}`     | string           | `LOGIN_LOCKOUT_SECONDS` (900)     | api                              | Set when failures reach `LOGIN_MAX_FAILURES` (5). While it exists, login returns `429 ACCOUNT_LOCKED`. |
| `refresh:{userId}:{jti}` | string `"1"`     | 604800 (7d)                       | api                              | Live refresh token. `DEL` on rotation and on logout.                                                   |
| `tasks:events`           | stream           | none                              | api `XADD` / worker `XREADGROUP` | Task events. Consumer group `audit-group`.                                                             |
| `tasks:events:dlq`       | stream           | none                              | worker                           | Dead-letter queue (§9.3).                                                                              |

**Rate limiting is fail-open.** If any rate-limit or lockout command throws, the middleware logs at `warn` and calls `next()`. Only a 429 that the middleware decided itself is sent through `next(err)`.

### 9.3 Event and DLQ format

**Stream entry on `tasks:events`:**

| Field     | Value                                                                                       |
| --------- | ------------------------------------------------------------------------------------------- |
| `action`  | `CREATED` \| `UPDATED` \| `DELETED`                                                         |
| `taskId`  | `<uuid>`                                                                                    |
| `userId`  | `<uuid>` (the actor)                                                                        |
| `payload` | `<JSON string>` (the task snapshot after the change; for `DELETED`, the snapshot before it) |
| `ts`      | `<epoch ms>`                                                                                |

**DLQ entry on `tasks:events:dlq`**, written with `XADD` by the worker after `WORKER_MAX_DELIVERIES` (3) failed deliveries:

| Field                                         | Value                           |
| --------------------------------------------- | ------------------------------- |
| `originalId`                                  | the stream ID in `tasks:events` |
| `action`, `taskId`, `userId`, `payload`, `ts` | copied unchanged                |
| `error`                                       | the last error message          |
| `deliveries`                                  | `3`                             |
| `failedAt`                                    | `<ISO timestamp>`               |

After the `XADD` to the DLQ, the worker runs `XACK tasks:events audit-group <originalId>`.

**Inspecting the DLQ:** `docker compose exec redis redis-cli XRANGE tasks:events:dlq - +`

The brief requires this format to also be copied into the AI context file (Day 14).

## 10. Observability

- **Logger:** `src/lib/logger.ts` uses level `LOG_LEVEL`, and pino-pretty only when `NODE_ENV=development`.
- **Redaction paths:**
  - `req.headers.authorization`
  - `req.headers.cookie`
  - `*.password`
  - `*.refreshToken`
  - `*.accessToken`
  - `body.password`
  - `body.refreshToken`
- **pino-http** is the first middleware.
  - **Request ID:** it uses `genReqId` to take Nginx's `X-Request-Id` when present, otherwise `randomUUID()`, and echoes the ID back in the `X-Request-Id` response header.
  - **Log line:** it logs the method, URL, status code and `responseTime`.
  - **Bodies:** request bodies are not logged by default. Any body logged explicitly passes through redaction.
- **`GET /health`:** returns `200 { success: true, data: { status: 'ok', uptime } }`, with no dependency checks.
- **`GET /ready`:** runs `SELECT 1` through Prisma and `PING` on Redis in parallel, each with a 2s timeout. It returns `200 { success: true, data: { status: 'ready', db: 'ok', redis: 'ok' } }` when both pass, or `503 NOT_READY` through `AppError` if either fails.
- **Worker logging:** the worker uses the same Pino logger configuration. It logs at `info` for each processed event, at `warn` for each retry, and at `error` for each DLQ move.

## 11. Infrastructure

### 11.1 docker-compose.yml (dev)

| Service  | Image / build                         | Ports (host)                                 | Depends on                | Notes                                                                                                                                            |
| -------- | ------------------------------------- | -------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nginx`  | `nginx:alpine` + `./nginx/nginx.conf` | `80:80`                                      | api                       | The only entry point for API traffic.                                                                                                            |
| `api`    | `./api/Dockerfile` (target `dev`)     | `5555:5555` (Prisma Studio only)             | db healthy, redis healthy | Bind-mounts `./api`, with an anonymous volume at `/app/node_modules`. The start command runs `prisma migrate deploy && tsx watch src/server.ts`. |
| `worker` | context `.`, `./worker/Dockerfile`    | —                                            | db healthy, redis healthy | Runs `tsx watch src/index.ts`.                                                                                                                   |
| `db`     | `postgres:16`                         | none (`docker compose exec db psql`)         | —                         | Healthcheck `pg_isready`. Named volume `pgdata`.                                                                                                 |
| `redis`  | `redis:7`                             | none (`docker compose exec redis redis-cli`) | —                         | Healthcheck `redis-cli ping`.                                                                                                                    |

- **One network:** all services share the default network.
- **No published port for `api`:** port 3000 is not published to the host, so every request passes through Nginx ([ADR-002](adr/ADR-002-nginx-prefix-and-exposure.md)).

### 11.2 docker-compose.test.yml

- **Standalone file**, not an override, because the brief's command passes only this file. It starts with `name: flowboard-test` so it never replaces the dev containers.
- **Services:** `api` (with `NODE_ENV=test`), `db` (Postgres with `tmpfs` storage) and `redis`. There is no worker or Nginx.
- **Workflow:** run `docker compose -f docker-compose.test.yml up -d --build` once, then `docker compose -f docker-compose.test.yml exec api npx jest`.

[ADR-008](adr/ADR-008-testing-strategy.md) has the details.

### 11.3 Environment variables (`.env.example`)

| Variable                                              | Example                                              | Used by     | Notes                                           |
| ----------------------------------------------------- | ---------------------------------------------------- | ----------- | ----------------------------------------------- |
| `NODE_ENV`                                            | `development`                                        | api, worker | `development` \| `test` \| `production`         |
| `PORT`                                                | `3000`                                               | api         |                                                 |
| `LOG_LEVEL`                                           | `info`                                               | api, worker |                                                 |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `flowboard` / `change-me` / `flowboard`              | db          |                                                 |
| `DATABASE_URL`                                        | `postgresql://flowboard:change-me@db:5432/flowboard` | api, worker |                                                 |
| `REDIS_HOST` / `REDIS_PORT`                           | `redis` / `6379`                                     | api, worker |                                                 |
| `JWT_ACCESS_SECRET`                                   | `change-me-access-min-32-chars`                      | api         | At least 32 chars, validated at startup         |
| `JWT_REFRESH_SECRET`                                  | `change-me-refresh-min-32-chars`                     | api         | Must differ from the access secret              |
| `JWT_ACCESS_TTL`                                      | `15m`                                                | api         |                                                 |
| `JWT_REFRESH_TTL_SECONDS`                             | `604800`                                             | api         | Same value for the Redis TTL and the JWT expiry |
| `BCRYPT_COST`                                         | `12`                                                 | api         | Minimum 12                                      |
| `ALLOWED_ORIGINS`                                     | `http://localhost:5173`                              | api         | Comma-separated                                 |
| `RATE_LIMIT_WINDOW_SECONDS` / `RATE_LIMIT_MAX`        | `900` / `100`                                        | api         |                                                 |
| `LOGIN_MAX_FAILURES` / `LOGIN_LOCKOUT_SECONDS`        | `5` / `900`                                          | api         |                                                 |
| `WORKER_CONSUMER_NAME`                                | `worker-1`                                           | worker      |                                                 |
| `WORKER_MAX_DELIVERIES`                               | `3`                                                  | worker      |                                                 |
| `WORKER_CLAIM_IDLE_MS`                                | `30000`                                              | worker      | `XAUTOCLAIM` min-idle                           |

Startup validation: both services parse `process.env` with a Zod schema in `src/config/env.ts`. A missing or invalid value stops startup with a clear message. Nothing else reads `process.env` directly.

## 12. Security rules

These rules are non-negotiable and become AI context file rules:

1. **Bearer auth** on every board, task and audit route. Only `/auth/*`, `/health` and `/ready` are public.
2. **Ownership** is checked in every handler that loads a board or task by id ([ADR-003](adr/ADR-003-ownership-via-board.md)). List routes filter by `ownerId`.
3. **Zod on all input:** every body, param and query string is parsed with Zod. Never spread `req.body` into Prisma. Use plain `z.object()`, with no `.passthrough()` and no `.strict()` ([ADR-007](adr/ADR-007-validation-contract.md)).
4. **No raw SQL**, except the literal `SELECT 1` in `/ready`.
5. **No secrets in code.** Every secret comes from env. `.env` is git-ignored.
6. **No sensitive data in output:** no password or hash in any response or log, and no stack trace in production responses.
7. **Middleware:** helmet with defaults, CORS restricted to `ALLOWED_ORIGINS`, `express.json({ limit: '10kb' })`, and `app.set('trust proxy', 1)`.
8. **Async middleware** wraps its body in `try/catch` and calls `next(err)`, because Express 4 does not catch async throws.

## 13. Repository structure

```
flowboard/
├── api/
│   ├── Dockerfile
│   ├── package.json · tsconfig.json · jest.config.ts
│   ├── prisma/
│   │   ├── schema.prisma          # single source of truth (worker generates from here)
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── src/
│   │   ├── app.ts                 # builds the Express app; no listen()
│   │   ├── server.ts              # the only file that calls listen()
│   │   ├── config/env.ts          # Zod-validated env
│   │   ├── errors/AppError.ts     # AppError, isAppError, globalErrorHandler, notFound
│   │   ├── lib/                   # prisma.ts, redis.ts, logger.ts, events.ts, tokens.ts
│   │   ├── middleware/            # authenticate.ts, rateLimiter.ts, loginLockout.ts
│   │   ├── routes/                # auth.ts, boards.ts, tasks.ts, auditLogs.ts, health.ts
│   │   ├── schemas/               # task.ts, board.ts, auth.ts, common.ts (IdParamSchema)
│   │   └── types/express.d.ts     # req.user augmentation
│   └── tests/                     # auth / boards / tasks / auditLogs / health / rateLimiter / security .test.ts + helpers/
├── worker/
│   ├── Dockerfile                 # build context = repo root
│   ├── package.json · tsconfig.json
│   └── src/
│       ├── index.ts               # bootstrap + shutdown
│       ├── consumer.ts            # group create, read loop, XAUTOCLAIM, DLQ
│       ├── config/env.ts
│       ├── lib/                   # prisma.ts, redis.ts, logger.ts
│       └── handlers/              # taskCreated.ts, taskUpdated.ts, taskDeleted.ts
├── nginx/nginx.conf
├── docs/                          # brief, handbook, arch-docs/, requirements/, dev-tasks/
├── knowledge/                     # generated by /scaffold
├── docker-compose.yml
├── docker-compose.test.yml
├── .env.example · .gitignore · README.md
└── AGENTS.md / CLAUDE.md          # AI context file (see OQ-5)
```

## 14. Open questions

Raise these with the trainer early. Until they answer, the work proceeds on the stated assumption.

| #    | Question                                                                                                                                                           | Assumption until answered                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OQ-1 | Can `PATCH /tasks/:id` change `status`? The brief's walkthrough says yes; the handbook exercise allows only title and priority.                                    | **Yes.** PATCH accepts `title`, `description`, `priority` and `status`.                                                                                                                              |
| OQ-2 | The handbook combines the tags `days-11-12` and `days-13-14`; the brief lists 4 separate tags.                                                                     | **Follow the brief:** `day-11`, `day-12`, `day-13`, `day-14`.                                                                                                                                        |
| OQ-3 | Is the compressed 7-day schedule acceptable, given the brief expects 15 daily commits?                                                                             | All 15 tags are committed in order, about 2 per day, with no backdating.                                                                                                                             |
| OQ-4 | `GET /audit-logs (owner only)` is in brief §1.1 but has no milestone or checklist item. What does "owner only" mean?                                               | Returns the caller's own audit rows (`userId = req.user.id`), newest first, with `?limit` (default 50, max 100). Built with day-08.                                                                  |
| OQ-5 | The brief lists a root file called `ai-context`, while the handbook says "the context file for your tool". Is a literal filename required?                         | `AGENTS.md` is the canonical context file (generated by `/scaffold`), and `CLAUDE.md` contains `@AGENTS.md`. Confirm whether a file literally named `ai-context` is also expected.                   |
| OQ-6 | Does coverage of at least 80% apply to the worker too? The brief's command runs Jest only inside `api`.                                                            | **API only.** Worker handlers get a few unit tests, but no threshold.                                                                                                                                |
| OQ-7 | Deleting a board cascades to its tasks. Should each cascaded task produce a `DELETED` audit event?                                                                 | **No.** One board delete is not audited per task; this is a known gap ([ADR-003](adr/ADR-003-ownership-via-board.md)).                                                                               |
| OQ-8 | `npm audit` reports a high-severity advisory for Zod 3 (memory exhaustion on oversized constrained collections); the fix is Zod 4. The brief fixes Zod 3.          | **Stay on Zod 3.** Exposure is bounded by the 10kb body limit (day-11) and no schema accepts unbounded arrays. Ask whether Zod 4 is acceptable.                                                      |
| OQ-9 | FR-A4 says logout returns 401 "for a bad signature". Should an expired but correctly signed refresh token also get 401, or 204, since its key has already expired? | **401 `INVALID_REFRESH_TOKEN`.** Logout uses the same `verifyRefresh` as refresh (ADR-004 §4: "401 if it's invalid"). Its Redis key has the same TTL, so there is nothing left to revoke either way. |
