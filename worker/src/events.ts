import { z } from 'zod';

// One entry on tasks:events, as the api's publishTaskEvent writes it (ARCH §9.3).
// Stream fields are untrusted input like any request body, so they are parsed, not cast.

export const TASK_EVENTS_STREAM = 'tasks:events';
export const AUDIT_GROUP = 'audit-group';
export const DEAD_LETTER_STREAM = 'tasks:events:dlq';

export const TaskEventSchema = z.object({
  action: z.enum(['CREATED', 'UPDATED', 'DELETED']),
  taskId: z.string().uuid(),
  userId: z.string().uuid(),
  // The task snapshot as JSON. The audit row doesn't need it, so it stays a string.
  payload: z.string(),
  ts: z.string().regex(/^\d+$/),
});

export type TaskEvent = z.infer<typeof TaskEventSchema>;
export type TaskEventAction = TaskEvent['action'];
