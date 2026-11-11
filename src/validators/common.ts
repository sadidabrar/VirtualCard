import { z } from 'zod';

export const RESERVED_USERNAMES = new Set([
  'www',
  'api',
  'app',
  'admin',
  'master',
  'root',
  'mail',
  'smtp',
  'ftp',
  'ns1',
  'ns2',
  'cdn',
  'static',
  'assets',
  'blog',
  'docs',
  'help',
  'support',
  'status',
  'dev',
  'staging',
  'test',
  'demo',
  'virtualcard',
  'dashboard',
  'login',
  'signup',
  'qr',
]);

export const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((val) => !RESERVED_USERNAMES.has(val), {
    message: 'This username is reserved and cannot be registered.',
  })
  .pipe(
    z
      .string()
      .min(3, 'Username must be between 3 and 30 characters.')
      .max(30, 'Username must be between 3 and 30 characters.')
      .regex(
        USERNAME_REGEX,
        'Username can only contain lowercase letters, numbers, and hyphens (no leading or trailing hyphens).'
      )
  );

export const optionalHttpUrlSchema = z
  .string()
  .trim()
  .max(300)
  .optional()
  .default('')
  .refine(
    (val) => {
      if (!val) return true;
      if (!/^https?:\/\//i.test(val)) return false;
      try {
        const parsed = new URL(val);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'URL must start with https:// or http://' }
  );

export const optionalEmailSchema = z
  .string()
  .trim()
  .max(254)
  .optional()
  .default('')
  .refine((val) => !val || z.string().email().safeParse(val).success, {
    message: 'Please enter a valid email address.',
  });

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid accent color hex code.')
  .transform((val) => val.toLowerCase())
  .default('#38bdf8');

export const qrSizeQuerySchema = z.object({
  size: z.coerce.number().int().min(128).max(4096).default(2048),
});

export function validateUsernameRules(raw: string): {
  valid: boolean;
  username: string;
  error?: string;
} {
  const normalized = raw.trim().toLowerCase();
  const parsed = usernameSchema.safeParse(normalized);
  if (!parsed.success) {
    return {
      valid: false,
      username: normalized,
      error: parsed.error.issues[0]?.message || 'Invalid username.',
    };
  }
  return { valid: true, username: parsed.data };
}
