import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { getUploadDirPath } from '../utils/avatar.js';

const router = express.Router();

router.get('/avatars/:filename', (req: Request, res: Response) => {
  const rawFilename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filename = path.basename(rawFilename || '');

  // Strict allowlist pattern prevents directory traversal or unexpected file types
  if (!/^avatar-[a-f0-9]{32}\.webp$/.test(filename)) {
    res.status(404).send('Not found');
    return;
  }

  const filePath = path.join(getUploadDirPath(), filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).send('Not found');
    return;
  }

  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  res.sendFile(filePath);
});

export default router;
