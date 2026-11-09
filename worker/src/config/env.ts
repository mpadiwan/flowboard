import { z } from 'zod';

// The only place that reads process.env. Redis and consumer settings
// (REDIS_*, WORKER_*) join this schema with day-08.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
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
