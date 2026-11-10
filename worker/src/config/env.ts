import { z } from 'zod';

// The only place that reads process.env (ARCH §11.3). Database and Redis settings match
// the api's; WORKER_* drive the consumer loop and retries (ADR-006).
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  // ADR-005: coerced here, so the port can never silently become NaN.
  REDIS_HOST: z.string().min(1).default('redis'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  // This worker's name inside the audit-group consumer group.
  WORKER_CONSUMER_NAME: z.string().min(1).default('worker-1'),
  // Deliveries before a failing event moves to tasks:events:dlq.
  WORKER_MAX_DELIVERIES: z.coerce.number().int().positive().default(3),
  // How long a message must sit unacknowledged before XAUTOCLAIM retries it.
  WORKER_CLAIM_IDLE_MS: z.coerce.number().int().positive().default(30000),
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
