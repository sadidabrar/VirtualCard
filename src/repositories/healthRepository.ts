import { sql } from 'drizzle-orm';
import type Database from 'better-sqlite3';
import {
  type AppDatabase,
  checkMigrationsUpToDate,
  type MigrationCheckResult,
} from '../db/index.js';

export class HealthRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly sqliteDb: Database.Database
  ) {}

  ping(): boolean {
    const row = this.db.get<{ ok: number }>(sql`SELECT 1 as ok`);
    return row?.ok === 1;
  }

  getMigrationStatus(): MigrationCheckResult {
    return checkMigrationsUpToDate(this.sqliteDb);
  }
}
