import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy (X-Forwarded-Host, X-Forwarded-For)
app.set('trust proxy', 1);

// Configure EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static assets (CSS, JS, self-hosted fonts)
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Phase 2 Demo Route: Liquid Glass Design System Preview
app.get('/demo', async (req, res) => {
  try {
    // Generate sample QR code strictly with Error Correction Level H on solid white
    const sampleTenantUrl = 'https://mahbubkhan.virtualcard.duckdns.org';
    const qrDataUrl = await QRCode.toDataURL(sampleTenantUrl, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 160,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    const demoData = {
      name: 'Mahbub Khan',
      role: 'Founder & Principal Architect',
      company: 'Apex Cloud Systems',
      tagline: 'Scaling distributed cloud systems with elegant interfaces'
    };

    res.render('demo', {
      demoData,
      qrDataUrl
    });
  } catch (err) {
    console.error('Error generating demo page:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Root redirects to demo for Phase 2 inspection
app.get('/', (req, res) => {
  res.redirect('/demo');
});

const server = app.listen(PORT, () => {
  console.log(`✨ Liquid Glass Design Foundation running at http://localhost:${PORT}/demo`);
});

export default app;
