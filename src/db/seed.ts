import dotenv from 'dotenv';
dotenv.config();

import * as argon2 from '@node-rs/argon2';
import { db, sqliteDb } from './index.js';
import { users, cards } from './schema.js';
import { eq } from 'drizzle-orm';

export async function seedMasterAdmin() {
  const masterUsername = (process.env.MASTER_USERNAME || 'master').trim().toLowerCase();
  const masterEmail = (process.env.MASTER_EMAIL || 'admin@virtualcard.duckdns.org').trim().toLowerCase();
  const masterPassword = process.env.MASTER_PASSWORD || 'MasterAdmin2026!Liquid';

  if (!masterPassword) {
    console.error('❌ Error: MASTER_PASSWORD must be provided in .env');
    process.exit(1);
  }

  console.log(`🌱 Seeding master admin: username="${masterUsername}", email="${masterEmail}"...`);

  const passwordHash = await argon2.hash(masterPassword, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1
  });

  const now = new Date().toISOString();

  // Check if master user already exists by username or role
  const existingMaster = db.select().from(users).where(eq(users.username, masterUsername)).get();

  if (existingMaster) {
    console.log(`ℹ️ Master user "${masterUsername}" already exists (ID: ${existingMaster.id}). Updating password and ensuring role is master...`);
    db.update(users)
      .set({
        email: masterEmail,
        password_hash: passwordHash,
        role: 'master',
        status: 'active',
        updated_at: now
      })
      .where(eq(users.id, existingMaster.id))
      .run();

    console.log(`✅ Master admin credentials updated successfully.`);
    return existingMaster;
  }

  // Insert master user
  const result = db.insert(users).values({
    username: masterUsername,
    email: masterEmail,
    password_hash: passwordHash,
    role: 'master',
    status: 'active',
    created_at: now,
    updated_at: now
  }).returning({ id: users.id }).get();

  // Create master's card
  db.insert(cards).values({
    user_id: result.id,
    full_name: 'Platform Administrator',
    job_title: 'System Master',
    company: 'VirtualCard Operations',
    tagline: 'Multi-Tenant Digital Business Card Platform Infrastructure',
    public_email: masterEmail,
    theme: '#38bdf8',
    is_published: true,
    created_at: now,
    updated_at: now
  }).run();

  console.log(`✅ Master admin created successfully with ID: ${result.id}.`);
  return result;
}

// Run standalone if invoked directly
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedMasterAdmin()
    .then(() => {
      console.log('✨ Seed process complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Seed failed:', err);
      process.exit(1);
    });
}
