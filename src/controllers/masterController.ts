import type { Request, Response, NextFunction } from 'express';
import type { MasterService } from '../services/masterService.js';
import type { QrService } from '../services/qrService.js';
import type { AdminUserWithCard } from '../types/domain.js';
import {
  masterListQuerySchema,
  masterResetPasswordSchema,
  masterUpdateStatusSchema,
  masterUpdateUserCardSchema,
  userIdParamSchema,
} from '../validators/master.js';
import { ACCENT_PRESETS, getOrderedSocialFields } from '../lib/sanitize.js';
import { getCanonicalTenantUrl, getClickableTenantHref } from '../lib/url.js';
import { wantsJson } from '../lib/http.js';
import { AppError } from '../types/errors.js';

export class MasterController {
  constructor(
    private readonly masterService: MasterService,
    private readonly qrService: QrService,
    private readonly baseDomain: string,
    private readonly isProd: boolean
  ) {}

  private renderUserDetail = async (
    req: Request,
    res: Response,
    options: {
      record: AdminUserWithCard;
      errors?: string[];
      toastMessage?: string | null;
      statusCode?: number;
    }
  ): Promise<void> => {
    const { record, errors = [], toastMessage = null, statusCode = 200 } = options;
    const { user, card } = record;
    const orderedSocials = getOrderedSocialFields(card?.socials);
    const qrDataUrl = await this.qrService.getQrDataUrl(user.username, 140);

    res.status(statusCode).render('master-user', {
      targetUser: user,
      targetCard: card,
      orderedSocials,
      accentPresets: ACCENT_PRESETS,
      errors,
      toastMessage,
      canonicalUrl: getCanonicalTenantUrl(user.username, this.baseDomain),
      publicCardHref: getClickableTenantHref(user.username, '/', req, this.baseDomain, this.isProd),
      qrDataUrl,
      qrPngHref: getClickableTenantHref(
        user.username,
        '/qr.png?size=2048',
        req,
        this.baseDomain,
        this.isProd
      ),
      qrSvgHref: getClickableTenantHref(
        user.username,
        '/qr.svg',
        req,
        this.baseDomain,
        this.isProd
      ),
    });
  };

  showDashboard = (req: Request, res: Response, next: NextFunction): void => {
    const parsed = masterListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(parsed.error);
    }

    const dashboard = this.masterService.getDashboard(parsed.data);

    if (wantsJson(req)) {
      res.json({ ok: true, data: dashboard });
      return;
    }

    let toastMessage: string | null = null;
    if (req.query.deleted && typeof req.query.deleted === 'string') {
      toastMessage = `Account @${req.query.deleted.replace(/[^a-z0-9-]/gi, '')} deleted.`;
    } else if (req.query.notice === 'status_updated') {
      toastMessage = 'Account status updated.';
    }

    const itemsWithLinks = dashboard.items.map(({ user, card }) => ({
      user,
      card,
      canonicalUrl: getCanonicalTenantUrl(user.username, this.baseDomain),
      publicCardHref: getClickableTenantHref(user.username, '/', req, this.baseDomain, this.isProd),
    }));

    res.render('master', {
      metrics: dashboard.metrics,
      items: itemsWithLinks,
      pagination: dashboard.pagination,
      filters: dashboard.filters,
      toastMessage,
    });
  };

  showUserDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const paramParsed = userIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      return next(paramParsed.error);
    }

    const record = this.masterService.getUserDetail(paramParsed.data.id);

    if (wantsJson(req)) {
      res.json({ ok: true, data: record });
      return;
    }

    let toastMessage: string | null = null;
    if (req.query.saved === '1') {
      toastMessage = 'User account & card updated.';
    } else if (req.query.pwreset === '1') {
      toastMessage = 'User password has been reset.';
    } else if (req.query.notice === 'status_updated') {
      toastMessage = 'Account status updated.';
    }

    await this.renderUserDetail(req, res, { record, toastMessage });
  };

  updateUserAndCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const paramParsed = userIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      return next(paramParsed.error);
    }

    const targetId = paramParsed.data.id;
    const bodyParsed = masterUpdateUserCardSchema.safeParse(req.body);

    if (!bodyParsed.success) {
      if (wantsJson(req)) {
        return next(bodyParsed.error);
      }

      const existing = this.masterService.getUserDetail(targetId);
      const errors = bodyParsed.error.issues.map((i) => i.message);
      await this.renderUserDetail(req, res, {
        record: existing,
        errors,
        statusCode: 400,
      });
      return;
    }

    try {
      const updated = this.masterService.updateUserAndCard(
        targetId,
        req.currentUser!.id,
        bodyParsed.data
      );

      req.log.info(
        {
          action: 'master_update_user_card',
          masterId: req.currentUser!.id,
          targetUserId: targetId,
        },
        'Master updated user & card'
      );

      if (wantsJson(req)) {
        res.json({ ok: true, data: updated });
        return;
      }

      res.redirect(`/master/users/${targetId}?saved=1`);
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) {
        return next(err);
      }
      const existing = this.masterService.getUserDetail(targetId);
      await this.renderUserDetail(req, res, {
        record: existing,
        errors: [err.message],
        statusCode: err.statusCode,
      });
    }
  };

  updateUserStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const paramParsed = userIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      return next(paramParsed.error);
    }

    const bodyParsed = masterUpdateStatusSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return next(bodyParsed.error);
    }

    const targetId = paramParsed.data.id;
    try {
      const updated = this.masterService.setUserStatus(
        targetId,
        req.currentUser!.id,
        bodyParsed.data.status
      );

      req.log.info(
        {
          action: 'master_update_status',
          masterId: req.currentUser!.id,
          targetUserId: targetId,
          status: bodyParsed.data.status,
        },
        'Master updated account status'
      );

      if (wantsJson(req)) {
        res.json({ ok: true, data: updated });
        return;
      }

      if (bodyParsed.data.redirect_to === 'list') {
        res.redirect('/master?notice=status_updated');
        return;
      }

      res.redirect(`/master/users/${targetId}?notice=status_updated`);
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) {
        return next(err);
      }
      const existing = this.masterService.getUserDetail(targetId);
      await this.renderUserDetail(req, res, {
        record: existing,
        errors: [err.message],
        statusCode: err.statusCode,
      });
    }
  };

  resetUserPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const paramParsed = userIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      return next(paramParsed.error);
    }

    const targetId = paramParsed.data.id;
    const bodyParsed = masterResetPasswordSchema.safeParse(req.body);

    if (!bodyParsed.success) {
      if (wantsJson(req)) {
        return next(bodyParsed.error);
      }
      const existing = this.masterService.getUserDetail(targetId);
      const errors = bodyParsed.error.issues.map((i) => i.message);
      await this.renderUserDetail(req, res, {
        record: existing,
        errors,
        statusCode: 400,
      });
      return;
    }

    await this.masterService.resetPassword(targetId, bodyParsed.data.new_password);
    req.log.info(
      { action: 'master_reset_password', masterId: req.currentUser!.id, targetUserId: targetId },
      'Master reset user password'
    );

    if (wantsJson(req)) {
      res.json({ ok: true, data: { reset: true, userId: targetId } });
      return;
    }

    res.redirect(`/master/users/${targetId}?pwreset=1`);
  };

  deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const paramParsed = userIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      return next(paramParsed.error);
    }

    const targetId = paramParsed.data.id;
    try {
      const result = await this.masterService.deleteUser(targetId, req.currentUser!.id);
      req.log.info(
        {
          action: 'master_delete_user',
          masterId: req.currentUser!.id,
          targetUserId: targetId,
          deletedUsername: result.deletedUsername,
        },
        'Master deleted user account'
      );

      if (wantsJson(req)) {
        res.json({ ok: true, data: result });
        return;
      }

      res.redirect(`/master?deleted=${encodeURIComponent(result.deletedUsername)}`);
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) {
        return next(err);
      }
      const existing = this.masterService.getUserDetail(targetId);
      await this.renderUserDetail(req, res, {
        record: existing,
        errors: [err.message],
        statusCode: err.statusCode,
      });
    }
  };

  exportCsv = (req: Request, res: Response): void => {
    const csv = this.masterService.exportCsv();
    req.log.info({ action: 'master_export_csv', masterId: req.currentUser!.id }, 'Exported CSV');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="virtualcard-users.csv"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(csv);
  };

  exportJson = (req: Request, res: Response): void => {
    const users = this.masterService.exportJson();
    req.log.info({ action: 'master_export_json', masterId: req.currentUser!.id }, 'Exported JSON');

    res.setHeader('Content-Disposition', 'attachment; filename="virtualcard-users.json"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.json({ ok: true, data: { users } });
  };
}
