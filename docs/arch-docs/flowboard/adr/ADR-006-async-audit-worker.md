# ADR-006: Audit log written asynchronously, through a Redis Streams consumer group

- **Status:** Accepted
- **Date:** 2026-11-09
- **Epic:** EPIC-EVENTS

## Context

Every task create, update and delete must produce an `AuditLog` row, and the user must not wait for that write. The brief requires:

- a Redis Stream named `tasks:events`;
- a consumer group named `audit-group`;
- `XACK` after each event is processed;
- failed messages moved to a dead-letter queue after 3 retries;
- the DLQ format documented.

## Decision

1. **The API publishes** with `publishTaskEvent({ action, taskId, userId, payload })`, which runs `XADD tasks:events * …`. It is called after the Prisma write succeeds. If the `XADD` fails, the error is logged and the API response is unaffected.
2. **The worker starts up** like this:
   - It runs `XGROUP CREATE tasks:events audit-group $ MKSTREAM` and ignores a `BUSYGROUP` error.
   - It uses `$`, so a new group starts at new messages only, which avoids replaying old history after a reset.
3. **The main loop** runs `XREADGROUP GROUP audit-group ${WORKER_CONSUMER_NAME} COUNT 10 BLOCK 5000 STREAMS tasks:events >` on a dedicated Redis connection.
   - **Dispatch:** each message goes to `handlers/task{Created|Updated|Deleted}.ts` according to its `action`.
   - **Success:** the handler inserts the `AuditLog` row, then the worker runs `XACK`.
   - **Failure:** the worker doesn't `XACK` the message, so it stays in the pending entries list.
4. **Retries:** on each loop pass, the worker first runs `XAUTOCLAIM tasks:events audit-group <consumer> ${WORKER_CLAIM_IDLE_MS} 0-0 COUNT 10`. This picks up messages that have been pending too long.
   - **Delivery count:** `XPENDING tasks:events audit-group - + 10` (the extended form) returns each message's delivery count.
   - **Count below `WORKER_MAX_DELIVERIES` (3):** process the message again.
   - **Count at 3:** if processing still fails, run `XADD tasks:events:dlq * originalId … error … deliveries … failedAt …` plus the original fields, then `XACK` the original. The full format is in ARCH §9.3.
5. **Idempotent handlers:** delivery is at-least-once, so the `AuditLog` insert can't use a natural key. For now, a duplicate row after a crash between the insert and `XACK` is accepted (see Consequences).
6. **Shutdown:** SIGTERM or SIGINT sets `stopping = true`. The worker finishes the current batch, then runs `prisma.$disconnect()` and `redis.quit()` on both connections, then exits 0. Compose's 10s stop grace covers the 5s `BLOCK`.

## Consequences

- **Gap if `XADD` fails:** a task change can exist without an audit row. The API logs the missed event at `error`, so the gap is visible. A transactional outbox would close it, but that is outside the brief.
- **Possible duplicates:** a crash between the `AuditLog` insert and `XACK` can produce a duplicate audit row. The fix, a unique stream-ID column on `AuditLog`, is backlog.
- **One consumer is enough:** a single consumer (`worker-1`) meets the brief. Consumer groups would allow scaling to more workers without code changes.

## Security Gate one-liner

> "The API writes the task, then appends an event to a stream and replies right away. The worker reads through a consumer group, writes the audit row, then ACKs. Anything that isn't ACKed stays pending, gets reclaimed and retried, and after 3 deliveries it moves to `tasks:events:dlq` so it's never silently lost."
