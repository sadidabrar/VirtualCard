import multer from 'multer';
import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function getUploadDirPath(): string {
  const dir = path.isAbsolute(config.uploadDir)
    ? config.uploadDir
    : path.join(process.cwd(), config.uploadDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Validates raster image magic bytes to prevent spoofed Content-Type or SVG XSS uploads.
 */
export function hasValidImageMagicBytes(buf: Buffer): boolean {
  if (!buf || buf.length < 12) return false;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return true;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return true;
  }

  // GIF: GIF87a or GIF89a
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return true;
  }

  // WebP: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return true;
  }

  return false;
}

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxAvatarBytes,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed.'));
    }
    cb(null, true);
  },
});

/**
 * Validates magic bytes, strips all EXIF metadata, optimizes to 512x512 WebP,
 * and persists outside webroot. Returns the controlled serving URL path.
 */
export async function processAndSaveAvatar(file: Express.Multer.File): Promise<string> {
  if (!hasValidImageMagicBytes(file.buffer)) {
    throw new Error('Invalid image file signature. File content does not match a valid image.');
  }

  // sharp.rotate() auto-orients based on EXIF, and omitting withMetadata() strips all EXIF/GPS/IPTC tags
  const processedBuffer = await sharp(file.buffer)
    .rotate()
    .resize(512, 512, { fit: 'cover', position: 'centre' })
    .webp({ quality: 88 })
    .toBuffer();

  const filename = `avatar-${crypto.randomBytes(16).toString('hex')}.webp`;
  const uploadDir = getUploadDirPath();
  const destPath = path.join(uploadDir, filename);

  await fs.promises.writeFile(destPath, processedBuffer);
  return `/media/avatars/${filename}`;
}

export async function deleteAvatarFile(avatarUrl: string | null | undefined): Promise<void> {
  if (!avatarUrl || !avatarUrl.startsWith('/media/avatars/')) return;
  const filename = path.basename(avatarUrl);
  if (!/^avatar-[a-f0-9]{32}\.webp$/.test(filename)) return;

  const fullPath = path.join(getUploadDirPath(), filename);
  try {
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  } catch (err) {
    console.error('Failed to remove old avatar:', err);
  }
}
