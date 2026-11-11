import { loadEnvOrExit } from '../lib/env.js';
import { createLogger } from '../lib/logger.js';
import { hashPassword } from '../lib/password.js';
import { createDatabase, checkMigrationsUpToDate, type AppDatabase } from './index.js';
import { UserRepository } from '../repositories/userRepository.js';

export async function seedMasterAdmin(
  db: AppDatabase,
  cfg: { username: string; email: string; password: string }
): Promise<{ action: 'created' | 'updated'; userId: number }> {
  const userRepo = new UserRepository(db);
  const passwordHash = await hashPassword(cfg.password);
  const now = new Date().toISOString();

  const existing = userRepo.findByUsername(cfg.username);
  if (existing) {
    userRepo.updateMasterUser(existing.id, cfg.email, passwordHash, now);
    return { action: 'updated', userId: existing.id };
  }

  const { userId } = userRepo.createUserWithCard(
    {
      username: cfg.username,
      email: cfg.email,
      password_hash: passwordHash,
      role: 'master',
      status: 'active',
      created_at: now,
      updated_at: now,
    },
    {
      full_name: 'Platform Administrator',
      job_title: 'System Master',
      company: 'VirtualCard Operations',
      tagline: 'Multi-Tenant Digital Business Card Platform Infrastructure',
      public_email: cfg.email,
      theme: '#38bdf8',
      is_published: true,
      created_at: now,
      updated_at: now,
    }
  );

  return { action: 'created', userId };
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  const env = loadEnvOrExit();
  const logger = createLogger({ nodeEnv: env.NODE_ENV, logLevel: env.LOG_LEVEL });
  const { sqliteDb, db } = createDatabase(env.DATABASE_URL);

  const migrationStatus = checkMigrationsUpToDate(sqliteDb);
  if (!migrationStatus.upToDate) {
    logger.fatal('Database schema is not migrated. Run "npm run migrate" before seeding.');
    sqliteDb.close();
    process.exit(1);
  }

  seedMasterAdmin(db, {
    username: env.MASTER_USERNAME,
    email: env.MASTER_EMAIL,
    password: env.MASTER_PASSWORD,
  })
    .then((result) => {
      logger.info(
        { action: result.action, userId: result.userId, username: env.MASTER_USERNAME },
        'Master admin seed completed cleanly'
      );
      sqliteDb.close();
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Master admin seed failed');
      sqliteDb.close();
      process.exit(1);
    });
}
