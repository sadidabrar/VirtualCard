import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { VaultRepository } from '../repositories/vaultRepository.js';
import { resolveVaultUploadDir } from '../lib/avatar.js';
import {
  decryptVaultFileBuffer,
  decryptVaultJson,
  encryptVaultFileBuffer,
  encryptVaultJson,
  generateVaultKeyMaterial,
  rewrapVaultDek,
  unwrapVaultDek,
  wrapDekForSession,
} from '../lib/vaultCrypto.js';
import {
  processVaultDocumentFile,
  rerunOcrOnDecryptedBuffer,
} from '../lib/documentProcessor.js';
import { searchVaultIndex } from '../lib/vaultSearch.js';
import {
  defaultVaultProfileData,
  normalizeVaultProfileInput,
} from '../validators/vault.js';
import { AuthError, NotFoundError, ValidationError } from '../types/errors.js';
import type {
  VaultDocumentMeta,
  VaultDocumentSummary,
  VaultProfileData,
  VaultSearchHit,
} from '../types/domain.js';
import type { VaultDocumentRow } from '../db/schema.js';

export interface VaultUnlockResult {
  secretB64: string;
  wrappedDekJson: string;
}

export class VaultService {
  private readonly inFlightOcrJobs = new Set<string>();

  constructor(
    private readonly vaultRepo: VaultRepository,
    private readonly uploadDir: string
  ) {}

  isInitialized(userId: number): boolean {
    return Boolean(this.vaultRepo.findConfigByUserId(userId));
  }

  async initializeVault(userId: number, passcode: string): Promise<VaultUnlockResult> {
    if (this.vaultRepo.findConfigByUserId(userId)) {
      throw new ValidationError(
        'Personal Vault is already initialized. Please unlock with your existing passcode.',
        'VAULT_ALREADY_INITIALIZED',
        'passcode'
      );
    }

    const now = new Date().toISOString();
    const material = await generateVaultKeyMaterial(passcode);

    this.vaultRepo.upsertConfig({
      user_id: userId,
      kdf_salt: material.kdfSalt,
      encrypted_dek: material.encryptedDek,
      dek_iv: material.dekIv,
      dek_tag: material.dekTag,
      created_at: now,
      updated_at: now,
    });

    const emptyProfile = defaultVaultProfileData();
    const encProfile = encryptVaultJson(material.dek, emptyProfile);
    this.vaultRepo.upsertProfile({
      user_id: userId,
      ciphertext: encProfile.ciphertext,
      iv: encProfile.iv,
      tag: encProfile.tag,
      updated_at: now,
    });

    return wrapDekForSession(material.dek);
  }

  async unlockVault(userId: number, passcode: string): Promise<VaultUnlockResult> {
    const cfg = this.vaultRepo.findConfigByUserId(userId);
    if (!cfg) {
      throw new ValidationError(
        'Personal Vault is not set up yet. Choose a Vault passcode to initialize it.',
        'VAULT_NOT_INITIALIZED',
        'passcode'
      );
    }

    const dek = await unwrapVaultDek(passcode, cfg);
    if (!dek) {
      throw new AuthError('Incorrect Vault passcode.', 401, 'INVALID_VAULT_PASSCODE');
    }

    return wrapDekForSession(dek);
  }

  async changePasscode(
    userId: number,
    currentPasscode: string,
    newPasscode: string
  ): Promise<VaultUnlockResult> {
    const cfg = this.vaultRepo.findConfigByUserId(userId);
    if (!cfg) {
      throw new NotFoundError('Vault configuration not found.', 'VAULT_NOT_INITIALIZED');
    }

    const dek = await unwrapVaultDek(currentPasscode, cfg);
    if (!dek) {
      throw new AuthError('Current Vault passcode is incorrect.', 401, 'INVALID_VAULT_PASSCODE');
    }

    const rewrapped = await rewrapVaultDek(dek, newPasscode);
    const now = new Date().toISOString();
    this.vaultRepo.upsertConfig({
      user_id: userId,
      kdf_salt: rewrapped.kdfSalt,
      encrypted_dek: rewrapped.encryptedDek,
      dek_iv: rewrapped.dekIv,
      dek_tag: rewrapped.dekTag,
      created_at: cfg.created_at,
      updated_at: now,
    });

    return wrapDekForSession(dek);
  }

  getDecryptedProfile(userId: number, dek: Buffer): VaultProfileData {
    const row = this.vaultRepo.findProfileByUserId(userId);
    if (!row) {
      return defaultVaultProfileData();
    }

    try {
      const decrypted = decryptVaultJson<VaultProfileData>(dek, {
        ciphertext: row.ciphertext,
        iv: row.iv,
        tag: row.tag,
      });
      return normalizeVaultProfileInput(decrypted);
    } catch {
      throw new AuthError('Unable to decrypt Personal Vault.', 403, 'VAULT_DECRYPT_FAILED');
    }
  }

  saveProfile(userId: number, dek: Buffer, rawInput: unknown): VaultProfileData {
    let normalized: VaultProfileData;
    try {
      normalized = normalizeVaultProfileInput(rawInput);
    } catch {
      throw new ValidationError(
        'Invalid vault data format submitted.',
        'INVALID_VAULT_PAYLOAD'
      );
    }

    const enc = encryptVaultJson(dek, normalized);
    this.vaultRepo.upsertProfile({
      user_id: userId,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      tag: enc.tag,
      updated_at: new Date().toISOString(),
    });
    return normalized;
  }

  private mapDocumentRow(dek: Buffer, row: VaultDocumentRow): VaultDocumentSummary {
    const meta = decryptVaultJson<VaultDocumentMeta>(dek, {
      ciphertext: row.meta_ciphertext,
      iv: row.meta_iv,
      tag: row.meta_tag,
    });

    return {
      ...meta,
      id: row.id,
      mimeType: row.mime_type,
      originalSize: row.original_size,
      compressedSize: row.compressed_size,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listDocuments(userId: number, dek: Buffer): VaultDocumentSummary[] {
    const rows = this.vaultRepo.listDocumentsByUserId(userId);
    return rows.map((row) => this.mapDocumentRow(dek, row));
  }

  async uploadDocument(
    userId: number,
    dek: Buffer,
    file: Express.Multer.File,
    metaInput: {
      title: string;
      category: VaultDocumentMeta['category'];
      linked_ref: string;
      document_date: string;
      expiry_date: string;
      tags: string[];
      notes: string;
    }
  ): Promise<VaultDocumentSummary> {
    const processed = await processVaultDocumentFile(file);
    const encFile = encryptVaultFileBuffer(dek, processed.processedBuffer);

    const filename = `vdoc-${crypto.randomUUID()}.enc`;
    const userVaultDir = resolveVaultUploadDir(userId, this.uploadDir);
    const destPath = path.join(userVaultDir, filename);

    await fs.promises.writeFile(destPath, encFile.encryptedBuffer);

    const meta: VaultDocumentMeta = {
      title: metaInput.title,
      category: metaInput.category,
      linkedRef: metaInput.linked_ref,
      documentDate: metaInput.document_date,
      expiryOrWarrantyDate: metaInput.expiry_date,
      originalFilename: path.basename(file.originalname || 'document').slice(0, 160),
      notes: metaInput.notes,
      ocrText: processed.ocrText,
      ocrStatus: processed.ocrStatus,
      ocrConfidence: processed.ocrConfidence,
      customTags: metaInput.tags,
    };

    const encMeta = encryptVaultJson(dek, meta);
    const now = new Date().toISOString();

    try {
      const inserted = this.vaultRepo.insertDocument({
        user_id: userId,
        storage_key: filename,
        mime_type: processed.mimeType,
        original_size: processed.originalSize,
        compressed_size: processed.compressedSize,
        file_iv: encFile.iv,
        file_tag: encFile.tag,
        meta_ciphertext: encMeta.ciphertext,
        meta_iv: encMeta.iv,
        meta_tag: encMeta.tag,
        created_at: now,
        updated_at: now,
      });
      return this.mapDocumentRow(dek, inserted);
    } catch (err) {
      try {
        await fs.promises.unlink(destPath);
      } catch {
        // non-fatal cleanup
      }
      throw err;
    }
  }

  async getDecryptedDocumentFile(
    docId: number,
    userId: number,
    dek: Buffer
  ): Promise<{ buffer: Buffer; mimeType: string; summary: VaultDocumentSummary }> {
    const row = this.vaultRepo.findDocumentByIdForUser(docId, userId);
    if (!row) {
      throw new NotFoundError('Document not found in your Private Vault.', 'VAULT_DOC_NOT_FOUND');
    }

    const summary = this.mapDocumentRow(dek, row);
    const safeStorageKey = path.basename(row.storage_key);
    const filePath = path.join(resolveVaultUploadDir(userId, this.uploadDir), safeStorageKey);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Encrypted document file missing from storage.', 'VAULT_FILE_MISSING');
    }

    const encryptedBuf = await fs.promises.readFile(filePath);
    const plainBuffer = decryptVaultFileBuffer(dek, encryptedBuf, row.file_iv, row.file_tag);

    return {
      buffer: plainBuffer,
      mimeType: row.mime_type,
      summary,
    };
  }

  updateDocumentMeta(
    docId: number,
    userId: number,
    dek: Buffer,
    updates: {
      title: string;
      category: VaultDocumentMeta['category'];
      linked_ref: string;
      document_date: string;
      expiry_date: string;
      tags: string[];
      notes: string;
      ocr_text: string;
    }
  ): VaultDocumentSummary {
    const row = this.vaultRepo.findDocumentByIdForUser(docId, userId);
    if (!row) {
      throw new NotFoundError('Document not found in your Private Vault.', 'VAULT_DOC_NOT_FOUND');
    }

    const existingMeta = this.mapDocumentRow(dek, row);
    const nextMeta: VaultDocumentMeta = {
      title: updates.title,
      category: updates.category,
      linkedRef: updates.linked_ref,
      documentDate: updates.document_date,
      expiryOrWarrantyDate: updates.expiry_date,
      originalFilename: existingMeta.originalFilename,
      notes: updates.notes,
      ocrText: updates.ocr_text.trim().slice(0, 100_000),
      ocrStatus: updates.ocr_text.trim() ? 'completed' : 'empty',
      ocrConfidence: existingMeta.ocrConfidence,
      customTags: updates.tags,
    };

    const encMeta = encryptVaultJson(dek, nextMeta);
    const updated = this.vaultRepo.updateDocumentMetaForUser(docId, userId, {
      meta_ciphertext: encMeta.ciphertext,
      meta_iv: encMeta.iv,
      meta_tag: encMeta.tag,
      updated_at: new Date().toISOString(),
    });
    if (!updated) {
      throw new NotFoundError('Document not found.', 'VAULT_DOC_NOT_FOUND');
    }
    return this.mapDocumentRow(dek, updated);
  }

  async rerunDocumentOcr(
    docId: number,
    userId: number,
    dek: Buffer
  ): Promise<VaultDocumentSummary> {
    const jobKey = `${userId}:${docId}`;
    if (this.inFlightOcrJobs.has(jobKey)) {
      throw new ValidationError(
        'OCR recognition is already in progress for this document. Please wait a moment.',
        'OCR_ALREADY_IN_PROGRESS',
        'docId'
      );
    }
    this.inFlightOcrJobs.add(jobKey);

    try {
      const { buffer, mimeType, summary } = await this.getDecryptedDocumentFile(docId, userId, dek);
      const ocrResult = await rerunOcrOnDecryptedBuffer(buffer, mimeType);

      const nextMeta: VaultDocumentMeta = {
        title: summary.title,
        category: summary.category,
        linkedRef: summary.linkedRef,
        documentDate: summary.documentDate,
        expiryOrWarrantyDate: summary.expiryOrWarrantyDate,
        originalFilename: summary.originalFilename,
        notes: summary.notes,
        ocrText: ocrResult.ocrText,
        ocrStatus: ocrResult.ocrStatus,
        ocrConfidence: ocrResult.ocrConfidence,
        customTags: summary.customTags,
      };

      const encMeta = encryptVaultJson(dek, nextMeta);
      const updated = this.vaultRepo.updateDocumentMetaForUser(docId, userId, {
        meta_ciphertext: encMeta.ciphertext,
        meta_iv: encMeta.iv,
        meta_tag: encMeta.tag,
        updated_at: new Date().toISOString(),
      });
      if (!updated) {
        throw new NotFoundError('Document not found.', 'VAULT_DOC_NOT_FOUND');
      }
      return this.mapDocumentRow(dek, updated);
    } finally {
      this.inFlightOcrJobs.delete(jobKey);
    }
  }

  async deleteDocument(docId: number, userId: number): Promise<void> {
    const deleted = this.vaultRepo.deleteDocumentForUser(docId, userId);
    if (!deleted) {
      throw new NotFoundError('Document not found.', 'VAULT_DOC_NOT_FOUND');
    }

    const safeStorageKey = path.basename(deleted.storage_key);
    const filePath = path.join(resolveVaultUploadDir(userId, this.uploadDir), safeStorageKey);
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch {
      // non-fatal cleanup
    }
  }

  searchVault(
    userId: number,
    dek: Buffer,
    query: string,
    category: VaultSearchHit['kind'] | 'all' = 'all'
  ): VaultSearchHit[] {
    const profile = this.getDecryptedProfile(userId, dek);
    const documents = this.listDocuments(userId, dek);
    return searchVaultIndex(profile, documents, query, category);
  }
}
