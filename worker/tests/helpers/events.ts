import { randomUUID } from 'node:crypto';
import type { TaskEvent, TaskEventAction } from '../../src/events';

// A valid tasks:events entry, shaped as the api's publishTaskEvent writes it.
export function taskEvent(action: TaskEventAction = 'CREATED'): TaskEvent {
  return {
    action,
    taskId: randomUUID(),
    userId: randomUUID(),
    payload: JSON.stringify({ title: 'Write tests' }),
    ts: String(Date.now()),
  };
}

// The flat [field, value, ...] list a stream entry carries.
export function toFields(event: Record<string, string>): string[] {
  return Object.entries(event).flat();
}
