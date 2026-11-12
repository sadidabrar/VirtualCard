import type { Request, Response, NextFunction } from 'express';
import type { VaultService } from '../services/vaultService.js';
import { unwrapDekFromSession } from '../lib/vaultCrypto.js';
import {
  clearVaultSecretCookie,
  getCanonicalTenantUrl,
  getClickableTenantHref,
  readCookieValue,
  setVaultSecretCookie,
  VAULT_SECRET_COOKIE,
} from '../lib/url.js';
import { wantsJson } from '../lib/http.js';
import {
  VAULT_DOC_CATEGORIES,
  VAULT_EXAM_TYPES,
  vaultChangePasscodeSchema,
  vaultDocIdParamSchema,
  vaultDocumentUpdateMetaSchema,
  vaultDocumentUploadMetaSchema,
  vaultSearchQuerySchema,
  vaultSetupPasscodeSchema,
  vaultUnlockPasscodeSchema,
} from '../validators/vault.js';
import { AppError, AuthError, ValidationError } from '../types/errors.js';

export class VaultController {
  constructor(
    private readonly vaultService: VaultService,
    private readonly baseDomain: string,
    private readonly isProd: boolean
  ) {}

  private extractUnlockedDek(req: Request): Buffer | null {
    const secret = readCookieValue(req.headers.cookie, VAULT_SECRET_COOKIE);
    return unwrapDekFromSession(secret, req.session?.vaultWrappedDek);
  }

  private getVaultHrefs(req: Request, username: string) {
    const mk = (subPath: string) =>
      getClickableTenantHref(username, subPath, req, this.baseDomain, this.isProd);
    return {
      vaultHref: mk('/vault'),
      setupAction: mk('/vault/setup'),
      unlockAction: mk('/vault/unlock'),
      lockAction: mk('/vault/lock'),
      passcodeAction: mk('/vault/passcode'),
      profileAction: mk('/vault/profile'),
      uploadDocAction: mk('/vault/documents'),
      searchAction: mk('/vault/search'),
      editHref: mk('/edit'),
      publicCardHref: mk('/'),
      logoutFormAction: mk('/logout'),
    };
  }

  private renderVaultPage = (
    req: Request,
    res: Response,
    options?: {
      errors?: string[];
      toastMessage?: string | null;
      statusCode?: number;
      searchQuery?: string;
      searchCategory?: 'all' | 'identity' | 'academic' | 'address' | 'document' | 'custom';
    }
  ): void => {
    const userId = req.currentUser!.id;
    const username = req.tenant!;
    const card = req.tenantCard!;
    const initialized = this.vaultService.isInitialized(userId);
    const dek = initialized ? this.extractUnlockedDek(req) : null;
    const hrefs = this.getVaultHrefs(req, username);
    const searchQuery = options?.searchQuery ?? '';
    const searchCategory = options?.searchCategory ?? 'all';

    if (!dek) {
      res.status(options?.statusCode ?? 200).render('vault', {
        tenant: username,
        card,
        initialized,
        unlocked: false,
        profile: null,
        documents: [],
        searchQuery: '',
        searchCategory: 'all',
        searchHits: null,
        examTypes: VAULT_EXAM_TYPES,
        docCategories: VAULT_DOC_CATEGORIES,
        errors: options?.errors ?? [],
        toastMessage: options?.toastMessage ?? null,
        canonicalUrl: getCanonicalTenantUrl(username, this.baseDomain),
        ...hrefs,
      });
      return;
    }

    const profile = this.vaultService.getDecryptedProfile(userId, dek);
    const documents = this.vaultService.listDocuments(userId, dek);
    const searchHits = searchQuery
      ? this.vaultService.searchVault(userId, dek, searchQuery, searchCategory)
      : null;

    res.status(options?.statusCode ?? 200).render('vault', {
      tenant: username,
      card,
      initialized: true,
      unlocked: true,
      profile,
      documents,
      searchQuery,
      searchCategory,
      searchHits,
      examTypes: VAULT_EXAM_TYPES,
      docCategories: VAULT_DOC_CATEGORIES,
      errors: options?.errors ?? [],
      toastMessage: options?.toastMessage ?? null,
      canonicalUrl: getCanonicalTenantUrl(username, this.baseDomain),
      ...hrefs,
    });
  };

  showVault = (req: Request, res: Response): void => {
    const queryParsed = vaultSearchQuerySchema.safeParse(req.query);
    const searchQuery = queryParsed.success ? queryParsed.data.q : '';
    const searchCategory = queryParsed.success ? queryParsed.data.category : 'all';

    let toastMessage: string | null = null;
    if (req.query.saved === '1') toastMessage = 'Private vault records encrypted & saved.';
    else if (req.query.unlocked === '1') toastMessage = 'Personal Vault unlocked cleanly.';
    else if (req.query.locked === '1') toastMessage = 'Personal Vault locked cleanly.';
    else if (req.query.uploaded === '1') {
      toastMessage = 'Document compressed, OCR-indexed, encrypted & saved.';
    } else if (req.query.deleted === '1') toastMessage = 'Encrypted document deleted.';
    else if (req.query.ocr === '1') toastMessage = 'Document OCR metadata updated.';
    else if (req.query.pin === '1') toastMessage = 'Vault passcode updated cleanly.';

    if (wantsJson(req)) {
      const userId = req.currentUser!.id;
      const initialized = this.vaultService.isInitialized(userId);
      const dek = initialized ? this.extractUnlockedDek(req) : null;
      if (!dek) {
        res.json({ ok: true, data: { initialized, unlocked: false } });
        return;
      }
      const profile = this.vaultService.getDecryptedProfile(userId, dek);
      const documents = this.vaultService.listDocuments(userId, dek);
      res.json({
        ok: true,
        data: { initialized: true, unlocked: true, profile, documents },
      });
      return;
    }

    this.renderVaultPage(req, res, { toastMessage, searchQuery, searchCategory });
  };

  setupVault = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const username = req.tenant!;
    const userId = req.currentUser!.id;
    const parsed = vaultSetupPasscodeSchema.safeParse(req.body);

    if (!parsed.success) {
      if (wantsJson(req)) return next(parsed.error);
      this.renderVaultPage(req, res, {
        errors: parsed.error.issues.map((i) => i.message),
        statusCode: 400,
      });
      return;
    }

    try {
      const { secretB64, wrappedDekJson } = await this.vaultService.initializeVault(
        userId,
        parsed.data.passcode
      );
      req.session.vaultWrappedDek = wrappedDekJson;
      setVaultSecretCookie(req, res, secretB64, this.baseDomain);

      req.session.save(() => {
        if (wantsJson(req)) {
          res.status(201).json({ ok: true, data: { initialized: true, unlocked: true } });
          return;
        }
        res.redirect(
          getClickableTenantHref(username, '/vault?unlocked=1', req, this.baseDomain, this.isProd)
        );
      });
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) return next(err);
      this.renderVaultPage(req, res, { errors: [err.message], statusCode: err.statusCode });
    }
  };

  unlockVault = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const username = req.tenant!;
    const userId = req.currentUser!.id;
    const parsed = vaultUnlockPasscodeSchema.safeParse(req.body);

    if (!parsed.success) {
      if (wantsJson(req)) return next(parsed.error);
      this.renderVaultPage(req, res, {
        errors: parsed.error.issues.map((i) => i.message),
        statusCode: 400,
      });
      return;
    }

    try {
      const { secretB64, wrappedDekJson } = await this.vaultService.unlockVault(
        userId,
        parsed.data.passcode
      );
      req.session.vaultWrappedDek = wrappedDekJson;
      setVaultSecretCookie(req, res, secretB64, this.baseDomain);

      req.session.save(() => {
        if (wantsJson(req)) {
          res.json({ ok: true, data: { unlocked: true } });
          return;
        }
        res.redirect(
          getClickableTenantHref(username, '/vault?unlocked=1', req, this.baseDomain, this.isProd)
        );
      });
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) return next(err);
      this.renderVaultPage(req, res, { errors: [err.message], statusCode: err.statusCode });
    }
  };

  lockVault = (req: Request, res: Response): void => {
    const username = req.tenant!;
    delete req.session.vaultWrappedDek;
    clearVaultSecretCookie(req, res, this.baseDomain);
    req.session.save(() => {
      if (wantsJson(req)) {
        res.json({ ok: true, data: { unlocked: false } });
        return;
      }
      res.redirect(
        getClickableTenantHref(username, '/vault?locked=1', req, this.baseDomain, this.isProd)
      );
    });
  };

  changePasscode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const username = req.tenant!;
    const userId = req.currentUser!.id;
    const parsed = vaultChangePasscodeSchema.safeParse(req.body);

    if (!parsed.success) {
      if (wantsJson(req)) return next(parsed.error);
      this.renderVaultPage(req, res, {
        errors: parsed.error.issues.map((i) => i.message),
        statusCode: 400,
      });
      return;
    }

    try {
      const { secretB64, wrappedDekJson } = await this.vaultService.changePasscode(
        userId,
        parsed.data.current_passcode,
        parsed.data.new_passcode
      );
      req.session.vaultWrappedDek = wrappedDekJson;
      setVaultSecretCookie(req, res, secretB64, this.baseDomain);
      req.session.save(() => {
        if (wantsJson(req)) {
          res.json({ ok: true, data: { changed: true } });
          return;
        }
        res.redirect(
          getClickableTenantHref(username, '/vault?pin=1', req, this.baseDomain, this.isProd)
        );
      });
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) return next(err);
      this.renderVaultPage(req, res, { errors: [err.message], statusCode: err.statusCode });
    }
  };

  private requireUnlockedDek(req: Request): Buffer {
    const dek = this.extractUnlockedDek(req);
    if (!dek) {
      throw new AuthError(
        'Your Personal Vault is locked. Enter your Vault passcode to unlock it.',
        423,
        'VAULT_LOCKED'
      );
    }
    return dek;
  }

  saveProfile = (req: Request, res: Response, next: NextFunction): void => {
    const username = req.tenant!;
    const userId = req.currentUser!.id;

    try {
      const dek = this.requireUnlockedDek(req);
      const saved = this.vaultService.saveProfile(userId, dek, req.body);

      if (wantsJson(req)) {
        res.json({ ok: true, data: { profile: saved } });
        return;
      }
      res.redirect(
        getClickableTenantHref(username, '/vault?saved=1', req, this.baseDomain, this.isProd)
      );
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) return next(err);
      this.renderVaultPage(req, res, { errors: [err.message], statusCode: err.statusCode });
    }
  };

  uploadDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const username = req.tenant!;
    const userId = req.currentUser!.id;

    if (req.multerError) {
      if (wantsJson(req)) {
        return next(new ValidationError(req.multerError, 'UPLOAD_ERROR', 'file'));
      }
      this.renderVaultPage(req, res, { errors: [req.multerError], statusCode: 400 });
      return;
    }

    try {
      const dek = this.requireUnlockedDek(req);
      if (!req.file) {
        throw new ValidationError(
          'Please choose an image or PDF document to upload.',
          'MISSING_FILE',
          'file'
        );
      }

      const parsedMeta = vaultDocumentUploadMetaSchema.safeParse(req.body);
      if (!parsedMeta.success) {
        if (wantsJson(req)) return next(parsedMeta.error);
        this.renderVaultPage(req, res, {
          errors: parsedMeta.error.issues.map((i) => i.message),
          statusCode: 400,
        });
        return;
      }

      const doc = await this.vaultService.uploadDocument(userId, dek, req.file, parsedMeta.data);
      if (wantsJson(req)) {
        res.status(201).json({ ok: true, data: { document: doc } });
        return;
      }
      res.redirect(
        getClickableTenantHref(username, '/vault?uploaded=1', req, this.baseDomain, this.isProd)
      );
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) return next(err);
      this.renderVaultPage(req, res, { errors: [err.message], statusCode: err.statusCode });
    }
  };

  serveDocumentFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dek = this.requireUnlockedDek(req);
      const { docId } = vaultDocIdParamSchema.parse(req.params);
      const { buffer, mimeType, summary } = await this.vaultService.getDecryptedDocumentFile(
        docId,
        req.currentUser!.id,
        dek
      );

      const ext = mimeType === 'application/pdf' ? '.pdf' : '.webp';
      const safeBase = summary.title.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60) || 'document';
      const disposition = req.query.download === '1' ? 'attachment' : 'inline';

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `${disposition}; filename="${safeBase}${ext}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store, private');
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  };

  updateDocument = (req: Request, res: Response, next: NextFunction): void => {
    const username = req.tenant!;
    try {
      const dek = this.requireUnlockedDek(req);
      const { docId } = vaultDocIdParamSchema.parse(req.params);
      const parsedMeta = vaultDocumentUpdateMetaSchema.parse(req.body);
      const updated = this.vaultService.updateDocumentMeta(
        docId,
        req.currentUser!.id,
        dek,
        parsedMeta
      );

      if (wantsJson(req)) {
        res.json({ ok: true, data: { document: updated } });
        return;
      }
      res.redirect(
        getClickableTenantHref(username, '/vault?ocr=1', req, this.baseDomain, this.isProd)
      );
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) return next(err);
      this.renderVaultPage(req, res, { errors: [err.message], statusCode: err.statusCode });
    }
  };

  rerunDocumentOcr = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const username = req.tenant!;
    try {
      const dek = this.requireUnlockedDek(req);
      const { docId } = vaultDocIdParamSchema.parse(req.params);
      const updated = await this.vaultService.rerunDocumentOcr(docId, req.currentUser!.id, dek);

      if (wantsJson(req)) {
        res.json({ ok: true, data: { document: updated } });
        return;
      }
      res.redirect(
        getClickableTenantHref(username, '/vault?ocr=1', req, this.baseDomain, this.isProd)
      );
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) return next(err);
      this.renderVaultPage(req, res, { errors: [err.message], statusCode: err.statusCode });
    }
  };

  deleteDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const username = req.tenant!;
    try {
      this.requireUnlockedDek(req);
      const { docId } = vaultDocIdParamSchema.parse(req.params);
      await this.vaultService.deleteDocument(docId, req.currentUser!.id);

      if (wantsJson(req)) {
        res.json({ ok: true, data: { deletedId: docId } });
        return;
      }
      res.redirect(
        getClickableTenantHref(username, '/vault?deleted=1', req, this.baseDomain, this.isProd)
      );
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) return next(err);
      this.renderVaultPage(req, res, { errors: [err.message], statusCode: err.statusCode });
    }
  };

  searchVault = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const dek = this.requireUnlockedDek(req);
      const parsed = vaultSearchQuerySchema.parse(req.query);
      const hits = this.vaultService.searchVault(
        req.currentUser!.id,
        dek,
        parsed.q,
        parsed.category
      );

      if (wantsJson(req)) {
        res.json({ ok: true, data: { query: parsed.q, category: parsed.category, hits } });
        return;
      }
      this.renderVaultPage(req, res, {
        searchQuery: parsed.q,
        searchCategory: parsed.category,
      });
    } catch (err) {
      next(err);
    }
  };
}
