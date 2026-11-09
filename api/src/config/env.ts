import { z } from 'zod';

// The only place that reads process.env (ARCH §11.3). Each milestone extends this
// schema with the variables it starts using; .env.example lists them all.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
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
