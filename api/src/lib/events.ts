import type { Task } from '@prisma/client';
import { logger } from './logger';
import { redis } from './redis';

// ADR-006, ARCH §9.3. Called after the Prisma write commits; the worker turns each entry
// into an AuditLog row. A failed XADD is logged and swallowed (ADR-005): the change has
// already happened, so the response must not fail because audit infrastructure did.

export const TASK_EVENTS_STREAM = 'tasks:events';

export type TaskEventAction = 'CREATED' | 'UPDATED' | 'DELETED';

export interface TaskEvent {
  action: TaskEventAction;
  taskId: string;
  // The actor, not the task owner (they are the same until boards are shared).
  userId: string;
  // The task after the change; for DELETED, the task as it was before.
  payload: Task;
}

export async function publishTaskEvent(event: TaskEvent): Promise<void> {
  try {
    await redis.xadd(
      TASK_EVENTS_STREAM,
      '*',
      'action',
      event.action,
      'taskId',
      event.taskId,
      'userId',
      event.userId,
      'payload',
      JSON.stringify(event.payload),
      'ts',
      Date.now().toString(),
    );
  } catch (err) {
    // This change will have no audit row; logging it at error keeps the gap visible.
    logger.error(
      { err, action: event.action, taskId: event.taskId },
      'task event not published; no audit row will be written',
    );
  }
}
