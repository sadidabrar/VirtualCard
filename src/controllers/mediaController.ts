import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { avatarFilenameParamSchema } from '../validators/auth.js';
import { resolveUploadDir } from '../lib/avatar.js';
import { NotFoundError } from '../types/errors.js';

export class MediaController {
  constructor(private readonly uploadDir: string) {}

  serveAvatar = (req: Request, res: Response): void => {
    const parsed = avatarFilenameParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new NotFoundError('Avatar image not found.', 'AVATAR_NOT_FOUND');
    }

    const filePath = path.join(
      resolveUploadDir(this.uploadDir),
      path.basename(parsed.data.filename)
    );
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Avatar image not found.', 'AVATAR_NOT_FOUND');
    }

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.sendFile(filePath);
  };
}
