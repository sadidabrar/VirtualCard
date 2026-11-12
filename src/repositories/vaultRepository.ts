import { and, desc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/index.js';
import {
  vaultConfigs,
  vaultDocuments,
  vaultProfiles,
  type VaultConfig,
  type VaultDocumentRow,
  type VaultProfileRow,
} from '../db/schema.js';

export class VaultRepository {
  constructor(private readonly db: AppDatabase) {}

  findConfigByUserId(userId: number): VaultConfig | undefined {
    return this.db.select().from(vaultConfigs).where(eq(vaultConfigs.user_id, userId)).get();
  }

  upsertConfig(config: {
    user_id: number;
    kdf_salt: string;
    encrypted_dek: string;
    dek_iv: string;
    dek_tag: string;
    created_at: string;
    updated_at: string;
  }): VaultConfig {
    const existing = this.findConfigByUserId(config.user_id);
    if (existing) {
      return this.db
        .update(vaultConfigs)
        .set({
          kdf_salt: config.kdf_salt,
          encrypted_dek: config.encrypted_dek,
          dek_iv: config.dek_iv,
          dek_tag: config.dek_tag,
          updated_at: config.updated_at,
        })
        .where(eq(vaultConfigs.user_id, config.user_id))
        .returning()
        .get();
    }
    return this.db.insert(vaultConfigs).values(config).returning().get();
  }

  findProfileByUserId(userId: number): VaultProfileRow | undefined {
    return this.db.select().from(vaultProfiles).where(eq(vaultProfiles.user_id, userId)).get();
  }

  upsertProfile(data: {
    user_id: number;
    ciphertext: string;
    iv: string;
    tag: string;
    updated_at: string;
  }): VaultProfileRow {
    const existing = this.findProfileByUserId(data.user_id);
    if (existing) {
      return this.db
        .update(vaultProfiles)
        .set({
          ciphertext: data.ciphertext,
          iv: data.iv,
          tag: data.tag,
          updated_at: data.updated_at,
        })
        .where(eq(vaultProfiles.user_id, data.user_id))
        .returning()
        .get();
    }
    return this.db.insert(vaultProfiles).values(data).returning().get();
  }

  listDocumentsByUserId(userId: number): VaultDocumentRow[] {
    return this.db
      .select()
      .from(vaultDocuments)
      .where(eq(vaultDocuments.user_id, userId))
      .orderBy(desc(vaultDocuments.created_at), desc(vaultDocuments.id))
      .all();
  }

  findDocumentByIdForUser(docId: number, userId: number): VaultDocumentRow | undefined {
    return this.db
      .select()
      .from(vaultDocuments)
      .where(and(eq(vaultDocuments.id, docId), eq(vaultDocuments.user_id, userId)))
      .get();
  }

  insertDocument(row: {
    user_id: number;
    storage_key: string;
    mime_type: string;
    original_size: number;
    compressed_size: number;
    file_iv: string;
    file_tag: string;
    meta_ciphertext: string;
    meta_iv: string;
    meta_tag: string;
    created_at: string;
    updated_at: string;
  }): VaultDocumentRow {
    return this.db.insert(vaultDocuments).values(row).returning().get();
  }

  updateDocumentMetaForUser(
    docId: number,
    userId: number,
    updates: {
      meta_ciphertext: string;
      meta_iv: string;
      meta_tag: string;
      updated_at: string;
    }
  ): VaultDocumentRow | undefined {
    return this.db
      .update(vaultDocuments)
      .set(updates)
      .where(and(eq(vaultDocuments.id, docId), eq(vaultDocuments.user_id, userId)))
      .returning()
      .get();
  }

  deleteDocumentForUser(docId: number, userId: number): VaultDocumentRow | undefined {
    return this.db
      .delete(vaultDocuments)
      .where(and(eq(vaultDocuments.id, docId), eq(vaultDocuments.user_id, userId)))
      .returning()
      .get();
  }
}
