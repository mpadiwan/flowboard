

**Node.js Engineering Program**

**Part 2: AI-Assisted Engineering**

*Trainee Handbook  —  Self-Paced*

| Full Name |   |
| :---- | :---- |
| Career Level |   |
| GitHub Username |   |
| AI Tool(s) |   |
| Started On |   |

*Prepared by: Ronald Dela Cruz*

*Stratpoint Global Outsourcing  \|  Internal Training  \|  2025*

# **1\. Welcome to Part 2**

If you're reading this, you've already completed Part 1 — you know JavaScript, you know Node.js, you understand how a REST API works. Part 2 is where things get real.

This program is called AI-Assisted Engineering, and that name matters. You're not just learning new technologies — you're learning a new way of working. TypeScript, Docker, Redis, and security hardening are the what. The AI-assisted workflow is the how. By the end of Week 3, you'll have built a production-grade task management system called FlowBoard, and you'll have done it the way Stratpoint engineers do: with AI as a collaborator, not a crutch.

**What This Handbook Is**

This is a self-paced trainee handbook. There is no live instructor. You set your own pace within the 3-week structure. Every concept has a walkthrough you follow step by step, followed by exercises you complete on your own. The AI tool you use is your pair programmer — it's built into the workflow, not optional.

## **What You'll Build**

FlowBoard is a real-world task management API. It's not a toy — it runs in Docker containers, persists data to PostgreSQL via Prisma, uses Redis for rate limiting and event streams, authenticates users with JWT, processes background jobs with a worker service, and meets OWASP security standards before it ships.

By Day 21, your FlowBoard will include:

* A TypeScript Express API with full CRUD for tasks and boards

* JWT authentication with refresh token rotation

* Redis-backed rate limiting and session management

* A background worker that processes async job queues

* Integration tests with 80%+ coverage

* Docker Compose orchestrating all services

* A passed Security Gate — your trainer signs off that it meets production standards

## **The AI-Assisted Workflow**

Every task in this program follows the same four-step pattern. Memorise it now — you'll use it hundreds of times.

| Step | What You Do | Example |
| :---- | :---- | :---- |
| Explore | Understand the problem before writing any code. Ask the AI to explain, diagram, or walk through the concept. | "Explain how Redis Streams work and when I'd use them over a pub/sub model." |
| Plan | Generate a concrete plan. Ask the AI to outline the implementation approach before touching your editor. | "Plan the implementation of a rate limiter middleware using Redis. Give me file names, functions, and data shapes." |
| Act | Write the code — with AI assistance. Prompt specifically; always review what the AI generates before accepting. | "Generate the Redis rate limiter middleware for Express. Use ioredis and limit to 100 requests per 15 minutes per IP." |
| Verify | Test it. Run your tests, check edge cases, review security. Ask AI to review what you built. | "Review this middleware for security issues. What happens if Redis is down? What about IP spoofing via X-Forwarded-For?" |

**The Rule**

Never copy-paste AI output without reading it. The AI will write confident-sounding code that has bugs, missing edge cases, or security holes. Your job is to understand what it generates, catch the problems, and ship code you can explain and defend.

# **2\. Program Overview**

Part 2 runs over 3 weeks — 15 working days. Here's how the weeks break down:

| Week | Theme | Days | What You'll Build |
| :---- | :---- | :---- | :---- |
| Week 1 | Foundation | Days 1–5 | Dev environment, TypeScript setup, Docker Compose stack, first typed API route |
| Week 2 | Core Features | Days 6–10 | Redis integration, JWT auth, background worker, integration tests |
| Week 3 | Security & Ship | Days 11–15 | OWASP hardening, production patterns, Security Gate (Day 15), Demo |

## **How Each Day Works**

Every day follows the same rhythm. There's no fixed clock — self-paced means you move at your speed — but each day's content is designed to fit in roughly 4–6 hours of focused work.

* Concept walkthrough — read and follow the step-by-step guide in this handbook

* Guided lab — follow the worked example exactly; type the code, don't copy-paste

* Independent exercise — apply the concept on your own, FlowBoard context

* Commit and push — every day's work goes into your FlowBoard repo

**Type, Don't Paste**

When this handbook shows code examples, type them. Your hands and brain learn together. Copy-paste is for production shortcuts — not for training. The only exception is long boilerplate blocks marked '(copy this block).'

# **3\. Before You Start — Pre-Work Checklist**

Complete all of these before Day 1\. If you haven't done Part 1 yet, do that first.

## **3.1 Tools to Install**

* Docker Desktop installed and running (docker \--version returns output)

* Node.js 22 or 24 active via nvm (nvm use 22 or nvm use 24 — whichever you set up in Part 1\)

* Git configured with your name and email (git config \--list)

* Code editor with AI assistant support installed

* AI coding assistant configured and ready to use

* Postman or Bruno installed for API testing

## **3.2 Knowledge to Review**

You should be comfortable with these from Part 1 before starting. If you're rusty, spend a day reviewing Part 1 modules first.

* async/await — you can write and debug async functions without help

* Express — you can create routes, middleware, and handle errors

* Prisma — you can define a schema, run migrations, and query the database

* Jest — you can write and run basic unit and integration tests

* Git — you commit, push, branch, and PR without looking up syntax

## **3.3 Reading (Do This Before Day 1\)**

* TypeScript Handbook: Basics and Everyday Types (typescriptlang.org/docs)

* TypeScript Handbook: Interfaces and Type Aliases

* Docker: Get Started guide — Parts 1 and 2 (docs.docker.com)

* OWASP Top 10 overview — read the summary descriptions (owasp.org/Top10)

## **3.4 Repository Setup**

Your trainer will provide a link to the [FlowBoard project brief](https://docs.google.com/document/d/1KS4DRIAyf20x2x2tJnYSktkEGz-5ii4d/edit). Create your own FlowBoard repository from scratch on your GitHub account, clone it locally, and make sure to share access to your repository with your trainer.

\# Clone your repository

git clone https\://github.com/YOUR\_USERNAME/flowboard.git

cd flowboard

 

\# Verify the structure

ls \-la

\# You should see: api/  worker/  docker-compose.yml  ai-context  README.md

* FlowBoard repository created from scratch, shared with trainer, and cloned locally

* docker compose up runs without errors (services start, even if some exit)

# **4\. Week 1 — Foundation**

Week 1 is about getting comfortable in the new environment. By Friday you'll have a running Docker stack, TypeScript configured, and your first typed API route committed.

## **Day 1 — Your Environment and the AI Workflow**

**Today's Goal**

By end of Day 1: Docker stack is running, your AI context file is configured, and you've completed your first Explore→Plan→Act→Verify cycle on a simple task.

### **Understanding the Docker Stack**

FlowBoard runs as a set of Docker containers defined in docker-compose.yml. Open that file and read it. You'll see services for the API, the Worker, PostgreSQL, Redis, and Nginx. Each runs in its own container, and they communicate over a shared Docker network.

\# Start all services

docker compose up \-d

 

\# Check what's running

docker compose ps

 

\# Watch the API logs

docker compose logs \-f api

 

\# Stop everything

docker compose down

If a container exits immediately, read its logs. Error messages in container logs are almost always diagnostic — they tell you exactly what went wrong.

### **Setting Up Your AI Context File**

Most AI coding assistants support a project-level context file that lives at the root of your repo. This file tells the AI about your tech stack, conventions, and rules — so it generates relevant, consistent code instead of generic output. The starter repo includes one for your tool. Open it, review what's there, and add to it throughout the program.

**Why the AI Context File Matters**

Without context, the AI generates generic code. With a well-written context file, it knows: the tech stack, the error-handling pattern, the naming conventions, and the security rules. The difference in output quality is significant. A senior engineer spends time on this file — now you understand why.

The starter context file includes the tech stack and project structure. On Day 1, add these rules to yours:

\# AI context file (add to the existing file)

 

\#\# Error Handling

\- All async route handlers use try/catch

\- Errors passed to next(err) — never res.send() in catch blocks

\- HTTP errors use our AppError class (src/errors/AppError.ts)

 

\#\# TypeScript Rules

\- Strict mode is on — no implicit any

\- All function parameters and return types are annotated

\- Prefer interfaces for object shapes, type aliases for unions/intersections

 

\#\# Response Format

\- Success: { success: true, data: ... }

\- Error: { success: false, message: '...', code: '...' }

### **Your First Explore→Plan→Act→Verify Cycle**

Let's walk through the workflow on a real task: understanding what AppError is and how it fits the codebase.

**AI Prompt: Explore**

*I'm starting Part 2 of a Node.js training program. The project is FlowBoard — a task management API.*

*It uses TypeScript, Express, Prisma, Docker, and Redis. I need to understand how error handling*

*works. Read this pattern: all errors extend a custom AppError class and are passed to next(err).*

*Explain why this is better than try/catch \+ res.status().json() in each route handler.*

**AI Prompt: Plan**

*Plan the implementation of the AppError class for FlowBoard. It should:*

*\- Extend the built-in Error class*

*\- Accept a message, HTTP status code, and an optional error code string*

*\- Be usable as: throw new AppError('Task not found', 404, 'TASK\_NOT\_FOUND')*

*Give me the file path, the full TypeScript interface, and the class implementation plan.*

**AI Prompt: Act**

*Generate the complete AppError.ts file for FlowBoard. Place it at src/errors/AppError.ts.*

*Include the class, a type guard function (isAppError), and a globalErrorHandler Express*

*middleware that converts AppError instances to JSON responses using our standard format:*

*{ success: false, message: '...', code: '...' }*

**AI Prompt: Verify**

*Review the AppError class and globalErrorHandler I just generated.*

*What edge cases does it miss? What happens when a non-AppError is thrown — like a Prisma*

*error or a TypeError? How should the handler distinguish between them in production?*

**Exercise: Day 1 — Environment Checkpoint**

Complete all of the following and commit the result:

 

1\. docker compose ps shows all services running (or you've diagnosed and fixed any that aren't)

2\. Your AI context file is updated with the error handling and TypeScript rules above

3\. src/errors/AppError.ts exists and compiles without errors (npx tsc \--noEmit)

4\. The global error handler is wired into app.ts as the last middleware

 

Commit message: 'day-01: environment setup, AppError, global error handler'

 

Push to your repository: git push origin main

## **Day 2 — TypeScript in Practice**

**Today's Goal**

By end of Day 2: You can write typed Express route handlers, typed Prisma queries, and Zod validation schemas. No implicit any anywhere in your routes.

### **Why TypeScript Changes How You Write Express**

In Part 1, your route handlers looked like this:

// Part 1 style — no types

app.get('/tasks/:id', async (req, res) \=\> {

  const task \= await prisma.task.findUnique({ where: { id: req.params.id } });

  res.json(task);

});

TypeScript forces you to be explicit. The compiler needs to know what req.body contains, what the handler returns, and what types flow through your middleware. This is what the same handler looks like in strict TypeScript:

// Part 2 style — explicit types

import { Request, Response, NextFunction } from 'express';

import { z } from 'zod';

 

const TaskIdParam \= z.object({ id: z.string().uuid() });

 

export const getTask \= async (

  req: Request\<z.infer\<typeof TaskIdParam\>\>,

  res: Response,

  next: NextFunction

): Promise\<void\> \=\> {

  try {

    const { id } \= TaskIdParam.parse(req.params);

    const task \= await prisma.task.findUnique({ where: { id } });

    if (\!task) throw new AppError('Task not found', 404, 'TASK\_NOT\_FOUND');

    res.json({ success: true, data: task });

  } catch (err) {

    next(err);

  }

};

Notice what changed: the param type is validated at runtime with Zod and inferred at compile time by TypeScript. The error goes to next(err) so your global handler deals with it. The response shape is always { success, data }.

### **Zod: Runtime Validation That Generates TypeScript Types**

Zod is the validation library you'll use everywhere in FlowBoard. It's different from joi or express-validator because it generates TypeScript types automatically — you write the schema once and get both validation and types.

import { z } from 'zod';

 

// Define the schema

const CreateTaskSchema \= z.object({

  title: z.string().min(1).max(255),

  description: z.string().optional(),

  priority: z.enum(\['LOW', 'MEDIUM', 'HIGH'\]).default('MEDIUM'),

  boardId: z.string().uuid(),

});

 

// Get the TypeScript type from the schema — no duplication

type CreateTaskInput \= z.infer\<typeof CreateTaskSchema\>;

 

// Use it in a handler

const body: CreateTaskInput \= CreateTaskSchema.parse(req.body);

// If req.body doesn't match, Zod throws a ZodError — catch it in your global handler

**Exercise: Day 2 — Typed Routes**

In src/routes/tasks.ts, implement the following using the patterns above:

 

1\. GET /tasks/:id — fetch a single task by UUID; return 404 if not found

2\. POST /tasks — create a task; validate body with a Zod schema (title, description, priority, boardId)

3\. PATCH /tasks/:id — update title or priority only; all fields optional in Zod schema

4\. DELETE /tasks/:id — delete a task; return 204 No Content

 

All handlers must:

  \- Use typed Request params/body via Zod inference

  \- Pass errors to next(err) — no res.status().json() in catch blocks

  \- Return { success: true, data: ... } on success

 

Run npx tsc \--noEmit — fix all type errors before committing.

Commit: 'day-02: typed task routes with Zod validation'

## **Day 3 — Prisma with TypeScript**

**Today's Goal**

By end of Day 3: Your Prisma schema defines the full FlowBoard data model, migrations run cleanly, and you're using the Prisma Client with TypeScript types — not raw SQL, not any casts.

### **The FlowBoard Data Model**

FlowBoard has four main entities: User, Board, Task, and AuditLog. Here's the Prisma schema you'll be working with:

// prisma/schema.prisma

generator client {

  provider \= 'prisma-client-js'

}

 

datasource db {

  provider \= 'postgresql'

  url      \= env('DATABASE\_URL')

}

 

model User {

  id        String   @id @default(uuid())

  email     String   @unique

  password  String

  createdAt DateTime @default(now())

  boards    Board\[\]

  auditLogs AuditLog\[\]

}

 

model Board {

  id        String   @id @default(uuid())

  name      String

  ownerId   String

  owner     User     @relation(fields: \[ownerId\], references: \[id\])

  tasks     Task\[\]

  createdAt DateTime @default(now())

}

 

model Task {

  id          String     @id @default(uuid())

  title       String

  description String?

  status      TaskStatus @default(TODO)

  priority    Priority   @default(MEDIUM)

  boardId     String

  board       Board      @relation(fields: \[boardId\], references: \[id\])

  createdAt   DateTime   @default(now())

  updatedAt   DateTime   @updatedAt

}

 

model AuditLog {

  id        String   @id @default(uuid())

  userId    String

  user      User     @relation(fields: \[userId\], references: \[id\])

  action    String

  entity    String

  entityId  String

  createdAt DateTime @default(now())

}

 

enum TaskStatus { TODO IN\_PROGRESS REVIEW DONE }

enum Priority   { LOW MEDIUM HIGH }

Once your schema is in place, run these commands inside the API container:

\# Run a migration — creates the tables in PostgreSQL

docker compose exec api npx prisma migrate dev \--name init

 

\# Generate the Prisma Client (TypeScript types included)

docker compose exec api npx prisma generate

 

\# Open Prisma Studio to browse data visually (optional)

docker compose exec api npx prisma studio

**Exercise: Day 3 — Prisma Schema and Seed**

1\. Add the schema above to prisma/schema.prisma

2\. Run the migration and confirm it succeeds (no errors in output)

3\. Create prisma/seed.ts that inserts:

   \- 1 test user (email: dev@flowboard.test, password: can be a placeholder)

   \- 2 boards owned by that user

   \- 3 tasks on the first board

4\. Run the seed: docker compose exec api npx ts-node prisma/seed.ts

5\. Open Prisma Studio and verify all records exist

 

AI Prompt to try in the Act step:

  'Generate a Prisma seed file for FlowBoard. Insert 1 user, 2 boards, 3 tasks.

   Use bcrypt to hash the user password. TypeScript, Prisma Client, async/await.'

 

Review what it generates — does it handle errors if seed runs twice?

Commit: 'day-03: prisma schema, migration, seed data'

## **Days 4–5 — Full API with Auth Foundation**

**Days 4-5 Goal**

By end of Day 5: All task and board CRUD routes are implemented and tested manually. Basic JWT auth is in place — register and login endpoints return tokens, and a protected route middleware validates them.

Days 4 and 5 are connected — you'll build out the full route layer and wire up authentication. The detailed walkthroughs live in the supplementary module docs (Module W1-D4 and W1-D5) in your training materials folder. Use this handbook as the map; use the module docs for the step-by-step details.

### **Day 4 Targets**

* Boards CRUD: GET /boards, POST /boards, GET /boards/:id, DELETE /boards/:id

* Tasks CRUD complete: all four endpoints from Day 2 wired to router and tested in Postman

* Global error handler tested — throw a 404 and confirm the response shape is correct

### **Day 5 Targets**

* POST /auth/register — hash password with bcrypt, create user, return JWT access \+ refresh tokens

* POST /auth/login — verify password, return tokens

* authenticate middleware — verify JWT on protected routes, attach user to req

* Protect all board and task routes — unauthenticated requests return 401

**Exercise: Week 1 Commit Checklist**

Before moving to Week 2, confirm all of the following are committed and pushed:

 

\[ \] docker compose up starts all services without manual fixes

\[ \] npx tsc \--noEmit passes with zero errors

\[ \] All task routes respond correctly in Postman

\[ \] All board routes respond correctly in Postman

\[ \] Register and Login return JWT tokens

\[ \] A protected route returns 401 without a valid token

\[ \] AuditLog records are created on task create/update/delete

 

Week 1 final commit: 'week-01 complete: API, auth foundation, Prisma schema'

# **5\. Week 2 — Core Features**

Week 2 layers in the infrastructure that makes FlowBoard production-ready: Redis for speed and event streaming, background job processing, and a test suite that actually catches regressions.

## **Day 6 — Redis: Rate Limiting and Sessions**

**Today's Goal**

By end of Day 6: Redis is integrated. Unauthenticated endpoints are rate-limited. Sessions use Redis-backed storage instead of in-memory.

### **What Redis Is Doing in FlowBoard**

Redis is an in-memory data store — think of it as a super-fast key-value database that lives in RAM. FlowBoard uses it for three things:

* Rate limiting — track how many requests an IP has made in the last 15 minutes

* Session storage — store refresh token metadata so we can revoke sessions

* Event streaming — publish task events to a Redis Stream that the Worker consumes

Your Docker Compose already has a Redis container. Connect to it from the API using ioredis:

// src/lib/redis.ts

import Redis from 'ioredis';

 

const redis \= new Redis({

  host: process.env.REDIS\_HOST ?? 'redis',

  port: Number(process.env.REDIS\_PORT) ?? 6379,

});

 

redis.on('error', (err) \=\> console.error('Redis error:', err));

 

export default redis;

### **Building a Rate Limiter Middleware**

A rate limiter checks: 'Has this IP made too many requests in the past N minutes?' If yes, return 429 Too Many Requests. Here's how it works with Redis:

// src/middleware/rateLimiter.ts

import { Request, Response, NextFunction } from 'express';

import redis from '../lib/redis';

import { AppError } from '../errors/AppError';

 

const WINDOW\_SECONDS \= 15 \* 60;  // 15 minutes

const MAX\_REQUESTS \= 100;

 

export const rateLimiter \= async (req: Request, res: Response, next: NextFunction) \=\> {

  const ip \= req.ip ?? 'unknown';

  const key \= \`rate:\${ip}\`;

 

  const count \= await redis.incr(key);

 

  if (count \=== 1\) {

    await redis.expire(key, WINDOW\_SECONDS);

  }

 

  if (count \> MAX\_REQUESTS) {

    throw new AppError('Too many requests', 429, 'RATE\_LIMIT\_EXCEEDED');

  }

 

  next();

};

**Exercise: Day 6 — Redis Integration**

1\. Create src/lib/redis.ts with the ioredis client above

2\. Implement the rate limiter middleware

3\. Apply rateLimiter to POST /auth/login and POST /auth/register only

4\. Test it: send 101 requests to /auth/login and confirm request 101 returns 429

   (Use a loop in Postman Collection Runner or a simple bash script)

 

Verify prompt — ask your AI:

  'What happens in this rateLimiter if Redis is down? Will it block all traffic or fail open?

   What's the safer production behavior and how do I implement it?'

 

Implement the fix based on the AI's answer.

Commit: 'day-06: Redis client, rate limiter middleware'

## **Day 7 — JWT: Refresh Tokens and Token Rotation**

**Today's Goal**

By end of Day 7: Access tokens expire in 15 minutes. Refresh tokens are stored in Redis and rotate on every use — old refresh tokens are invalidated immediately.

The token system you built on Day 5 is a starting point. Production JWT auth needs refresh token rotation — when a user exchanges their refresh token for a new access token, the old refresh token is immediately invalidated and a new one is issued. This limits the damage if a refresh token is stolen.

**AI Prompt: Plan — Refresh Token Rotation**

*I need to implement refresh token rotation for FlowBoard's JWT auth.*

*The system has: accessToken (15 min expiry) and refreshToken (7 day expiry).*

*Refresh tokens are stored in Redis with the key 'refresh:{userId}:{tokenId}'.*

 

*Plan the full flow for POST /auth/refresh:*

*1\. Validate the incoming refresh token (JWT verify)*

*2\. Check it exists in Redis*

*3\. Delete the old token from Redis*

*4\. Issue new access token \+ new refresh token*

*5\. Store the new refresh token in Redis*

*6\. Return both tokens*

 

*What happens if the same refresh token is used twice? (Replay attack)*

**Exercise: Day 7 — Token Rotation**

Implement POST /auth/refresh based on the plan above:

 

1\. Validate the incoming refresh token with jsonwebtoken

2\. Check Redis for the token — 401 if not found

3\. Delete the old token key from Redis (DEL command)

4\. Generate new accessToken and refreshToken (new UUID for token ID)

5\. Store new refresh token in Redis with 7-day TTL

6\. Return { success: true, data: { accessToken, refreshToken } }

 

Also implement POST /auth/logout:

  \- Delete the refresh token from Redis

  \- Return 204 No Content

 

Test the replay attack manually: use the same refresh token twice.

The second request should return 401\.

Commit: 'day-07: refresh token rotation, logout endpoint'

## **Day 8 — Background Worker with Redis Streams**

**Today's Goal**

By end of Day 8: When a task changes status, an event is published to a Redis Stream. The Worker service consumes it and writes an AuditLog entry.

Some work shouldn't block an HTTP response. When a user updates a task, they shouldn't wait for the audit log write, email notification, or metrics update. That's what background workers are for — they consume events asynchronously.

FlowBoard uses Redis Streams for this. The API publishes an event when a task changes; the Worker (a separate Docker container) reads from the stream and processes it.

// In the API — publish a task event

// src/lib/events.ts

import redis from './redis';

 

interface TaskEvent {

  taskId: string;

  action: 'CREATED' \| 'UPDATED' \| 'DELETED';

  userId: string;

  payload: Record\<string, unknown\>;

}

 

export const publishTaskEvent \= async (event: TaskEvent): Promise\<void\> \=\> {

  await redis.xadd(

    'tasks:events',

    '\*',                          // auto-generate stream ID

    'action',  event.action,

    'taskId',  event.taskId,

    'userId',  event.userId,

    'payload', JSON.stringify(event.payload),

    'ts',      Date.now().toString()

  );

};

**Exercise: Day 8 — Worker Integration**

Part A — API side:

  1\. Create src/lib/events.ts with publishTaskEvent above

  2\. Call publishTaskEvent after every task create, update, and delete

  3\. Confirm events appear in Redis: docker compose exec redis redis-cli XLEN tasks:events

 

Part B — Worker side (worker/ directory):

  1\. Create worker/src/index.ts with a consumer loop using XREADGROUP

  2\. The consumer group is 'audit-group', consumer name is 'worker-1'

  3\. On each event: write an AuditLog record to PostgreSQL using Prisma

  4\. Acknowledge the message with XACK after successful processing

 

AI Prompt for Plan step:

  'Plan a Redis Streams consumer in TypeScript that reads from tasks:events using

   XREADGROUP. Include: creating the consumer group if it doesn't exist, reading in

   batches of 10, processing each message, acknowledging with XACK, and handling

   failed messages (what goes in the dead-letter queue?).'

 

Commit: 'day-08: Redis Stream events, worker consumer, AuditLog integration'

## **Days 9–10 — Tests and Mid-Point Review**

**Days 9-10 Goal**

By end of Day 10: Integration test suite runs in CI (docker compose exec api npx jest). Coverage is above 80%. Every endpoint has at least one happy-path and one error-path test.

Day 9 is test writing day. Day 10 is mid-point review day — review everything from Week 1 and 2, fix gaps, and confirm your Week 2 checklist before entering Week 3\.

### **Integration Test Pattern**

Your tests use Jest and Supertest, the same as Part 1 — but now against a running PostgreSQL \+ Redis stack. The test suite uses a separate test database, reset between test files.

// tests/tasks.test.ts

import request from 'supertest';

import app from '../src/app';

import { prisma } from '../src/lib/prisma';

 

let authToken: string;

 

beforeAll(async () \=\> {

  // Register and get a token for authenticated requests

  const res \= await request(app).post('/auth/register').send({

    email: 'test@flowboard.test',

    password: 'TestPass123\!',

  });

  authToken \= res.body.data.accessToken;

});

 

afterAll(async () \=\> {

  await prisma.\$disconnect();

});

 

describe('POST /tasks', () \=\> {

  it('creates a task with valid data', async () \=\> {

    const res \= await request(app)

      .post('/tasks')

      .set('Authorization', \`Bearer \${authToken}\`)

      .send({ title: 'Test Task', priority: 'HIGH', boardId: 'some-uuid' });

    expect(res.status).toBe(201);

    expect(res.body.success).toBe(true);

    expect(res.body.data.title).toBe('Test Task');

  });

 

  it('returns 422 when title is missing', async () \=\> {

    const res \= await request(app)

      .post('/tasks')

      .set('Authorization', \`Bearer \${authToken}\`)

      .send({ priority: 'HIGH', boardId: 'some-uuid' });

    expect(res.status).toBe(422);

    expect(res.body.success).toBe(false);

  });

});

**Exercise: Week 2 Test Checklist**

Write tests for all of the following. Aim for at least 2 tests per endpoint (happy \+ error):

 

\[ \] POST /auth/register — success \+ duplicate email

\[ \] POST /auth/login — success \+ wrong password

\[ \] POST /auth/refresh — success \+ expired/used token

\[ \] GET /tasks/:id — success \+ 404

\[ \] POST /tasks — success \+ validation error

\[ \] PATCH /tasks/:id — success \+ unauthorized (different user's task)

\[ \] DELETE /tasks/:id — success \+ 404

\[ \] Rate limiter — confirm 429 after limit exceeded

 

Coverage check:

docker compose exec api npx jest \--coverage

Coverage must be \>= 80% on lines and branches.

 

Commit: 'week-02 complete: Redis, worker, auth hardening, test suite'

# **6\. Week 3 — Security and Ship**

Week 3 is where you harden FlowBoard for production. You'll work through the OWASP Top 10 as it applies to your API, implement security middleware, add observability, and prepare for the Security Gate on Day 15\.

## **Days 11–12 — OWASP Hardening**

**Days 11-12 Goal**

By end of Day 12: FlowBoard has protections against the most common API vulnerabilities. Helmet headers are set, input is sanitized, SQL injection is impossible by design, and mass assignment is prevented.

The OWASP Top 10 is a list of the most critical web application security risks. You read the overview during pre-work. Now you apply it. Here's how the most relevant ones apply to FlowBoard:

| OWASP Risk | How It Applies to FlowBoard | Your Defense |
| :---- | :---- | :---- |
| A01 Broken Access Control | User A can modify User B's tasks | Ownership checks in every route: task.userId \=== req.user.id |
| A02 Cryptographic Failures | Passwords stored in plaintext | bcrypt with cost factor 12+; no passwords in logs |
| A03 Injection | SQL injection via task title | Prisma parameterizes all queries — can't happen by design |
| A04 Insecure Design | Refresh token never expires | TTL on all Redis keys; token rotation on every use |
| A05 Security Misconfiguration | CORS allows all origins, debug stack traces in prod | Helmet middleware; strict CORS config; NODE\_ENV checks |
| A07 Identification & Auth Failures | Brute-force login | Rate limiter on /auth/login; account lockout after N failures |
| A08 Software and Data Integrity | Mass assignment via req.body | Explicit field whitelisting in Zod schemas — never spread req.body directly |

### **Security Middleware Stack**

Add these to app.ts, in order, before your routes:

import helmet from 'helmet';

import cors from 'cors';

import express from 'express';

 

const app \= express();

 

// Security headers

app.use(helmet());

 

// CORS — restrict to known origins

app.use(cors({

  origin: process.env.ALLOWED\_ORIGINS?.split(',') ?? \['http\://localhost:3000'\],

  credentials: true,

}));

 

// Body size limit — prevent large payload DoS

app.use(express.json({ limit: '10kb' }));

 

// Trust proxy headers for rate limiter IP detection (if behind Nginx)

app.set('trust proxy', 1);

**Exercise: Days 11-12 — OWASP Audit**

Work through each OWASP risk in the table above and confirm your fix is in place:

 

Day 11:

\[ \] Ownership checks: try to PATCH another user's task with a valid token — confirm 403

\[ \] Helmet installed and headers visible in Postman (X-Content-Type-Options etc.)

\[ \] CORS restricted — test from an unexpected origin

\[ \] Body size limit — send a 15kb payload, confirm 413

 

Day 12:

\[ \] Brute-force protection: 10 failed logins in 1 minute triggers lockout or heavy throttling

\[ \] Mass assignment: POST /tasks with extra fields (isAdmin: true) — confirm they're ignored

\[ \] No stack traces in error responses when NODE\_ENV=production

\[ \] All tokens have TTLs — check Redis TTL values: redis-cli TTL 'refresh:\*'

 

Commit: 'days-11-12: OWASP hardening, Helmet, CORS, ownership checks'

## **Days 13–14 — Production Patterns**

**Days 13-14 Goal**

By end of Day 14: Structured logs are in place, health check endpoints exist, and Nginx reverse-proxies to your API. Dead-letter queue handling is implemented in the Worker.

### **Structured Logging with Pino**

console.log is not production logging. In production you need structured, searchable logs with log levels, request IDs, and no sensitive data. FlowBoard uses Pino.

// src/lib/logger.ts

import pino from 'pino';

 

const logger \= pino({

  level: process.env.LOG\_LEVEL ?? 'info',

  redact: \['req.headers.authorization', 'body.password', 'body.token'\],

  transport: process.env.NODE\_ENV \=== 'development'

    ? { target: 'pino-pretty' }

    : undefined,

});

 

export default logger;

### **Health Check Endpoints**

Any serious API has health and readiness endpoints. Load balancers and monitoring tools hit them to know if your service is alive.

// GET /health — basic liveness

router.get('/health', (req, res) \=\> {

  res.json({ status: 'ok', uptime: process.uptime() });

});

 

// GET /ready — checks database and Redis connectivity

router.get('/ready', async (req, res, next) \=\> {

  try {

    await prisma.\$queryRaw\`SELECT 1\`;

    await redis.ping();

    res.json({ status: 'ready', db: 'ok', redis: 'ok' });

  } catch (err) {

    next(new AppError('Service not ready', 503, 'NOT\_READY'));

  }

});

**Exercise: Days 13-14 — Production Patterns**

Day 13:

\[ \] Install pino and pino-pretty; create src/lib/logger.ts

\[ \] Replace all console.log calls with logger.info / logger.error

\[ \] Add pino-http middleware to log every request (method, path, status, duration)

\[ \] Verify that Authorization headers and passwords are redacted in logs

 

Day 14:

\[ \] Implement GET /health and GET /ready

\[ \] Test /ready when Redis is stopped — should return 503, not 500

\[ \] Implement dead-letter handling in the Worker: if an event fails 3 times,

    write it to a separate Redis key 'tasks:events:dlq' instead of dropping it

\[ \] Document the DLQ key format in your AI context file

 

Commit: 'days-13-14: Pino logging, health checks, Nginx config, DLQ handling'

## **Day 15 — Security Gate**

**This Is the Finish Line**

The Security Gate is a review where your trainer evaluates your FlowBoard against a checklist. You cannot pass it by guessing — you need to know what you built and why every decision was made. Review your code, your tests, and your AI context file the day before.

Before your Security Gate session, self-review using this checklist. If any item is unchecked, fix it first.

### **Security Gate Self-Review Checklist**

**Authentication and Authorization**

* JWT access tokens expire in 15 minutes

* Refresh tokens are stored in Redis with 7-day TTL

* Refresh token rotation is implemented — reuse triggers 401

* All task and board routes require authentication

* Ownership is enforced — a user cannot modify another user's resources

* POST /auth/logout deletes the refresh token from Redis

**Input Validation and Injection Prevention**

* Every route that accepts body input has a Zod schema

* Path params (IDs) are validated as UUIDs

* No raw SQL — all queries go through Prisma parameterized client

* req.body is never spread directly into Prisma — fields are explicitly selected

**Infrastructure Security**

* Helmet middleware is applied to all responses

* CORS is restricted to allowed origins

* Request body size is limited (10kb)

* Rate limiter is on auth endpoints

* No stack traces in error responses when NODE\_ENV=production

**Code Quality and Tests**

* npx tsc \--noEmit passes with zero errors

* npx jest \--coverage shows \>= 80% on lines and branches

* Every endpoint has at least one happy-path and one error-path test

* No TODO comments left in production code paths

* Structured logs in place — no sensitive data in log output

**Worker and Events**

* Worker consumes from tasks:events Redis Stream

* Worker writes AuditLog on every task event

* Failed messages go to the dead-letter queue after 3 retries

* XACK is called after every successful message processing

**Observability**

* GET /health returns 200 when the service is alive

* GET /ready checks DB and Redis; returns 503 if either is down

* Every request is logged with method, path, status, and duration

**After the Gate**

Once your trainer signs off on the Security Gate, you've completed Part 2\. Your FlowBoard repository is a real portfolio artifact — a typed, containerized, security-hardened API with background workers, audit logging, and test coverage. You built it with AI assistance, which means you also know how to evaluate, prompt, and verify AI-generated code.

# **7\. AI Prompting Reference**

Good AI prompts have three things: context, specificity, and constraints. Here are the patterns you'll use most in Part 2\.

| Pattern | When to Use | Example |
| :---- | :---- | :---- |
| Context \+ Task | Generating new code for a known pattern | I'm building FlowBoard (Express, TypeScript strict, Prisma, Redis). Generate a Zod schema for creating a task. Fields: title (string, 1-255), priority (LOW/MEDIUM/HIGH enum, default MEDIUM), boardId (UUID). |
| Review \+ Critique | After generating code — Verify step | Review this TypeScript middleware for security issues. What edge cases does it miss? What happens if Redis is unreachable? |
| Explain \+ Analogy | Explore step — understanding before building | Explain how Redis XREADGROUP works. Use an analogy. What's the difference between reading from a stream vs a pub/sub channel? |
| Debug \+ Fix | When something isn't working | This Prisma query throws: 'Unknown field'. Here's the query and the schema. What's wrong and how do I fix it? |
| Refactor | Improving code you already wrote | Refactor this Express route to separate the controller logic from the route definition. Follow the repository pattern. |

**Prompting Anti-Patterns**

These prompts produce low-quality output:

  \- 'Build me a REST API' — too vague; no context, no constraints

  \- 'Fix my code' — paste code without explaining what's wrong or what you expected

  \- 'Make it better' — no definition of better

  \- Accepting the first output without a Verify step

# **8\. What Comes Next**

Completing Part 2 means you can build and ship production-grade Node.js services with AI assistance. That's the baseline for senior-grade delivery at Stratpoint. Here's where your skills go from here:

* GraphQL APIs — FlowBoard's REST layer can be extended or replaced with a GraphQL schema

* Kubernetes — the Docker Compose stack maps directly to Kubernetes manifests; the concepts transfer

* Observability — add Prometheus metrics and Grafana dashboards to FlowBoard's /metrics endpoint

* AI Agents — MCP (Model Context Protocol) lets you build agents that interact with your own API

* Module 6 (AI Customization) — you now have real context for why AI context files and custom instructions matter

Your FlowBoard repository is a portfolio piece. Keep it updated, add features you're curious about, and reference it in technical conversations. It represents 3 weeks of deliberate, structured work — own it.

*Good luck with the Security Gate. You've got this.*

# **Notes — Week 1**

# **Notes — Week 2**

# **Notes — Week 3 / Security Gate Prep**

*Node.js Engineering Program — Part 2: AI-Assisted Engineering*

*Stratpoint Global Outsourcing  \|  Internal Training*