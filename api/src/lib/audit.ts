import type { Prisma } from '@prisma/client';

// Synchronous audit for week-01 (brief Day 5: "AuditLog records created on task
// mutations"). Callers run it in the same transaction as the task write, so a change
// never commits without its row. day-08 replaces each call with publishTaskEvent, which
// takes the same arguments, and the worker writes this same row shape (ADR-006, FR-L2).

export type TaskAuditAction = 'CREATED' | 'UPDATED' | 'DELETED';

export async function recordTaskAudit(
  tx: Prisma.TransactionClient,
  action: TaskAuditAction,
  taskId: string,
  userId: string,
): Promise<void> {
  await tx.auditLog.create({
    data: { userId, action, entity: 'Task', entityId: taskId },
  });
}
