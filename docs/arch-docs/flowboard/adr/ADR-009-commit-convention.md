# ADR-009: Commit message convention

- **Status:** Accepted
- **Date:** 2026-11-09
- **Epic:** EPIC-FOUNDATION

## Context

The brief requires 15 milestone commits whose messages start with an exact tag, for example `day-01: environment setup, AppError, global error handler`. The trainer checks the git history against that list.

This repo's tooling expects Conventional Commits:

- the `/commit` command writes `feat(scope): …`;
- `/scaffold` installs commitlint with `@commitlint/config-conventional`.

With that commitlint config, a `day-01: …` message is **rejected**, because `day-01` isn't a valid type.

## Decision

1. **Milestone commits** use the brief's tag and text **exactly**, in the brief's order, with one commit per tag.
2. **Every other commit** (work in progress, fixes, docs) uses Conventional Commits. Extra commits between milestones are allowed.
3. **commitlint** may be installed, but its config must accept the milestone pattern. One way is to extend `config-conventional` and add an `ignores` rule:
   ```js
   ignores: [(msg) => /^(day-\d{2}|week-0[1-3] complete):/.test(msg)];
   ```
   The simpler option is to leave commitlint out entirely (see the scaffold notes). Husky with lint-staged, which runs lint and format checks before each commit, is fine either way.
4. **No backdating.** The compressed schedule puts about 2 milestone commits on each day (OQ-3).

## Consequences

- **`/commit` needs guidance:** the `/commit` command has to be told when a commit is a milestone. The AI context file lists the 15 tags.

## Milestone tags (from brief §4)

| #   | Tag                                                                           | 7-day plan day |
| --- | ----------------------------------------------------------------------------- | -------------- |
| 1   | `day-01: environment setup, AppError, global error handler`                   | 1              |
| 2   | `day-02: typed task routes with Zod validation`                               | 2              |
| 3   | `day-03: prisma schema, migration, seed data`                                 | 2              |
| 4   | `day-04: boards CRUD, full route layer`                                       | 3              |
| 5   | `week-01 complete: API, auth foundation, Prisma schema`                       | 3              |
| 6   | `day-06: Redis client, rate limiter middleware`                               | 4              |
| 7   | `day-07: refresh token rotation, logout endpoint`                             | 4              |
| 8   | `day-08: Redis Stream events, worker consumer, AuditLog integration`          | 5              |
| 9   | `day-09: integration test suite`                                              | 6              |
| 10  | `week-02 complete: Redis, worker, auth hardening, test suite`                 | 6              |
| 11  | `day-11: Helmet, CORS, ownership checks`                                      | 6              |
| 12  | `day-12: brute-force protection, mass assignment prevention`                  | 6              |
| 13  | `day-13: Pino structured logging`                                             | 7              |
| 14  | `day-14: health checks, DLQ documentation`                                    | 7              |
| 15  | `week-03 complete: OWASP hardening, production patterns, Security Gate ready` | 7              |

**Ordering conflict:** `day-02` (typed task routes) comes before `day-03` (Prisma schema) in the brief. The routes need Prisma types to compile, so on plan Day 2 the schema is built first and committed with `day-02`, and the seed and migration verification are committed as `day-03`. The `init` migration also lands with `day-02`, because the `day-02` integration tests need its tables; `day-03` verifies it on a fresh clone. The tag order in the history stays the brief's order.
