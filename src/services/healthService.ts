import type { HealthRepository } from '../repositories/healthRepository.js';
import type { MigrationCheckResult } from '../db/index.js';

export interface ReadinessResult {
  ready: boolean;
  dbReachable: boolean;
  migrations: MigrationCheckResult;
}

export class HealthService {
  constructor(private readonly healthRepo: HealthRepository) {}

  checkReadiness(): ReadinessResult {
    try {
      const dbReachable = this.healthRepo.ping();
      const migrations = this.healthRepo.getMigrationStatus();
      return {
        ready: dbReachable && migrations.upToDate,
        dbReachable,
        migrations,
      };
    } catch {
      return {
        ready: false,
        dbReachable: false,
        migrations: {
          upToDate: false,
          appliedCount: 0,
          expectedCount: 0,
          missingTags: [],
        },
      };
    }
  }
}
