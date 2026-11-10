import type { TaskEvent, TaskEventAction } from '../events';
import { taskCreated } from './taskCreated';
import { taskDeleted } from './taskDeleted';
import { taskUpdated } from './taskUpdated';

// One handler per action (ARCH C6.3). A handler throws on failure; the consumer then
// leaves the message pending so it is retried.

type TaskEventHandler = (event: TaskEvent) => Promise<void>;

const handlers: Record<TaskEventAction, TaskEventHandler> = {
  CREATED: taskCreated,
  UPDATED: taskUpdated,
  DELETED: taskDeleted,
};

export async function handleTaskEvent(event: TaskEvent): Promise<void> {
  await handlers[event.action](event);
}
