import type { Request, Response } from 'express';
import type { QrService } from '../services/qrService.js';
import { qrSizeQuerySchema } from '../validators/common.js';
import { NotFoundError } from '../types/errors.js';

export class TenantController {
  constructor(private readonly qrService: QrService) {}

  showPublicCard = (req: Request, res: Response): void => {
    const user = req.tenantUser!;
    const card = req.tenantCard;

    if (!card) {
      throw new NotFoundError(
        'This digital business card has not been configured yet.',
        'CARD_NOT_FOUND'
      );
    }

    const isOwner = req.currentUser?.id === user.id;
    if (!card.is_published && !isOwner) {
      throw new NotFoundError(
        'This digital business card is currently private or unpublished.',
        'CARD_UNPUBLISHED'
      );
    }

    res.render('tenant-card-preview', {
      user,
      card,
      tenant: req.tenant,
    });
  };

  downloadQrPng = async (req: Request, res: Response): Promise<void> => {
    const username = req.tenant!;
    const { size } = qrSizeQuerySchema.parse(req.query);
    const pngBuffer = await this.qrService.getQrPng(username, size);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${username}-card.png"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(pngBuffer);
  };

  downloadQrSvg = async (req: Request, res: Response): Promise<void> => {
    const username = req.tenant!;
    const svgString = await this.qrService.getQrSvg(username);

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${username}-card.svg"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(svgString);
  };
}
