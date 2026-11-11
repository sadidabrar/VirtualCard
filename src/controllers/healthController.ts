import type { Request, Response } from 'express';
import type { HealthService } from '../services/healthService.js';

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  liveness = (_req: Request, res: Response): void => {
    res.status(200).json({
      ok: true,
      data: {
        status: 'alive',
        uptimeSeconds: Math.floor(process.uptime()),
      },
    });
  };

  readiness = (_req: Request, res: Response): void => {
    const result = this.healthService.checkReadiness();
    if (!result.ready) {
      res.status(503).json({
        error: {
          code: 'NOT_READY',
          message: 'Service database or migrations are not ready.',
        },
        details: result,
      });
      return;
    }

    res.status(200).json({
      ok: true,
      data: {
        status: 'ready',
        db: result.dbReachable,
        migrationsApplied: result.migrations.appliedCount,
      },
    });
  };
}
