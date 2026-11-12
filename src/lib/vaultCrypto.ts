import crypto from 'crypto';
import * as argon2 from '@node-rs/argon2';

const DEK_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;

export interface EncryptedBlobMeta {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface VaultKeyMaterial {
  kdfSalt: string;
  encryptedDek: string;
  dekIv: string;
  dekTag: string;
  dek: Buffer;
}

/**
 * Derive a 256-bit Key Encryption Key from a user's Vault passcode using Argon2id.
 * Passcodes are never stored on the server; wrong passcodes fail AES-GCM tag checks.
 */
export async function deriveVaultKek(passcode: string, saltBase64: string): Promise<Buffer> {
  const salt = Buffer.from(saltBase64, 'base64');
  return argon2.hashRaw(passcode, {
    salt,
    outputLen: DEK_BYTES,
    algorithm: argon2.Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export function encryptBufferWithKey(
  key: Buffer,
  plain: Buffer
): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: encrypted, iv, tag };
}

export function decryptBufferWithKey(
  key: Buffer,
  ciphertext: Buffer,
  iv: Buffer,
  tag: Buffer
): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export async function generateVaultKeyMaterial(passcode: string): Promise<VaultKeyMaterial> {
  const kdfSalt = crypto.randomBytes(SALT_BYTES).toString('base64');
  const kek = await deriveVaultKek(passcode, kdfSalt);
  const dek = crypto.randomBytes(DEK_BYTES);
  const wrapped = encryptBufferWithKey(kek, dek);

  return {
    kdfSalt,
    encryptedDek: wrapped.ciphertext.toString('base64'),
    dekIv: wrapped.iv.toString('base64'),
    dekTag: wrapped.tag.toString('base64'),
    dek,
  };
}

export async function rewrapVaultDek(
  dek: Buffer,
  newPasscode: string
): Promise<Omit<VaultKeyMaterial, 'dek'>> {
  const kdfSalt = crypto.randomBytes(SALT_BYTES).toString('base64');
  const kek = await deriveVaultKek(newPasscode, kdfSalt);
  const wrapped = encryptBufferWithKey(kek, dek);

  return {
    kdfSalt,
    encryptedDek: wrapped.ciphertext.toString('base64'),
    dekIv: wrapped.iv.toString('base64'),
    dekTag: wrapped.tag.toString('base64'),
  };
}

export async function unwrapVaultDek(
  passcode: string,
  cfg: {
    kdf_salt: string;
    encrypted_dek: string;
    dek_iv: string;
    dek_tag: string;
  }
): Promise<Buffer | null> {
  try {
    const kek = await deriveVaultKek(passcode, cfg.kdf_salt);
    const dek = decryptBufferWithKey(
      kek,
      Buffer.from(cfg.encrypted_dek, 'base64'),
      Buffer.from(cfg.dek_iv, 'base64'),
      Buffer.from(cfg.dek_tag, 'base64')
    );
    return dek.length === DEK_BYTES ? dek : null;
  } catch {
    return null;
  }
}

/**
 * Split-secret session sealing:
 * - Random 256-bit secret lives ONLY in an HttpOnly browser cookie (`vc_vault_secret`).
 * - Wrapped DEK lives ONLY in the server session (`req.session.vaultWrappedDek`).
 * Neither the DB alone nor the browser cookie alone can unwrap the DEK.
 */
export function wrapDekForSession(dek: Buffer): { secretB64: string; wrappedDekJson: string } {
  const secret = crypto.randomBytes(DEK_BYTES);
  const { ciphertext, iv, tag } = encryptBufferWithKey(secret, dek);
  return {
    secretB64: secret.toString('base64url'),
    wrappedDekJson: JSON.stringify({
      c: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      t: tag.toString('base64'),
    }),
  };
}

export function unwrapDekFromSession(
  secretB64: string | undefined,
  wrappedDekJson: string | undefined
): Buffer | null {
  if (!secretB64 || !wrappedDekJson) return null;
  try {
    const secret = Buffer.from(secretB64, 'base64url');
    if (secret.length !== DEK_BYTES) return null;
    const parsed = JSON.parse(wrappedDekJson) as { c?: string; iv?: string; t?: string };
    if (!parsed.c || !parsed.iv || !parsed.t) return null;
    const dek = decryptBufferWithKey(
      secret,
      Buffer.from(parsed.c, 'base64'),
      Buffer.from(parsed.iv, 'base64'),
      Buffer.from(parsed.t, 'base64')
    );
    return dek.length === DEK_BYTES ? dek : null;
  } catch {
    return null;
  }
}

export function encryptVaultJson(dek: Buffer, payload: unknown): EncryptedBlobMeta {
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');
  const { ciphertext, iv, tag } = encryptBufferWithKey(dek, raw);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptVaultJson<T>(dek: Buffer, encrypted: EncryptedBlobMeta): T {
  const raw = decryptBufferWithKey(
    dek,
    Buffer.from(encrypted.ciphertext, 'base64'),
    Buffer.from(encrypted.iv, 'base64'),
    Buffer.from(encrypted.tag, 'base64')
  );
  return JSON.parse(raw.toString('utf8')) as T;
}

export function encryptVaultFileBuffer(
  dek: Buffer,
  plainBuffer: Buffer
): { encryptedBuffer: Buffer; iv: string; tag: string } {
  const { ciphertext, iv, tag } = encryptBufferWithKey(dek, plainBuffer);
  return {
    encryptedBuffer: ciphertext,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptVaultFileBuffer(
  dek: Buffer,
  encryptedBuffer: Buffer,
  ivBase64: string,
  tagBase64: string
): Buffer {
  return decryptBufferWithKey(
    dek,
    encryptedBuffer,
    Buffer.from(ivBase64, 'base64'),
    Buffer.from(tagBase64, 'base64')
  );
}
