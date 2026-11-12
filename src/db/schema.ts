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
    phones_json: text('phones_json').notNull().default('[]'),
    public_email: text('public_email').default(''),
    website: text('website').default(''),
    address: text('address').default(''),
    maps_url: text('maps_url').default(''),
    socials: text('socials').default('{}'),
    extra_socials_json: text('extra_socials_json').notNull().default('[]'),
    avatar_url: text('avatar_url').default(''),
    logo_url: text('logo_url').default(''),
    theme: text('theme').notNull().default('#38bdf8'),
    is_published: integer('is_published', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [index('idx_cards_user_id').on(table.user_id)]
);

export const vaultConfigs = sqliteTable('vault_configs', {
  user_id: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  kdf_salt: text('kdf_salt').notNull(),
  encrypted_dek: text('encrypted_dek').notNull(),
  dek_iv: text('dek_iv').notNull(),
  dek_tag: text('dek_tag').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const vaultProfiles = sqliteTable('vault_profiles', {
  user_id: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  tag: text('tag').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const vaultDocuments = sqliteTable(
  'vault_documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storage_key: text('storage_key').notNull(),
    mime_type: text('mime_type').notNull(),
    original_size: integer('original_size').notNull(),
    compressed_size: integer('compressed_size').notNull(),
    file_iv: text('file_iv').notNull(),
    file_tag: text('file_tag').notNull(),
    meta_ciphertext: text('meta_ciphertext').notNull(),
    meta_iv: text('meta_iv').notNull(),
    meta_tag: text('meta_tag').notNull(),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [index('idx_vault_docs_user_id').on(table.user_id)]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type VaultConfig = typeof vaultConfigs.$inferSelect;
export type VaultProfileRow = typeof vaultProfiles.$inferSelect;
export type VaultDocumentRow = typeof vaultDocuments.$inferSelect;
