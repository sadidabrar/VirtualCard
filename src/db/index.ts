import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import fs from 'fs';
import * as schema from './schema.js';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  sqliteDb: Database.Database;
  db: AppDatabase;
}

export function createDatabase(dbPath: string): DatabaseHandle {
  const isMemory = dbPath === ':memory:';
  const fullDbPath = isMemory
    ? ':memory:'
    : path.isAbsolute(dbPath)
      ? dbPath
      : path.join(process.cwd(), dbPath);

  if (!isMemory) {
    const dbDir = path.dirname(fullDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  const sqliteDb = new Database(fullDbPath);
  if (!isMemory) {
    sqliteDb.pragma('journal_mode = WAL');
  }
  sqliteDb.pragma('foreign_keys = ON');

  const db = drizzle(sqliteDb, { schema });
  return { sqliteDb, db };
}

export function applyMigrations(
  db: AppDatabase,
  migrationsFolder = path.join(process.cwd(), 'drizzle')
): void {
  migrate(db, { migrationsFolder });
}

export interface MigrationCheckResult {
  upToDate: boolean;
  appliedCount: number;
  expectedCount: number;
  missingTags: string[];
}

export function checkMigrationsUpToDate(
  sqliteDb: Database.Database,
  migrationsFolder = path.join(process.cwd(), 'drizzle')
): MigrationCheckResult {
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    throw new Error(`Drizzle migration journal not found at ${journalPath}`);
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ idx: number; when: number; tag: string }>;
  };

  const tableExists = sqliteDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
    .get();

  if (!tableExists) {
    return {
      upToDate: false,
      appliedCount: 0,
      expectedCount: journal.entries.length,
      missingTags: journal.entries.map((e) => e.tag),
    };
  }

  const appliedRows = sqliteDb
    .prepare('SELECT created_at FROM __drizzle_migrations')
    .all() as Array<{ created_at: number }>;

  const appliedTimestamps = new Set(appliedRows.map((r) => Number(r.created_at)));
  const missingTags = journal.entries
    .filter((entry) => !appliedTimestamps.has(entry.when))
    .map((entry) => entry.tag);

  return {
    upToDate: missingTags.length === 0,
    appliedCount: appliedRows.length,
    expectedCount: journal.entries.length,
    missingTags,
  };
}
