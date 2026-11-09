import { Priority, TaskStatus } from '@prisma/client';
import { z } from 'zod';

// Validation contract: ADR-007. Plain z.object() strips unknown keys, so fields like
// isAdmin never reach a handler. Never add .passthrough() or .strict().
// The enums come from the Prisma schema, so the allowed values have one source.
// IdParamSchema lives in ./common, shared with boards.

// FR-T1: without boardId, the list covers every board the caller owns.
export const ListTasksQuerySchema = z.object({
  boardId: z.string().uuid().optional(),
});

export const CreateTaskSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(5000).optional(),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  status: z.nativeEnum(TaskStatus).optional(),
  boardId: z.string().uuid(),
});

// boardId is deliberately absent: a task can't move boards, and a sent boardId is stripped.
// status is patchable per OQ-1.
export const UpdateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    priority: z.nativeEnum(Priority).optional(),
    status: z.nativeEnum(TaskStatus).optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  });

export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
