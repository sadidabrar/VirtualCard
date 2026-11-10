import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import session from 'express-session';
import SQLiteStoreInit from 'better-sqlite3-session-store';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import helmet from 'helmet';

import { sqliteDb } from './db/index.js';
import { tenantMiddleware } from './middleware/tenant.js';
import { seedMasterAdmin } from './db/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Auto-seed master admin if needed on boot
seedMasterAdmin().catch(err => console.error('Auto-seed check error:', err));

// Trust reverse proxy (X-Forwarded-Host, X-Forwarded-For)
app.set('trust proxy', 1);

// Security Headers (Helmet) configured for self-hosted assets & tight CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// Configure EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Persistent SQLite session store (survives restarts, no MemoryStore)
const SQLiteStore = (SQLiteStoreInit as any)(session);
app.use(
  session({
    store: new SQLiteStore({
      client: sqliteDb,
      expired: {
        clear: true,
        intervalMs: 900000 // 15 mins
      }
    }),
    name: 'vc_session',
    secret: process.env.SESSION_SECRET || 'virtualcard_liquid_glass_super_secure_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  })
);

// Mount Tenant Resolution Middleware
app.use(tenantMiddleware);

// --- Tenant Subdomain Handling ---
app.use((req: Request, res: Response, next) => {
  if (req.isTenantRequest && req.tenantUser && req.tenantCard) {
    // If request is on tenant subdomain
    if (req.path === '/') {
      return res.render('tenant-card-preview', {
        user: req.tenantUser,
        card: req.tenantCard,
        tenant: req.tenant
      });
    }
  }
  next();
});

// --- Root Domain Routes ---

// Phase 2 Demo Route (Design System Foundation)
app.get('/demo', async (req: Request, res: Response) => {
  try {
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
    console.error('Error rendering demo:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Root landing page route
app.get('/', (req: Request, res: Response) => {
  res.redirect('/demo');
});

const server = app.listen(PORT, () => {
  console.log(`✨ VirtualCard platform active at http://localhost:${PORT}`);
  console.log(`   - Root / Demo: http://localhost:${PORT}/demo`);
  console.log(`   - Tenant Override (master): http://localhost:${PORT}/?__tenant=master`);
  console.log(`   - Unknown Tenant Test: http://localhost:${PORT}/?__tenant=nonexistent`);
});

export default app;
