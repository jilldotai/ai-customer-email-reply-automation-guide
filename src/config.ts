import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),
  DATABASE_URL: z.string().url().min(1),
  REDIS_URL: z.string().url().min(1),
  LLM_API_KEY: z.string().min(1).optional(),
  BILLING_EMAIL: z.string().email().optional(),
  LOGISTICS_EMAIL: z.string().email().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  COMPLAINTS_EMAIL: z.string().email().optional(),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
  GMAIL_USER: z.string().optional()
});
export type Env = z.infer<typeof EnvSchema>;

export function loadConfig(env = process.env): Env {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    console.error('[config] Invalid environment:', parsed.error.flatten().fieldErrors);
    throw new Error('CONFIG_INVALID');
  }
  // Keep as plain object (no secrets logged)
  return Object.freeze(parsed.data);
}