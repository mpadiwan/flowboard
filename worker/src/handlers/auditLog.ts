import type { TaskEvent, TaskEventAction } from '../events';
import { prisma } from '../lib/prisma';

// The row FR-L2 specifies. entityId has no foreign key, so a DELETED row outlives its
// task; userId does, so an event naming an unknown user fails and is retried (ADR-006).
export async function writeTaskAudit(action: TaskEventAction, event: TaskEvent): Promise<void> {
  await prisma.auditLog.create({
    data: { userId: event.userId, action, entity: 'Task', entityId: event.taskId },
  });
}
