import express, { Request, Response } from 'express';
import { qrRateLimiter } from '../middleware/rateLimit.js';
import { generateQrPngBuffer, generateQrSvgString } from '../utils/qr.js';

const router = express.Router();

// Tenant public card page (expanded in Phase 5)
router.get('/', (req: Request, res: Response) => {
  const user = req.tenantUser!;
  const card = req.tenantCard;

  if (!card) {
    res.status(404).render('tenant-error', {
      title: 'Card Not Found',
      badge: '404 • Not Found',
      heading: 'Card Unavailable',
      message: 'This digital business card has not been configured yet.',
      ctaText: 'Go Home',
      ctaLink: '/',
      accent: '#38bdf8',
    });
    return;
  }

  const isOwner = req.currentUser?.id === user.id;
  if (!card.is_published && !isOwner) {
    res.status(404).render('tenant-error', {
      title: 'Card Unpublished',
      badge: '404 • Unpublished',
      heading: 'Card Not Published',
      message: 'This digital business card is currently private or unpublished.',
      ctaText: 'Go Home',
      ctaLink: '/',
      accent: '#38bdf8',
    });
    return;
  }

  res.render('tenant-card-preview', {
    user,
    card,
    tenant: req.tenant,
  });
});

// High-res PNG QR Code download (default 2048x2048, EC level H)
router.get('/qr.png', qrRateLimiter, async (req: Request, res: Response) => {
  try {
    const username = req.tenant!;
    const size = Number(req.query.size) || 2048;
    const pngBuffer = await generateQrPngBuffer(username, size);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${username}-card.png"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(pngBuffer);
  } catch (err) {
    console.error('QR PNG generation error:', err);
    res.status(500).send('Failed to generate QR PNG');
  }
});

// Vector SVG QR Code download (EC level H)
router.get('/qr.svg', qrRateLimiter, async (req: Request, res: Response) => {
  try {
    const username = req.tenant!;
    const svgString = await generateQrSvgString(username);

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${username}-card.svg"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(svgString);
  } catch (err) {
    console.error('QR SVG generation error:', err);
    res.status(500).send('Failed to generate QR SVG');
  }
});

export default router;
