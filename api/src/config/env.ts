import type { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';

// The only place that reads process.env (ARCH §11.3). Each milestone extends this
// schema with the variables it starts using; .env.example lists them all.

// A jsonwebtoken duration such as '15m'. Kept to whole units so the regex can narrow the type.
type JwtDuration = Extract<SignOptions['expiresIn'], string>;
const isJwtDuration = (value: string): value is JwtDuration => /^\d+[smhd]$/.test(value);

// A comma-separated list such as "http://localhost:5173, https://app.example.com".
const splitList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
const isOrigin = (value: string): boolean => z.string().url().safeParse(value).success;

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().url(),
    BCRYPT_COST: z.coerce.number().int().min(12).default(12),
    // ADR-004: separate secrets, so a refresh token can never pass as an access token.
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z
      .string()
      .refine(isJwtDuration, 'Must be a duration such as 15m')
      .default('15m'),
    // Used for both the refresh JWT expiry and its Redis key TTL.
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
    // NFR-4: CORS sends Access-Control-Allow-Origin only to these origins.
    ALLOWED_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform(splitList)
      .refine((origins) => origins.length > 0, 'Must list at least one origin')
      .refine((origins) => origins.every(isOrigin), 'Each origin must be a URL'),
    // ADR-005: coerced here, so the port can never silently become NaN.
    REDIS_HOST: z.string().min(1).default('redis'),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    // NFR-5: per-IP limit on login and register.
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    // Read only by prisma/seed.ts, which refuses to run without it.
    SEED_USER_PASSWORD: z.string().min(8).optional(),
  })
  .refine((vars) => vars.JWT_ACCESS_SECRET !== vars.JWT_REFRESH_SECRET, {
    message: 'Must differ from JWT_ACCESS_SECRET',
    path: ['JWT_REFRESH_SECRET'],
  });

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    // The logger is configured from env, so this one message goes straight to stderr.
    process.stderr.write(`Invalid environment configuration: ${issues}\n`);
    process.exit(1);
  }
  return result.data;
}

export const env: Env = loadEnv();
