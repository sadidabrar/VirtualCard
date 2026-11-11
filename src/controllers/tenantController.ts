import type { Request, Response } from 'express';
import type { QrService } from '../services/qrService.js';
import { qrSizeQuerySchema } from '../validators/common.js';
import { NotFoundError } from '../types/errors.js';
import { formatWhatsAppUrl, parseSocials, sanitizeHttpUrl } from '../lib/sanitize.js';
import { getCanonicalTenantUrl, getClickableTenantHref } from '../lib/url.js';
import { buildVCardString } from '../lib/vcard.js';

export class TenantController {
  constructor(
    private readonly qrService: QrService,
    private readonly baseDomain: string,
    private readonly isProd: boolean
  ) {}

  showPublicCard = async (req: Request, res: Response): Promise<void> => {
    const user = req.tenantUser!;
    const card = req.tenantCard;
    const username = req.tenant!;

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

    const canonicalUrl = getCanonicalTenantUrl(username, this.baseDomain);
    const websiteUrl = sanitizeHttpUrl(card.website);
    const whatsappUrl = formatWhatsAppUrl(card.whatsapp);
    const socials = parseSocials(card.socials);
    const qrDataUrl = await this.qrService.getQrDataUrl(username, 180);

    const ogImageUrl = card.avatar_url
      ? `${canonicalUrl}${card.avatar_url}`
      : `${canonicalUrl}/qr.png?size=1024`;

    const ogDescriptionParts = [card.job_title, card.company, card.tagline].filter(Boolean);
    const ogDescription =
      ogDescriptionParts.join(' • ') || `Digital business card for ${card.full_name}`;

    res.render('public-card', {
      tenant: username,
      card,
      socials,
      websiteUrl,
      whatsappUrl,
      canonicalUrl,
      ogImageUrl,
      ogDescription,
      qrDataUrl,
      isOwner,
      vcardHref: getClickableTenantHref(username, '/vcard', req, this.baseDomain, this.isProd),
      qrPngHref: getClickableTenantHref(
        username,
        '/qr.png?size=2048',
        req,
        this.baseDomain,
        this.isProd
      ),
      qrSvgHref: getClickableTenantHref(username, '/qr.svg', req, this.baseDomain, this.isProd),
      editHref: getClickableTenantHref(username, '/edit', req, this.baseDomain, this.isProd),
    });
  };

  downloadVCard = (req: Request, res: Response): void => {
    const user = req.tenantUser!;
    const card = req.tenantCard;
    const username = req.tenant!;

    if (!card) {
      throw new NotFoundError('Card not found.', 'CARD_NOT_FOUND');
    }

    const isOwner = req.currentUser?.id === user.id;
    if (!card.is_published && !isOwner) {
      throw new NotFoundError('Card is unpublished.', 'CARD_UNPUBLISHED');
    }

    const vcf = buildVCardString(username, card, this.baseDomain);
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${username}.vcf"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(vcf);
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
