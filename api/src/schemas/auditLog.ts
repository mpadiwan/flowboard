import { z } from 'zod';

// FR-L1. Query strings arrive as text, so limit is coerced; outside 1..100 is a 422.
export const AuditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
