import type { TaskEvent } from '../events';
import { writeTaskAudit } from './auditLog';

export async function taskUpdated(event: TaskEvent): Promise<void> {
  await writeTaskAudit('UPDATED', event);
}
