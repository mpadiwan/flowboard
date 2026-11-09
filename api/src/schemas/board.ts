import { z } from 'zod';

// Validation contract: ADR-007. Plain z.object() strips unknown keys, so a sent ownerId
// or isAdmin never reaches the handler; the owner always comes from req.user.

export const CreateBoardSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type CreateBoardInput = z.infer<typeof CreateBoardSchema>;
