import type { TaskEvent } from '../events';
import { writeTaskAudit } from './auditLog';

export async function taskDeleted(event: TaskEvent): Promise<void> {
  await writeTaskAudit('DELETED', event);
}
