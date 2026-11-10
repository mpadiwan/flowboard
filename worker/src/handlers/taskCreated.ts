import type { TaskEvent } from '../events';
import { writeTaskAudit } from './auditLog';

export async function taskCreated(event: TaskEvent): Promise<void> {
  await writeTaskAudit('CREATED', event);
}
