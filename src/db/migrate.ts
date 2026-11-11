import { loadEnvOrExit } from '../lib/env.js';
import { createLogger } from '../lib/logger.js';
import { createDatabase, applyMigrations, checkMigrationsUpToDate } from './index.js';

const env = loadEnvOrExit();
const logger = createLogger({ nodeEnv: env.NODE_ENV, logLevel: env.LOG_LEVEL });

const { sqliteDb, db } = createDatabase(env.DATABASE_URL);

try {
  logger.info({ dbUrl: env.DATABASE_URL }, 'Applying Drizzle SQLite migrations...');
  applyMigrations(db);
  const status = checkMigrationsUpToDate(sqliteDb);
  logger.info(
    { appliedCount: status.appliedCount, expectedCount: status.expectedCount },
    'Database migrations complete'
  );
} catch (err) {
  logger.error({ err }, 'Migration failed');
  process.exit(1);
} finally {
  sqliteDb.close();
}
