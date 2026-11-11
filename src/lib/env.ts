import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    BASE_DOMAIN: z
      .string()
      .trim()
      .min(3, 'BASE_DOMAIN must be at least 3 characters')
      .transform((v) => v.toLowerCase()),
    DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL is required'),
    UPLOAD_DIR: z.string().trim().min(1).default('data/uploads'),
    SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
    MASTER_EMAIL: z
      .string()
      .trim()
      .email('MASTER_EMAIL must be a valid email address')
      .transform((v) => v.toLowerCase()),
    MASTER_USERNAME: z
      .string()
      .trim()
      .regex(
        /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/,
        'MASTER_USERNAME must be 3–30 lowercase alphanumeric/hyphen chars'
      )
      .transform((v) => v.toLowerCase()),
    MASTER_PASSWORD: z.string().min(8, 'MASTER_PASSWORD must be at least 8 characters'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (data.SESSION_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SESSION_SECRET'],
          message: 'SESSION_SECRET must be at least 32 characters in production',
        });
      }
      if (data.MASTER_PASSWORD.length < 12) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MASTER_PASSWORD'],
          message: 'MASTER_PASSWORD must be at least 12 characters in production',
        });
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: Record<string, string | undefined>): AppEnv {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'ENV'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return result.data;
}

export function loadEnvOrExit(rawEnv: Record<string, string | undefined> = process.env): AppEnv {
  try {
    return parseEnv(rawEnv);
  } catch (err) {
    console.error('❌ FATAL: Environment validation failed at startup.');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
