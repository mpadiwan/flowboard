import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { env } from './config/env';
import { AUDIT_GROUP, DEAD_LETTER_STREAM, TASK_EVENTS_STREAM, TaskEventSchema } from './events';
import { handleTaskEvent } from './handlers';
import { logger } from './lib/logger';
import { blockingRedis, redis } from './lib/redis';

// ADR-006. Each pass first retries messages left pending too long (XAUTOCLAIM), then
// blocks up to 5s for new ones (XREADGROUP). A message is XACKed only after its AuditLog
// row is written; one that still fails on its WORKER_MAX_DELIVERIES-th delivery is copied
// to tasks:events:dlq and then XACKed, so it is never silently dropped.

const BATCH_SIZE = 10;
const BLOCK_MS = 5000;
// Pause after a failed pass (Redis down, say) so the loop doesn't spin while ioredis reconnects.
const RETRY_DELAY_MS = 1000;

// ioredis types stream replies loosely, so each reply shape is parsed before use.
// An entry is [id, [field, value, field, value, ...]].
const StreamEntrySchema = z.tuple([z.string(), z.array(z.string())]);
type StreamEntry = z.infer<typeof StreamEntrySchema>;

// XREADGROUP: null on timeout, otherwise [[stream, entries]].
const ReadReplySchema = z.array(z.tuple([z.string(), z.array(StreamEntrySchema)])).nullable();

// XAUTOCLAIM (Redis 7): [next cursor, claimed entries, ids of entries trimmed from the stream].
const AutoclaimReplySchema = z.tuple([z.string(), z.array(StreamEntrySchema), z.array(z.string())]);

// Extended XPENDING: [[id, consumer, idle ms, delivery count]].
const PendingReplySchema = z.array(z.tuple([z.string(), z.string(), z.number(), z.number()]));

function toRecord(fields: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) {
    record[fields[i]] = fields[i + 1];
  }
  return record;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isNoGroupError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('NOGROUP');
}

// XGROUP CREATE ... MKSTREAM creates the stream if the api hasn't published yet, and
// BUSYGROUP means the group already exists. At startup the group begins at '$' (new
// messages only); runConsumer recreates a vanished group from '0' instead.
export async function ensureGroup(startId: '$' | '0' = '$'): Promise<void> {
  try {
    await redis.xgroup('CREATE', TASK_EVENTS_STREAM, AUDIT_GROUP, startId, 'MKSTREAM');
    logger.info(
      { stream: TASK_EVENTS_STREAM, group: AUDIT_GROUP, startId },
      'consumer group created',
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('BUSYGROUP')) {
      return;
    }
    throw err;
  }
}

// Parse, write the AuditLog row, then XACK. Throws if any step fails, leaving the
// message pending. A crash between the insert and XACK can duplicate a row (ADR-006).
async function processEntry([id, fields]: StreamEntry): Promise<void> {
  const event = TaskEventSchema.parse(toRecord(fields));
  await handleTaskEvent(event);
  await redis.xack(TASK_EVENTS_STREAM, AUDIT_GROUP, id);
  logger.debug({ id, action: event.action, taskId: event.taskId }, 'task event processed');
}

async function deliveryCount(id: string): Promise<number> {
  const reply = PendingReplySchema.parse(
    await redis.xpending(TASK_EVENTS_STREAM, AUDIT_GROUP, id, id, 1),
  );
  return reply[0]?.[3] ?? 0;
}

// ARCH §9.3: the original fields are copied unchanged, then the original is XACKed.
async function moveToDlq(
  [id, fields]: StreamEntry,
  err: unknown,
  deliveries: number,
): Promise<void> {
  await redis.xadd(
    DEAD_LETTER_STREAM,
    '*',
    'originalId',
    id,
    ...fields,
    'error',
    errorMessage(err),
    'deliveries',
    String(deliveries),
    'failedAt',
    new Date().toISOString(),
  );
  await redis.xack(TASK_EVENTS_STREAM, AUDIT_GROUP, id);
  logger.error({ id, deliveries, err }, 'task event moved to dead-letter queue');
}

// Retries messages that have been pending for at least WORKER_CLAIM_IDLE_MS. XAUTOCLAIM
// counts as a delivery, so the count read afterwards includes this attempt.
async function reclaimPending(): Promise<void> {
  const [, entries, trimmedIds] = AutoclaimReplySchema.parse(
    await redis.xautoclaim(
      TASK_EVENTS_STREAM,
      AUDIT_GROUP,
      env.WORKER_CONSUMER_NAME,
      env.WORKER_CLAIM_IDLE_MS,
      '0-0',
      'COUNT',
      BATCH_SIZE,
    ),
  );
  // Entries trimmed from the stream can't be processed; ack them so XPENDING drains.
  if (trimmedIds.length > 0) {
    await redis.xack(TASK_EVENTS_STREAM, AUDIT_GROUP, ...trimmedIds);
  }

  for (const entry of entries) {
    try {
      await processEntry(entry);
    } catch (err) {
      const deliveries = await deliveryCount(entry[0]);
      if (deliveries >= env.WORKER_MAX_DELIVERIES) {
        await moveToDlq(entry, err, deliveries);
      } else {
        logger.warn({ id: entry[0], deliveries, err }, 'task event retry failed; left pending');
      }
    }
  }
}

async function readNew(): Promise<void> {
  const reply = ReadReplySchema.parse(
    await blockingRedis.xreadgroup(
      'GROUP',
      AUDIT_GROUP,
      env.WORKER_CONSUMER_NAME,
      'COUNT',
      BATCH_SIZE,
      'BLOCK',
      BLOCK_MS,
      'STREAMS',
      TASK_EVENTS_STREAM,
      '>',
    ),
  );

  for (const [, entries] of reply ?? []) {
    for (const entry of entries) {
      try {
        await processEntry(entry);
      } catch (err) {
        logger.warn({ id: entry[0], deliveries: 1, err }, 'task event failed; left pending');
      }
    }
  }
}

// Runs until isStopping() turns true. The current batch always finishes, and a stop
// takes at most one BLOCK_MS wait, inside Compose's 10s grace period.
export async function runConsumer(isStopping: () => boolean): Promise<void> {
  logger.info(
    { stream: TASK_EVENTS_STREAM, group: AUDIT_GROUP, consumer: env.WORKER_CONSUMER_NAME },
    'consumer started',
  );
  let groupMissing = false;
  while (!isStopping()) {
    try {
      // Redis lost its data (a recreated container or a FLUSHALL), and the group with
      // it. Everything now in the stream was published after that, so read it all.
      if (groupMissing) {
        await ensureGroup('0');
        groupMissing = false;
      }
      await reclaimPending();
      await readNew();
    } catch (err) {
      groupMissing = isNoGroupError(err);
      logger.error({ err }, 'consumer pass failed; retrying');
      await delay(RETRY_DELAY_MS);
    }
  }
}
