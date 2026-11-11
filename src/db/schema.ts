import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull().unique(),
    email: text('email').notNull().unique(),
    password_hash: text('password_hash').notNull(),
    role: text('role', { enum: ['owner', 'master'] })
      .notNull()
      .default('owner'),
    status: text('status', { enum: ['active', 'suspended'] })
      .notNull()
      .default('active'),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_users_username').on(table.username),
    uniqueIndex('idx_users_email').on(table.email),
  ]
);

export const cards = sqliteTable(
  'cards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    full_name: text('full_name').notNull().default(''),
    job_title: text('job_title').default(''),
    company: text('company').default(''),
    tagline: text('tagline').default(''),
    phone: text('phone').default(''),
    whatsapp: text('whatsapp').default(''),
    public_email: text('public_email').default(''),
    website: text('website').default(''),
    address: text('address').default(''),
    socials: text('socials').default('{}'),
    avatar_url: text('avatar_url').default(''),
    logo_url: text('logo_url').default(''),
    theme: text('theme').notNull().default('#38bdf8'),
    is_published: integer('is_published', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [index('idx_cards_user_id').on(table.user_id)]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
