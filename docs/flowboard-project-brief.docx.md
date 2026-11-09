

**FlowBoard**

**Project Brief & Deliverables Guide**

*Node.js Engineering Program — Part 2*

| Full Name |   |
| :---- | :---- |
| GitHub Username |   |
| Started On |   |

*Prepared by: Ronald Dela Cruz*

*Stratpoint Global Outsourcing  \|  Internal Training  \|  2025*

# **1\. What Is FlowBoard?**

FlowBoard is your capstone project for Part 2\. It's a task management API — the kind of backend service that powers tools like Trello or Jira — built the way a Stratpoint engineer would build it: containerized, typed, tested, and secure.

It is not a toy project. By the time you pass the Security Gate, FlowBoard will be a working, production-ready API that you built from scratch. It uses every technology introduced in Part 2, and every concept in the trainee handbook connects directly to something in this codebase.

**Why FlowBoard?**

A task management API is deliberately familiar — everyone understands what tasks, boards, and users are. That familiarity lets you focus on the engineering decisions (TypeScript, Docker, Redis, security) rather than trying to understand the domain at the same time. The complexity is in the implementation, not the concept.

## **1.1 What FlowBoard Does**

FlowBoard exposes a REST API that lets users manage boards and tasks. Here is what it supports at completion:

| Feature | Endpoints | Notes |
| :---- | :---- | :---- |
| Authentication | POST /auth/register, /auth/login, /auth/refresh, /auth/logout | JWT access \+ refresh tokens; token rotation; Redis session store |
| Boards | GET, POST /boards  \|  GET, DELETE /boards/:id | Each board belongs to one owner; only the owner can delete |
| Tasks | GET, POST /tasks  \|  GET, PATCH, DELETE /tasks/:id | Full CRUD; ownership-enforced; Zod-validated body |
| Audit Log | GET /audit-logs (owner only) | Every task change is recorded via background worker |
| Health / Readiness | GET /health, GET /ready | Liveness and dependency checks for monitoring |

## **1.2 What Makes It Production-Grade**

These are the qualities that separate FlowBoard from a basic CRUD API — and what the Security Gate checks for:

* TypeScript strict mode — no implicit any; all function signatures annotated

* Containerized — every service runs in Docker; nothing runs "just on your machine"

* Input validation — every route that accepts data has a Zod schema; no raw req.body spreading

* Async event processing — task events are published to a Redis Stream and consumed by a separate Worker service

* Security headers — Helmet, strict CORS, body size limits, rate limiting on auth endpoints

* Structured logging — Pino with request IDs; sensitive fields redacted

* Test coverage — integration tests using Jest \+ Supertest; 80%+ line and branch coverage

# **2\. Architecture**

FlowBoard runs as a set of Docker containers orchestrated by Docker Compose. Each service has one responsibility, and they communicate over a shared Docker network. You will never need to run anything directly on your machine — everything goes through Docker.

## **2.1 Services**

| Service | Technology | Responsibility | Port |
| :---- | :---- | :---- | :---- |
| api | Node.js 22+ / TypeScript / Express | Handles all HTTP requests; validates input; runs business logic; publishes events | 3000 |
| worker | Node.js 22+ / TypeScript | Consumes Redis Stream events; writes AuditLog records; handles retries and dead-letter | — |
| db | PostgreSQL 16 | Primary data store for all entities (users, boards, tasks, audit logs) | 5432 |
| redis | Redis 7 | Rate limiting; refresh token store; event stream (tasks:events) | 6379 |
| nginx | Nginx (Alpine) | Reverse proxy; forwards /api/\* traffic to the api service | 80 |

**A Note on the Worker**

The Worker is a separate Node.js process running in its own container. It has no HTTP server — it just reads from a Redis Stream in a loop. This is the pattern used for background job processing in production systems. When a task is created or updated, the API publishes an event and immediately returns a response. The Worker picks up that event and writes the AuditLog asynchronously — the user never waits for it.

## **2.2 How the Services Connect**

Here is the request flow for a typical API call — for example, PATCH /tasks/:id to update a task status:

| Step | What Happens |
| :---- | :---- |
| 1 | Request arrives at Nginx on port 80 |
| 2 | Nginx proxies it to the api container on port 3000 |
| 3 | The authenticate middleware validates the JWT (no Redis/DB call needed — JWT is self-contained) |
| 4 | The route handler validates req.params and req.body with Zod |
| 5 | Prisma Client updates the task in PostgreSQL |
| 6 | The api publishes a TASK\_UPDATED event to the Redis Stream (tasks:events) |
| 7 | The api returns { success: true, data: updatedTask } to the client |
| 8 | Meanwhile, the worker reads the event from the stream, writes an AuditLog row, and ACKs the message |

## **2.3 Repository Structure**

Your forked repository follows this layout. Knowing where things live saves you from wasting time searching.

| Path | What's In It |
| :---- | :---- |
| api/src/app.ts | Express app setup — middleware stack, route mounting, global error handler |
| api/src/routes/ | One file per resource: auth.ts, boards.ts, tasks.ts, health.ts |
| api/src/middleware/ | authenticate.ts, rateLimiter.ts, (you add more during Week 3\) |
| api/src/lib/ | prisma.ts, redis.ts, logger.ts, events.ts — shared infrastructure clients |
| api/src/errors/ | AppError.ts — custom error class and global error handler middleware |
| api/prisma/schema.prisma | Full data model: User, Board, Task, AuditLog, enums |
| api/prisma/migrations/ | Auto-generated by Prisma when you run migrate dev |
| api/tests/ | Integration tests — one file per route group |
| worker/src/index.ts | Worker entry point — Redis Stream consumer loop |
| worker/src/handlers/ | One handler per event type: taskCreated.ts, taskUpdated.ts, taskDeleted.ts |
| docker-compose.yml | Defines all five services, networks, volumes, and environment variables |
| docker-compose.test.yml | Override file for running tests against a separate test database |
| ai-context | Project-level AI context file — describes stack, conventions, rules for your AI tool |
| .env.example | Template for environment variables — copy to .env and fill in values |

# **3\. Tech Stack**

This is a reference table for everything used in FlowBoard. If a technology is unfamiliar, the Part 2 trainee handbook has a walkthrough for it.

| Technology | Version | What It Does in FlowBoard |
| :---- | :---- | :---- |
| Node.js | 22 LTS or 24 | Runtime for both API and Worker services |
| TypeScript | 5.x (strict) | Static typing across the entire codebase — no implicit any |
| Express | 4.x | HTTP framework for the API service |
| Prisma | 5.x | ORM and database client; handles schema, migrations, and typed queries |
| Zod | 3.x | Runtime validation for request bodies and params; infers TypeScript types |
| PostgreSQL | 16 | Primary relational database for all persistent data |
| Redis | 7 | Rate limiting, refresh token store, and event streaming (Redis Streams) |
| ioredis | 5.x | Node.js Redis client used in both API and Worker |
| jsonwebtoken | 9.x | JWT signing and verification for access and refresh tokens |
| bcrypt | 5.x | Password hashing — cost factor 12 |
| Pino | 8.x | Structured JSON logging with request ID and field redaction |
| Jest | 29.x | Test runner for all integration tests |
| Supertest | 6.x | HTTP assertion library — makes real requests against the Express app |
| Helmet | 7.x | Sets security HTTP headers on all responses |
| Docker | 24+ | Container runtime — all services run in containers |
| Docker Compose | v2 | Orchestrates all services with a single docker compose up |
| Nginx | Alpine | Reverse proxy — terminates HTTP and forwards to API container |

# **4\. Weekly Milestones**

Each week has a set of milestones — concrete things you complete and commit. These are not optional checkpoints. They mark whether you are on track. If you finish a week with unchecked milestones, resolve them before moving forward.

**How Milestones Work**

Each milestone corresponds to a commit in your FlowBoard repository. The commit tag column shows the exact commit message prefix to use. Your trainer will check your Git history against this list during the Security Gate review.

 

Format: git commit \-m "day-01: environment setup, AppError, global error handler"

| Week 1  —  Foundation |  |  |
| :---- | :---- | :---- |
| **Day** | **Milestone / What You Complete** | **Commit Tag** |
| Day 1 | Docker Compose stack running; AI context file configured with project rules; AppError class and global error handler implemented and wired into app.ts | day-01: environment setup, AppError, global error handler |
| Day 2 | Typed Express route handlers for tasks (GET, POST, PATCH, DELETE); all Zod schemas in place; npx tsc \--noEmit passes with zero errors | day-02: typed task routes with Zod validation |
| Day 3 | Prisma schema committed (User, Board, Task, AuditLog, enums); migration runs cleanly; seed data loads without errors; Prisma Studio confirms records | day-03: prisma schema, migration, seed data |
| Day 4 | Boards CRUD complete (GET, POST, GET/:id, DELETE/:id); all task routes wired and tested in API client; global error handler tested with deliberate 404 | day-04: boards CRUD, full route layer |
| Day 5 | POST /auth/register and POST /auth/login return JWT tokens; authenticate middleware protects all board and task routes; unauthenticated request returns 401; AuditLog records created on task mutations | week-01 complete: API, auth foundation, Prisma schema |

| Week 2  —  Core Features |  |  |
| :---- | :---- | :---- |
| **Day** | **Milestone / What You Complete** | **Commit Tag** |
| Day 6 | ioredis client created; rate limiter middleware implemented and applied to /auth/login and /auth/register; Redis failure handled gracefully (fail-open with log) | day-06: Redis client, rate limiter middleware |
| Day 7 | POST /auth/refresh implemented with token rotation (old token deleted from Redis, new token issued); POST /auth/logout deletes token from Redis; replay attack returns 401 | day-07: refresh token rotation, logout endpoint |
| Day 8 | publishTaskEvent function publishes to tasks:events Redis Stream on task create/update/delete; Worker consumer loop reads events using XREADGROUP; AuditLog written on each event; XACK called after successful processing; failed messages go to dead-letter queue after 3 retries | day-08: Redis Stream events, worker consumer, AuditLog integration |
| Day 9 | Integration tests written for all endpoints (register, login, refresh, task CRUD, rate limiter); at least one happy-path and one error-path test per endpoint | day-09: integration test suite |
| Day 10 | Jest coverage report shows \>= 80% on lines and branches; all Week 1 and 2 milestones verified; any gaps from Days 1–9 resolved and committed | week-02 complete: Redis, worker, auth hardening, test suite |

| Week 3  —  Security and Ship |  |  |
| :---- | :---- | :---- |
| **Day** | **Milestone / What You Complete** | **Commit Tag** |
| Day 11 | Helmet middleware applied; CORS restricted to allowed origins; body size limited to 10kb; trust proxy set; ownership checks enforced (403 when accessing another user's resource) | day-11: Helmet, CORS, ownership checks |
| Day 12 | Brute-force protection on login (lockout or heavy throttle after N failures); mass assignment prevented (Zod schemas whitelist fields explicitly); no stack traces in error responses when NODE\_ENV=production | day-12: brute-force protection, mass assignment prevention |
| Day 13 | Pino logger installed; all console.log calls replaced; pino-http middleware logs every request (method, path, status, duration); Authorization headers and passwords confirmed redacted in log output | day-13: Pino structured logging |
| Day 14 | GET /health and GET /ready endpoints implemented; /ready returns 503 when DB or Redis is down; DLQ key format documented in AI context file | day-14: health checks, DLQ documentation |
| Day 15 | Security Gate self-review checklist completed (Section 5 of this document); all items checked; trainer notified for Security Gate session | week-03 complete: OWASP hardening, production patterns, Security Gate ready |

# **5\. Final Deliverables Checklist**

This is your Security Gate self-review. Complete this checklist before your trainer review. If any item is unchecked, fix it before the session — the trainer will verify each one.

**How the Security Gate Works**

The Security Gate is not a written exam. Your trainer will pull your repository, run docker compose up, run your test suite, and then ask you to explain specific implementation decisions. Knowing that your code passes checks is not enough — you need to understand why each decision was made.

## **5.1 Repository and Build**

* Repository forked under your GitHub account and all 15 daily commits present in the history

* docker compose up starts all five services without manual intervention

* npx tsc \--noEmit passes with zero TypeScript errors

* No hardcoded secrets in the codebase — all sensitive values read from environment variables

* .env.example is up to date with all required variables documented

## **5.2 Authentication and Authorization**

* POST /auth/register creates a user with bcrypt-hashed password (cost factor 12+)

* POST /auth/login returns accessToken (15 min TTL) and refreshToken (7 day TTL)

* POST /auth/refresh issues new token pair and invalidates old refresh token in Redis

* Replay attack blocked: using the same refresh token twice returns 401

* POST /auth/logout deletes refresh token from Redis

* All board and task endpoints require a valid Bearer token

* A user cannot read, update, or delete another user's boards or tasks (returns 403\)

## **5.3 Input Validation**

* Every route that accepts a request body has a Zod schema

* Path parameters (IDs) are validated as UUIDs

* Invalid body returns 422 Unprocessable Entity with a descriptive error message

* No req.body spreading directly into Prisma — fields are explicitly selected in Zod schema

* Extra/unknown fields in request body are stripped, not passed through

## **5.4 Security Middleware**

* Helmet middleware applied — security headers visible in response (X-Content-Type-Options, etc.)

* CORS restricted to allowed origins defined in environment variable

* Request body size limited to 10kb (413 returned for larger payloads)

* Rate limiter on /auth/login and /auth/register — 429 returned after limit exceeded

* Failed login rate limit tested: confirm 429 triggers after N attempts

* No stack traces in production error responses (NODE\_ENV=production)

## **5.5 Redis Integration**

* Rate limiter uses Redis INCR \+ EXPIRE — keys visible in Redis CLI

* Refresh tokens stored in Redis with correct TTL (redis-cli TTL 'refresh:\*' confirms expiry)

* Task events published to tasks:events Redis Stream on create, update, and delete

* Redis failure in rate limiter handled gracefully — API does not crash or block all traffic

## **5.6 Worker and Audit Log**

* Worker container starts and connects to Redis Stream without errors

* Consumer group 'audit-group' exists (redis-cli XINFO GROUPS tasks:events)

* AuditLog record created in PostgreSQL for every task create, update, and delete

* XACK called after successful processing — confirmed messages do not reappear

* Failed messages moved to dead-letter queue after 3 retries

* DLQ key format documented in the AI context file

## **5.7 Tests**

* All tests run with: docker compose \-f docker-compose.test.yml exec api npx jest

* Jest coverage report: \>= 80% on lines and \>= 80% on branches

* Every endpoint has at least one happy-path test and one error-path test

* Auth tests cover: register success, duplicate email, login success, wrong password, token refresh, replay attack, logout

* Rate limiter test confirms 429 after limit exceeded

## **5.8 Observability**

* GET /health returns 200 with uptime when the service is running

* GET /ready returns 200 when PostgreSQL and Redis are reachable

* GET /ready returns 503 when either dependency is down (tested by stopping the container)

* Every HTTP request logged with method, path, status code, and duration (pino-http)

* Authorization header is redacted in log output — confirm by checking logs during a login request

* Password field is redacted in log output

**You're Ready When**

Every checkbox above is ticked and you can answer this question without looking at your code:

 

"Walk me through what happens — from the moment a PATCH /tasks/:id request hits Nginx to the moment the AuditLog row is written."

 

If you can answer that end-to-end, you've built and understood FlowBoard. That's the Security Gate.

# **6\. Quick Reference Glossary**

Terms that appear frequently in FlowBoard and in the Part 2 trainee handbook.

| Term | What It Means in FlowBoard |
| :---- | :---- |
| Access Token | Short-lived JWT (15 min) sent by the client in the Authorization: Bearer header on every request |
| Refresh Token | Long-lived JWT (7 days) used only to get a new access token; stored in Redis; invalidated on use |
| Token Rotation | When a refresh token is used, it is immediately deleted and a new one is issued — prevents replay attacks |
| Zod Schema | A TypeScript-first validation schema that validates req.body at runtime and infers the type at compile time |
| Prisma Client | The auto-generated, fully-typed database client that Prisma generates from your schema.prisma file |
| Redis Stream | An append-only log in Redis (tasks:events) that the API writes to and the Worker reads from |
| XREADGROUP | The Redis command the Worker uses to read events as part of a named consumer group |
| XACK | The Redis command the Worker calls to acknowledge a message was processed successfully |
| Dead-Letter Queue | A Redis key (tasks:events:dlq) where events that failed processing 3 times are moved for later inspection |
| Consumer Group | A Redis concept that allows multiple consumers to share a stream without processing the same message twice |
| AppError | A custom error class that extends Error; carries an HTTP status code and an error code string |
| Global Error Handler | The last Express middleware — catches all errors passed via next(err) and returns a standard JSON response |
| Ownership Check | A check inside a route handler that confirms req.user.id matches the resource's owner before allowing the operation |
| Security Gate | The final review session where your trainer verifies all checklist items against your live running FlowBoard |
| Pino | The structured JSON logger used in FlowBoard; outputs log lines as JSON with redacted sensitive fields |
| Helmet | An Express middleware that sets security-related HTTP headers on every response |

*FlowBoard Project Brief  \|  Node.js Engineering Program — Part 2*

*Stratpoint Global Outsourcing  \|  Internal Training  \|  2025*