import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: text('role', { enum: ['owner', 'master'] }).notNull().default('owner'),
  status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

export const cards = sqliteTable('cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  full_name: text('full_name').notNull().default(''),
  job_title: text('job_title').default(''),
  company: text('company').default(''),
  tagline: text('tagline').default(''),
  phone: text('phone').default(''),
  whatsapp: text('whatsapp').default(''),
  public_email: text('public_email').default(''),
  website: text('website').default(''),
  address: text('address').default(''),
  socials: text('socials').default('{}'), // JSON: { linkedin, github, x, instagram, facebook, telegram, youtube }
  avatar_url: text('avatar_url').default(''),
  logo_url: text('logo_url').default(''),
  theme: text('theme').notNull().default('#38bdf8'), // Accent hex / tint variant
  is_published: integer('is_published', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;

export const RESERVED_USERNAMES = new Set([
  'www', 'api', 'app', 'admin', 'master', 'root', 'mail', 'smtp', 'ftp',
  'ns1', 'ns2', 'cdn', 'static', 'assets', 'blog', 'docs', 'help', 'support',
  'status', 'dev', 'staging', 'test', 'demo', 'virtualcard', 'dashboard',
  'login', 'signup', 'qr'
]);

export const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

export function validateUsername(username: string): { valid: boolean; error?: string } {
  const normalized = username.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 30) {
    return { valid: false, error: 'Username must be between 3 and 30 characters.' };
  }
  if (!USERNAME_REGEX.test(normalized)) {
    return { valid: false, error: 'Username can only contain lowercase letters, numbers, and hyphens (no leading or trailing hyphens).' };
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    return { valid: false, error: 'This username is reserved and cannot be registered.' };
  }
  return { valid: true };
}
