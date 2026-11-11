import type { Request, Response } from 'express';
import type { AuthService } from '../services/authService.js';
import type { QrService } from '../services/qrService.js';
import { usernameParamSchema, usernameQuerySchema } from '../validators/auth.js';
import { getCanonicalTenantUrl } from '../lib/url.js';
import { NotFoundError } from '../types/errors.js';

export class RootController {
  constructor(
    private readonly authService: AuthService,
    private readonly qrService: QrService,
    private readonly baseDomain: string
  ) {}

  landing = (_req: Request, res: Response): void => {
    res.render('landing');
  };

  demo = async (_req: Request, res: Response): Promise<void> => {
    const qrDataUrl = await this.qrService.getQrDataUrl('mahbubkhan', 160);
    const demoData = {
      name: 'Mahbub Khan',
      role: 'Founder & Principal Architect',
      company: 'Apex Cloud Systems',
      tagline: 'Scaling distributed cloud systems with elegant interfaces',
    };

    res.render('demo', { demoData, qrDataUrl });
  };

  checkUsernameAvailable = (req: Request, res: Response): void => {
    const { u } = usernameQuerySchema.parse(req.query);
    const result = this.authService.checkUsernameAvailability(u);
    res.json({ ok: true, data: result });
  };

  redirectSubdomain = (req: Request, res: Response): void => {
    const parsed = usernameParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new NotFoundError('The requested username format is invalid.', 'INVALID_USERNAME');
    }
    res.redirect(301, getCanonicalTenantUrl(parsed.data.username, this.baseDomain));
  };
}
