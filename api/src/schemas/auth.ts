import { z } from 'zod';

// Validation contract: ADR-007. Emails are trimmed and lower-cased before storage and
// lookup (ARCH §8). bcrypt ignores everything past 72 bytes, so longer passwords are
// rejected instead of silently truncated. The limit is in UTF-8 bytes, not characters:
// 37 × "é" is 37 characters but 74 bytes.

const BCRYPT_MAX_BYTES = 72;

const EmailSchema = z.string().trim().toLowerCase().email().max(254);

const withinBcryptLimit = (password: string): boolean =>
  Buffer.byteLength(password, 'utf8') <= BCRYPT_MAX_BYTES;
const BCRYPT_LIMIT_MESSAGE = `Must be at most ${BCRYPT_MAX_BYTES} bytes`;

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: z.string().min(8).refine(withinBcryptLimit, BCRYPT_LIMIT_MESSAGE),
});

// Login doesn't repeat the length policy, so a 422 never hints at it; the byte limit
// still bounds the bcrypt input.
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).refine(withinBcryptLimit, BCRYPT_LIMIT_MESSAGE),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
