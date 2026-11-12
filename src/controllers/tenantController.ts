import type { Request, Response, NextFunction } from 'express';
import type { QrService } from '../services/qrService.js';
import type { CardService } from '../services/cardService.js';
import { qrSizeQuerySchema } from '../validators/common.js';
import { updateCardBodySchema } from '../validators/card.js';
import { AppError, NotFoundError, ValidationError } from '../types/errors.js';
import {
  ACCENT_PRESETS,
  EXTRA_SOCIAL_PLATFORM_OPTIONS,
  buildGoogleMapsSearchUrl,
  formatWhatsAppUrl,
  getOrderedSocialFields,
  parseExtraSocials,
  parsePhoneEntries,
  parseSocials,
  resolveExtraSocialHref,
  sanitizeHttpUrl,
  sanitizeMapsUrl,
} from '../lib/sanitize.js';
import { getCanonicalTenantUrl, getClickableTenantHref } from '../lib/url.js';
import { wantsJson } from '../lib/http.js';
import { buildVCardString } from '../lib/vcard.js';

export class TenantController {
  constructor(
    private readonly qrService: QrService,
    private readonly cardService: CardService,
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
    const phoneEntries = parsePhoneEntries(card.phones_json, card.phone, card.whatsapp).map(
      (entry, idx) => ({
        ...entry,
        index: idx,
        whatsappUrl: entry.is_whatsapp ? formatWhatsAppUrl(entry.number) : '',
        saveVcfHref: getClickableTenantHref(
          username,
          `/vcard?phone=${idx}`,
          req,
          this.baseDomain,
          this.isProd
        ),
      })
    );

    const extraSocials = parseExtraSocials(card.extra_socials_json).map((entry) => ({
      ...entry,
      href: resolveExtraSocialHref(entry),
    }));

    const resolvedMapsUrl =
      sanitizeMapsUrl(card.maps_url) ||
      (card.address ? buildGoogleMapsSearchUrl(card.address) : '');

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
      phoneEntries,
      extraSocials,
      resolvedMapsUrl,
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
      vaultHref: getClickableTenantHref(username, '/vault', req, this.baseDomain, this.isProd),
    });
  };

  private renderEditor = async (
    req: Request,
    res: Response,
    options: {
      card: NonNullable<Request['tenantCard']>;
      errors?: string[];
      toastMessage?: string | null;
      statusCode?: number;
    }
  ): Promise<void> => {
    const username = req.tenant!;
    const { card, errors = [], toastMessage = null, statusCode = 200 } = options;
    const orderedSocials = getOrderedSocialFields(card.socials);
    const phoneEntries = parsePhoneEntries(card.phones_json, card.phone, card.whatsapp);
    const extraSocials = parseExtraSocials(card.extra_socials_json);
    const qrDataUrl = await this.qrService.getQrDataUrl(username, 140);

    res.status(statusCode).render('editor', {
      tenant: username,
      card,
      orderedSocials,
      phoneEntries,
      extraSocials,
      extraSocialPlatformOptions: EXTRA_SOCIAL_PLATFORM_OPTIONS,
      accentPresets: ACCENT_PRESETS,
      errors,
      toastMessage,
      canonicalUrl: getCanonicalTenantUrl(username, this.baseDomain),
      publicCardHref: getClickableTenantHref(username, '/', req, this.baseDomain, this.isProd),
      editFormAction: getClickableTenantHref(username, '/edit', req, this.baseDomain, this.isProd),
      vaultHref: getClickableTenantHref(username, '/vault', req, this.baseDomain, this.isProd),
      avatarFormAction: getClickableTenantHref(
        username,
        '/edit/avatar',
        req,
        this.baseDomain,
        this.isProd
      ),
      logoutFormAction: getClickableTenantHref(
        username,
        '/logout',
        req,
        this.baseDomain,
        this.isProd
      ),
      qrPngHref: getClickableTenantHref(
        username,
        '/qr.png?size=2048',
        req,
        this.baseDomain,
        this.isProd
      ),
      qrSvgHref: getClickableTenantHref(username, '/qr.svg', req, this.baseDomain, this.isProd),
      vcardHref: getClickableTenantHref(username, '/vcard', req, this.baseDomain, this.isProd),
      qrDataUrl,
    });
  };

  showEditor = async (req: Request, res: Response): Promise<void> => {
    const card = req.tenantCard!;
    let toastMessage: string | null = null;
    if (req.query.saved === '1') {
      toastMessage = 'Card changes saved!';
    } else if (req.query.avatar === '1') {
      toastMessage = 'Avatar updated!';
    } else if (req.query.avatar === 'removed') {
      toastMessage = 'Avatar removed.';
    }

    await this.renderEditor(req, res, { card, toastMessage });
  };

  updateCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const username = req.tenant!;
    const card = req.tenantCard!;
    const parsed = updateCardBodySchema.safeParse(req.body);

    if (!parsed.success) {
      if (wantsJson(req)) {
        return next(parsed.error);
      }

      const errors = parsed.error.issues.map((i) => i.message);
      const draftCard = {
        ...card,
        full_name: typeof req.body?.full_name === 'string' ? req.body.full_name : card.full_name,
        job_title: typeof req.body?.job_title === 'string' ? req.body.job_title : card.job_title,
        company: typeof req.body?.company === 'string' ? req.body.company : card.company,
        tagline: typeof req.body?.tagline === 'string' ? req.body.tagline : card.tagline,
        address: typeof req.body?.address === 'string' ? req.body.address : card.address,
        maps_url: typeof req.body?.maps_url === 'string' ? req.body.maps_url : card.maps_url,
        phone: typeof req.body?.phone === 'string' ? req.body.phone : card.phone,
        whatsapp: typeof req.body?.whatsapp === 'string' ? req.body.whatsapp : card.whatsapp,
        phones_json:
          typeof req.body?.phones_json === 'string' ? req.body.phones_json : card.phones_json,
        extra_socials_json:
          typeof req.body?.extra_socials_json === 'string'
            ? req.body.extra_socials_json
            : card.extra_socials_json,
        public_email:
          typeof req.body?.public_email === 'string' ? req.body.public_email : card.public_email,
        website: typeof req.body?.website === 'string' ? req.body.website : card.website,
        theme: typeof req.body?.theme === 'string' ? req.body.theme : card.theme,
        is_published:
          req.body?.is_published === 'on' ||
          req.body?.is_published === 'true' ||
          req.body?.is_published === true,
      };

      await this.renderEditor(req, res, { card: draftCard, errors, statusCode: 400 });
      return;
    }

    const updated = this.cardService.updateCard(req.currentUser!.id, parsed.data);

    if (wantsJson(req)) {
      res.json({ ok: true, data: { card: updated } });
      return;
    }

    res.redirect(
      getClickableTenantHref(username, '/edit?saved=1', req, this.baseDomain, this.isProd)
    );
  };

  updateAvatar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const username = req.tenant!;
    const card = req.tenantCard!;

    if (req.multerError) {
      if (wantsJson(req)) {
        return next(new ValidationError(req.multerError, 'UPLOAD_ERROR', 'avatar'));
      }
      await this.renderEditor(req, res, {
        card,
        errors: [req.multerError],
        statusCode: 400,
      });
      return;
    }

    try {
      if (req.body?.action === 'remove') {
        const updated = await this.cardService.removeAvatar(req.currentUser!.id);
        if (wantsJson(req)) {
          res.json({ ok: true, data: { card: updated } });
          return;
        }
        res.redirect(
          getClickableTenantHref(
            username,
            '/edit?avatar=removed',
            req,
            this.baseDomain,
            this.isProd
          )
        );
        return;
      }

      if (!req.file) {
        throw new ValidationError(
          'Please select an image file to upload.',
          'MISSING_FILE',
          'avatar'
        );
      }

      const updated = await this.cardService.updateAvatar(req.currentUser!.id, req.file);
      if (wantsJson(req)) {
        res.json({ ok: true, data: { card: updated } });
        return;
      }

      res.redirect(
        getClickableTenantHref(username, '/edit?avatar=1', req, this.baseDomain, this.isProd)
      );
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) {
        return next(err);
      }

      await this.renderEditor(req, res, {
        card,
        errors: [err.message],
        statusCode: err.statusCode,
      });
    }
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

    let phoneIndex: number | undefined;
    if (typeof req.query.phone === 'string' && /^\d+$/.test(req.query.phone)) {
      phoneIndex = Number.parseInt(req.query.phone, 10);
    }

    const vcf = buildVCardString(username, card, this.baseDomain, { phoneIndex });
    const filename =
      phoneIndex !== undefined ? `${username}-phone-${phoneIndex + 1}.vcf` : `${username}.vcf`;
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
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
