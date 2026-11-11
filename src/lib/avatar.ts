import multer from 'multer';
import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { ValidationError } from '../types/errors.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function resolveUploadDir(uploadDir = 'data/uploads'): string {
  const dir = path.isAbsolute(uploadDir) ? uploadDir : path.join(process.cwd(), uploadDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function hasValidImageMagicBytes(buf: Buffer): boolean {
  if (!buf || buf.length < 12) return false;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // JPEG

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
    return true; // PNG
  }

  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return true; // GIF
  }

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
    return true; // WebP
  }

  return false;
}

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AVATAR_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(
        new ValidationError(
          'Only JPEG, PNG, WebP, and GIF images are allowed.',
          'INVALID_IMAGE_TYPE',
          'avatar'
        )
      );
    }
    cb(null, true);
  },
});

export async function processAndSaveAvatar(
  file: Express.Multer.File,
  uploadDir = 'data/uploads'
): Promise<string> {
  if (!hasValidImageMagicBytes(file.buffer)) {
    throw new ValidationError(
      'Invalid image file signature. File content does not match a valid image.',
      'INVALID_IMAGE_BYTES',
      'avatar'
    );
  }

  const processedBuffer = await sharp(file.buffer)
    .rotate()
    .resize(512, 512, { fit: 'cover', position: 'centre' })
    .webp({ quality: 88 })
    .toBuffer();

  const filename = `avatar-${crypto.randomBytes(16).toString('hex')}.webp`;
  const destDir = resolveUploadDir(uploadDir);
  const destPath = path.join(destDir, filename);

  await fs.promises.writeFile(destPath, processedBuffer);
  return `/media/avatars/${filename}`;
}

export async function deleteAvatarFile(
  avatarUrl: string | null | undefined,
  uploadDir = 'data/uploads'
): Promise<void> {
  if (!avatarUrl || !avatarUrl.startsWith('/media/avatars/')) return;
  const filename = path.basename(avatarUrl);
  if (!/^avatar-[a-f0-9]{32}\.webp$/.test(filename)) return;

  const fullPath = path.join(resolveUploadDir(uploadDir), filename);
  try {
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  } catch {
    // non-fatal cleanup
  }
}
