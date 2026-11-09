import { z } from 'zod';

// Shared by every resource with an :id route. A non-UUID id is a 422 (AC-3.2).
export const IdParamSchema = z.object({
  id: z.string().uuid(),
});

export type IdParam = z.infer<typeof IdParamSchema>;
