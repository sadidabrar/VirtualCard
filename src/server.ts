import { loadEnvOrExit } from './lib/env.js';
import { createLogger } from './lib/logger.js';
import { createDatabase, checkMigrationsUpToDate } from './db/index.js';
import { terminateOcrWorker } from './lib/documentProcessor.js';
import { createApp } from './app.js';

const env = loadEnvOrExit();
const logger = createLogger({ nodeEnv: env.NODE_ENV, logLevel: env.LOG_LEVEL });

const { sqliteDb, db } = createDatabase(env.DATABASE_URL);

// Verify Drizzle migrations are current on startup — fail fast if unmigrated
const migrationStatus = checkMigrationsUpToDate(sqliteDb);
if (!migrationStatus.upToDate) {
  logger.fatal(
    { missingMigrations: migrationStatus.missingTags },
    'Database schema is out of date. Run "npm run migrate" before starting the server.'
  );
  sqliteDb.close();
  process.exit(1);
}

const app = createApp({ env, db, sqliteDb, logger });

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      baseDomain: env.BASE_DOMAIN,
      migrationsApplied: migrationStatus.appliedCount,
    },
    'VirtualCard server started'
  );
});

// Graceful Shutdown (SIGTERM / SIGINT)
let shuttingDown = false;
const SHUTDOWN_TIMEOUT_MS = 12_000;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Graceful shutdown initiated — draining in-flight requests');

  const forceTimer = setTimeout(() => {
    logger.error('Shutdown drain timeout exceeded — forcing exit');
    try {
      sqliteDb.close();
    } catch {
      // ignore close error on forced exit
    }
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  server.close((closeErr) => {
    clearTimeout(forceTimer);
    if (closeErr) {
      logger.error({ err: closeErr }, 'Error while closing HTTP server');
    }
    void terminateOcrWorker().finally(() => {
      try {
        sqliteDb.close();
        logger.info('SQLite database closed cleanly');
      } catch (dbErr) {
        logger.error({ err: dbErr }, 'Error closing SQLite database');
      }
      process.exit(closeErr ? 1 : 0);
    });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
