# Retro: day-08, Redis Stream events, worker consumer, AuditLog integration

## What changed

- `lib/events.ts`: `publishTaskEvent({ action, taskId, userId, payload })` runs `XADD tasks:events` with the ARCH §9.3 fields. It catches its own error and logs it at `error`, so a Redis outage never fails a task request (ADR-005).
- Task create, update and delete publish after the Prisma write. The `$transaction` and `lib/audit.ts` are gone, and DELETE sends the `getOwnedTask` snapshot from before the delete.
- `GET /audit-logs` (FR-L1, OQ-4): the caller's own rows, newest first, `?limit` 1..100 (default 50).
- Worker:
  - `consumer.ts`: group setup, `XAUTOCLAIM` retries, `XREADGROUP`, and the DLQ move after `WORKER_MAX_DELIVERIES`.
  - `handlers/`: one handler per action.
  - Two Redis connections, one of them only for the blocking read.
  - Prisma client generated from `api/prisma`.
  - Graceful shutdown.
- AGENTS.md: the DLQ format is documented now (AC-6.6), ahead of day-14.

## Non-obvious constraints found during PLAN, APPLY and VALIDATE

1. **Prisma generates the client next to the schema's folder, not the caller's.** Running `prisma generate --schema ../api/prisma/schema.prisma` from `worker/` would write into `api/node_modules`. The worker's `prisma:generate` script and its Dockerfile copy the schema into `worker/prisma/` (git-ignored) first.
2. **The consumer group can disappear while the worker runs.** Redis has no volume, so a recreated container or a `FLUSHALL` drops the stream and `audit-group`. The worker then looped on `NOGROUP` every second and never recovered. Meanwhile the api's next `XADD` recreated the stream, and those events were never audited. Fix: on `NOGROUP`, recreate the group from `0`, since everything in the stream arrived after the wipe. Found in VALIDATE.
3. **Prisma's default error message carries a source code frame.** The first DLQ entry's `error` field held a multi-line excerpt of `/app/src/handlers/auditLog.ts`. `errorFormat: 'minimal'` on the worker's client fixes it. Found in VALIDATE.
4. **`XAUTOCLAIM` counts as a delivery.** The `XPENDING` count read after a claim already includes the current attempt. The timeline is: read (1), claim (2), claim (3) → DLQ, about 60s with `WORKER_CLAIM_IDLE_MS=30000`.
5. **Events are lost right after a Redis restart.** A PATCH sent about 0.2s after `docker compose start redis` returned 200 with no event. With no offline queue, the api's client hadn't reconnected yet, so the `XADD` failed fast and was logged. This is the gap ADR-006 accepts, not a new bug.
6. **The API tests can no longer see AuditLog rows.** The test stack has no worker (ADR-008). Task tests now assert the `tasks:events` entries (AC-5.3), and the worker path (AC-6.x) is verified by hand on the dev stack.

## Verified live (dev stack through Nginx)

- **Worker startup:** it starts with no errors, and `XINFO GROUPS tasks:events` shows `audit-group` (AC-6.1, AC-6.2).
- **Task lifecycle:** create, PATCH and delete gave 3 stream entries, then 3 AuditLog rows (CREATED, UPDATED, DELETED), and `XPENDING` came back 0 (AC-5.3, AC-6.3, AC-6.4).
- **`GET /audit-logs?limit=3`:** returns those 3 rows, newest first (FR-L1).
- **DLQ:** I injected an event whose `userId` doesn't exist, so the AuditLog insert fails on the foreign key.
  - Deliveries 1 and 2 failed and stayed pending.
  - Delivery 3 went to `tasks:events:dlq` with the §9.3 fields, and the original was acked (AC-6.5).
- **Redis stopped:** PATCH still returned 200, and the api logged "task event not published". After Redis came back, the worker carried on and audited the next change.
- **Stream deleted under the running worker:** the group was recreated from `0`, and the pending event was audited.
- **Graceful shutdown:** on a tsx reload, "worker shutting down" then "worker stopped" 0.3s later.
- **API suite:** 155 tests pass, with 98.1% lines and 95.4% branches covered.

## Backlog

| Item                                                                  | Why deferred                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The worker has no automated tests                                     | The coverage gate (ADR-008) covers the api only. Unit tests for `consumer.ts` (reply parsing, DLQ threshold, `NOGROUP` recovery) would need Jest set up in `worker/`. Candidate for day-09.                    |
| Redis has no volume in dev                                            | Recreating the container loses the stream, the group and the refresh keys. The worker now recovers, but unaudited history and live sessions are still lost. A named volume plus AOF is a small compose change. |
| Duplicate AuditLog row if the worker dies between insert and `XACK`   | Accepted in ADR-006. The fix is a unique stream-ID column on `AuditLog`.                                                                                                                                       |
| Task change commits but its event is lost when `XADD` fails           | Accepted in ADR-006 (logged at `error`). A transactional outbox would close the gap.                                                                                                                           |
| A SIGTERM during worker startup while Redis is down waits for `ready` | Compose SIGKILLs it after 10s. Harmless, but not a clean exit.                                                                                                                                                 |
| A malformed entry takes 3 deliveries (about 60s) to reach the DLQ     | Retrying can't fix a malformed entry, but one code path is simpler and matches ADR-006 as written.                                                                                                             |
| Ownership-check vs write race (from day-02 and day-04)                | Still open. A concurrent delete now gives P2025 → 404, and no event is published.                                                                                                                              |
