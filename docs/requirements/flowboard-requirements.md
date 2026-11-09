# FlowBoard — Requirements and API Contract

|                 |                                                                   |
| --------------- | ----------------------------------------------------------------- |
| Status          | Draft 1                                                           |
| Last updated    | 2026-11-09                                                        |
| Architecture    | [ARCH-flowboard.md](../arch-docs/flowboard/ARCH-flowboard.md)     |
| Source of truth | [Project Brief](../flowboard-project-brief.docx.md) §1, §4 and §5 |

**Conventions used in this document:**

- **Base URL:** `http://localhost/api` through Nginx. Tests call the same paths with no `/api` prefix.
- **Bearer:** the request needs `Authorization: Bearer <accessToken>`. A missing or invalid token returns `401 UNAUTHORIZED`.
- **Responses:** success is `{ success: true, data }`. Errors are `{ success: false, message, code }`, and 422 responses add `details`.
- **ID params:** every `:id` must be a UUID, or the request returns `422 VALIDATION_ERROR`.

---

## 1. Functional requirements and API contract

### 1.1 Auth

| ID    | Endpoint                                   | Request                                    | Success                                                                  | Errors                                                                                                                         |
| ----- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| FR-A1 | `POST /auth/register` (rate limited)       | `{ email, password }`: password 8–72 chars | `201 { user: { id, email, createdAt }, accessToken, refreshToken }`      | 409 `EMAIL_TAKEN` · 422 · 429 `RATE_LIMIT_EXCEEDED`                                                                            |
| FR-A2 | `POST /auth/login` (rate limited, lockout) | `{ email, password }`                      | `200 { accessToken, refreshToken }`                                      | 401 `INVALID_CREDENTIALS` (same for unknown email and wrong password) · 422 · 429 `RATE_LIMIT_EXCEEDED` · 429 `ACCOUNT_LOCKED` |
| FR-A3 | `POST /auth/refresh`                       | `{ refreshToken }`                         | `200 { accessToken, refreshToken }` (new pair; the old token is invalid) | 401 `INVALID_REFRESH_TOKEN` (expired, bad signature, already used or logged out) · 422 · 503 if Redis is down                  |
| FR-A4 | `POST /auth/logout`                        | `{ refreshToken }`                         | `204` (also when the token was already revoked)                          | 401 for a bad signature · 422                                                                                                  |

- **Passwords:** never returned and never logged.
- **Hashing:** bcrypt with cost 12 or higher.
- **Access token:** expires after 15 minutes.
- **Refresh token:** expires after 7 days, and its Redis key has `TTL ≈ 604800`.

### 1.2 Boards

Every board route needs a Bearer token.

| ID    | Endpoint             | Request                 | Success                                          | Errors                                              |
| ----- | -------------------- | ----------------------- | ------------------------------------------------ | --------------------------------------------------- |
| FR-B1 | `GET /boards`        | —                       | `200 Board[]`: the caller's boards, newest first | 401                                                 |
| FR-B2 | `POST /boards`       | `{ name }`: 1–100 chars | `201 Board` with `ownerId` set to the caller     | 401 · 422                                           |
| FR-B3 | `GET /boards/:id`    | —                       | `200 Board`                                      | 401 · 403 `FORBIDDEN` · 404 `BOARD_NOT_FOUND` · 422 |
| FR-B4 | `DELETE /boards/:id` | —                       | `204`; the board's tasks are deleted too         | 401 · 403 · 404 · 422                               |

### 1.3 Tasks

Every task route needs a Bearer token. Every create, update and delete publishes an event to `tasks:events`.

| ID    | Endpoint            | Request                                                                           | Success                                                  | Errors                                                          |
| ----- | ------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| FR-T1 | `GET /tasks`        | query `?boardId=<uuid>` (optional)                                                | `200 Task[]`: tasks on the caller's boards, newest first | 401 · 403 / 404 for someone else's or a missing `boardId` · 422 |
| FR-T2 | `GET /tasks/:id`    | —                                                                                 | `200 Task`                                               | 401 · 403 · 404 `TASK_NOT_FOUND` · 422                          |
| FR-T3 | `POST /tasks`       | `{ title, description?, priority?, status?, boardId }`                            | `201 Task` + event `CREATED`                             | 401 · 403 (not your board) · 404 `BOARD_NOT_FOUND` · 422        |
| FR-T4 | `PATCH /tasks/:id`  | Any of `{ title, description, priority, status }`, with at least one field (OQ-1) | `200 Task` + event `UPDATED`                             | 401 · 403 · 404 · 422                                           |
| FR-T5 | `DELETE /tasks/:id` | —                                                                                 | `204` + event `DELETED`                                  | 401 · 403 · 404 · 422                                           |

### 1.4 Audit log

This endpoint needs a Bearer token. Its meaning is still open (OQ-4).

| ID    | Endpoint          | Request                      | Success                                                                             | Errors                                                           |
| ----- | ----------------- | ---------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| FR-L1 | `GET /audit-logs` | `?limit=1..100` (default 50) | `200 AuditLog[]`: the caller's own rows, newest first                               | 401 · 422                                                        |
| FR-L2 | (worker)          | event on `tasks:events`      | An `AuditLog { userId, action, entity: "Task", entityId }` row written, then `XACK` | After 3 failed deliveries, the event moves to `tasks:events:dlq` |

### 1.5 Probes

These routes are public.

| ID    | Endpoint      | Success                                          | Errors                                                                              |
| ----- | ------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| FR-H1 | `GET /health` | `200 { status: "ok", uptime }`                   | —                                                                                   |
| FR-H2 | `GET /ready`  | `200 { status: "ready", db: "ok", redis: "ok" }` | `503 NOT_READY` if Postgres or Redis is unreachable (each check times out after 2s) |

## 2. Non-functional requirements

| ID     | Requirement                                                                                                                                                      | Verified by                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| NFR-1  | `docker compose up` on a fresh clone starts all 5 services with no manual steps (migrations run on start)                                                        | Fresh-clone test (plan Day 7) |
| NFR-2  | `npx tsc --noEmit` reports zero errors in `api` and in `worker`. Strict mode, no implicit `any`, annotated signatures                                            | CI step / manual              |
| NFR-3  | No hardcoded secrets. Config comes from env, validated by Zod at startup. `.env.example` lists every variable                                                    | grep + review                 |
| NFR-4  | Helmet headers on every response. CORS allows only `ALLOWED_ORIGINS`. Bodies over 10kb get 413. `trust proxy` = 1                                                | tests                         |
| NFR-5  | Rate limit `RATE_LIMIT_MAX` (100) per IP per 15 min on login and register. Fails open if Redis errors                                                            | tests                         |
| NFR-6  | Login lockout: after `LOGIN_MAX_FAILURES` (5) failures for one email, return 429 for 15 min. A successful login resets the count                                 | tests                         |
| NFR-7  | No stack trace in any response when `NODE_ENV=production`                                                                                                        | test                          |
| NFR-8  | Every request logged as JSON with request ID, method, path, status and duration. Authorization header, passwords and tokens redacted. No `console.log` in `src/` | log inspection + grep         |
| NFR-9  | Test coverage of at least 80% for both lines and branches (api), enforced in the Jest config                                                                     | `jest --coverage`             |
| NFR-10 | Tests run with `docker compose -f docker-compose.test.yml exec api npx jest` against a separate database                                                         | trainer runs it verbatim      |
| NFR-11 | The user never waits for the audit write. The response returns after `XADD`, not after the AuditLog insert                                                       | design (ADR-006)              |

## 3. Acceptance criteria — Security Gate (brief §5)

Every criterion has an ID, so tasks and tests can cite it. ✅ = must be covered by an automated test.

### 3.1 Repository and build

- **AC-1.1:** All 15 milestone commits are present, in order (ADR-009).
- **AC-1.2:** `docker compose up` starts all five services with no manual intervention.
- **AC-1.3:** `npx tsc --noEmit` reports zero errors.
- **AC-1.4:** No hardcoded secrets.
- **AC-1.5:** `.env.example` is complete and documented.

### 3.2 Auth and authorization

- **AC-2.1:** ✅ Register creates a user with a bcrypt hash at cost 12 or higher. A duplicate email returns 409.
- **AC-2.2:** ✅ Login returns an access token (15 min) and a refresh token (7 days). A wrong password returns 401.
- **AC-2.3:** ✅ Refresh issues a new pair and invalidates the old token in Redis.
- **AC-2.4:** ✅ Replaying a used refresh token returns 401.
- **AC-2.5:** ✅ Logout deletes the refresh token from Redis, and refreshing with it afterwards returns 401.
- **AC-2.6:** ✅ Every board and task endpoint returns 401 without a valid Bearer token.
- **AC-2.7:** ✅ Reading, updating or deleting another user's board or task returns 403.

### 3.3 Input validation

- **AC-3.1:** Every body-accepting route has a Zod schema.
- **AC-3.2:** ✅ A non-UUID `:id` returns 422.
- **AC-3.3:** ✅ An invalid body returns 422 with a descriptive message.
- **AC-3.4:** `req.body` is never spread into Prisma.
- **AC-3.5:** ✅ Unknown fields (for example `isAdmin: true`) are stripped. The request succeeds and the field isn't stored.

### 3.4 Security middleware

- **AC-4.1:** ✅ Helmet headers are present, for example `X-Content-Type-Options: nosniff`.
- **AC-4.2:** ✅ CORS sends no `Access-Control-Allow-Origin` header to origins outside `ALLOWED_ORIGINS`.
- **AC-4.3:** ✅ A 15kb body returns 413 in JSON error format.
- **AC-4.4:** ✅ The rate limiter returns 429 once the limit is exceeded on `/auth/login` and on `/auth/register`.
- **AC-4.5:** ✅ Brute-force lockout triggers after N failed logins.
- **AC-4.6:** ✅ No stack trace when `NODE_ENV=production`.

### 3.5 Redis

- **AC-5.1:** Rate-limit keys `rate:auth:*` are visible in `redis-cli` and have a TTL.
- **AC-5.2:** `redis-cli TTL refresh:<userId>:<jti>` shows the expiry of about 604800 seconds.
- **AC-5.3:** ✅ Task create, update and delete each add an entry to `tasks:events`.
- **AC-5.4:** ✅ If Redis fails inside the rate limiter, requests still succeed (fail open).

### 3.6 Worker and audit log

- **AC-6.1:** The worker starts and connects without errors.
- **AC-6.2:** `XINFO GROUPS tasks:events` shows `audit-group`.
- **AC-6.3:** Every task create, update and delete produces an AuditLog row.
- **AC-6.4:** `XPENDING` is empty after processing, so acknowledged messages don't reappear.
- **AC-6.5:** After 3 failed deliveries, the event is in `tasks:events:dlq`.
- **AC-6.6:** The DLQ key format is documented in the AI context file.

### 3.7 Tests

- **AC-7.1:** `docker compose -f docker-compose.test.yml exec api npx jest` passes.
- **AC-7.2:** Coverage is at least 80% for lines and at least 80% for branches.
- **AC-7.3:** Every endpoint has at least one happy-path test and one error-path test.
- **AC-7.4:** The auth tests cover:
  - register success;
  - duplicate email;
  - login success;
  - wrong password;
  - refresh;
  - replay;
  - logout.
- **AC-7.5:** A rate-limiter test checks for 429.

### 3.8 Observability

- **AC-8.1:** ✅ `GET /health` returns 200 with `uptime`.
- **AC-8.2:** ✅ `GET /ready` returns 200 when both dependencies are up.
- **AC-8.3:** ✅ `GET /ready` returns 503 when either dependency is down, both in the mocked test and when the container is stopped by hand.
- **AC-8.4:** Every request is logged with method, path, status and duration.
- **AC-8.5:** The Authorization header is redacted in the logs, which you can check during a login.
- **AC-8.6:** The password field is redacted in the logs.

### 3.9 Final oral check

- **AC-9.1:** Explain the PATCH `/tasks/:id` flow from Nginx to the AuditLog row without notes (ARCH §6).

## 4. Required test matrix

The minimum set of tests, one file per route group in `api/tests/`.

| File                    | Happy path                                                                                      | Error path(s)                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth.test.ts`          | register 201 · login 200 · refresh 200 · logout 204                                             | duplicate email 409 · wrong password 401 · unknown email 401 · replay 401 · refresh after logout 401 · invalid body 422 · lockout 429            |
| `boards.test.ts`        | list · create 201 · get · delete 204 (tasks cascade)                                            | no token 401 · other user's board 403 · missing 404 · bad UUID 422 · empty name 422                                                              |
| `tasks.test.ts`         | list (+ `boardId` filter) · get · create 201 · patch 200 · delete 204 · event in `tasks:events` | no token 401 · other user's task 403 · missing 404 · bad UUID 422 · missing title 422 · empty PATCH 422 · board not owned 403                    |
| `auditLogs.test.ts`     | returns only the caller's rows                                                                  | no token 401 · limit > 100 → 422                                                                                                                 |
| `rateLimiter.test.ts`   | under the limit passes                                                                          | 101st request 429 · Redis throws → passes (fail open)                                                                                            |
| `security.test.ts`      | Helmet headers · CORS allowed origin                                                            | 15kb → 413 · disallowed origin gets no ACAO header · `isAdmin` stripped · production 500 has no `stack` · unknown route 404 · malformed JSON 400 |
| `health.test.ts`        | `/health` 200 · `/ready` 200                                                                    | `/ready` 503 (DB mocked to reject) · `/ready` 503 (Redis mocked to reject)                                                                       |
| `errors.test.ts` (unit) | AppError mapping                                                                                | ZodError → 422 · P2025 → 404 · P2002 → 409 · unknown → 500                                                                                       |

## 5. Milestone map

How each brief milestone lines up with the 7-day plan and with these requirements:

| Plan day | Commit tags                                      | Requirements delivered                                                         |
| -------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1        | `day-01`                                         | NFR-1, NFR-2, NFR-3 skeleton · AppError (ARCH §7)                              |
| 2        | `day-02`, `day-03`                               | FR-T2 to FR-T5 · schema + seed · test harness (NFR-10)                         |
| 3        | `day-04`, `week-01 complete`                     | FR-B1 to FR-B4 · FR-T1 · FR-A1, FR-A2 · ownership (AC-2.7) · sync audit helper |
| 4        | `day-06`, `day-07`                               | NFR-5 · FR-A3, FR-A4                                                           |
| 5        | `day-08`                                         | FR-L1, FR-L2 · DLQ (AC-6.5)                                                    |
| 6        | `day-09`, `week-02 complete`, `day-11`, `day-12` | NFR-4, NFR-6, NFR-7, NFR-9                                                     |
| 7        | `day-13`, `day-14`, `week-03 complete`           | NFR-8 · FR-H1, FR-H2 · Section 5 self-review                                   |
