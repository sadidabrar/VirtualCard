import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import SQLiteStoreInit from 'better-sqlite3-session-store';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';

import { config, getClickableTenantHref, getRootHref } from './config.js';
import { sqliteDb } from './db/index.js';
import { seedMasterAdmin } from './db/seed.js';
import { tenantMiddleware } from './middleware/tenant.js';
import { ensureCsrfToken } from './middleware/csrf.js';
import { attachCurrentUser } from './middleware/auth.js';

import rootRoutes from './routes/root.js';
import authRoutes from './routes/auth.js';
import mediaRoutes from './routes/media.js';
import tenantRoutes from './routes/tenant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Auto-seed master admin if needed on boot
seedMasterAdmin().catch((err) => console.error('Auto-seed check error:', err));

// Trust reverse proxy (X-Forwarded-Host, X-Forwarded-For)
app.set('trust proxy', 1);

// Strict Security Headers (CSP with self-hosted fonts & zero inline scripts)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// Configure EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets & controlled media serving (available across root + subdomains)
app.use(express.static(path.join(__dirname, '../public')));
app.use('/media', mediaRoutes);

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
        intervalMs: 900000, // 15 mins
      },
    }),
    name: 'vc_session',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// Attach CSRF token + Current User + Navigation helpers
app.use(ensureCsrfToken);
app.use(attachCurrentUser);
app.use((req: Request, res: Response, next: NextFunction) => {
  res.locals.rootHomeHref = getRootHref('/', req);
  res.locals.rootLoginHref = getRootHref('/login', req);
  res.locals.rootSignupHref = getRootHref('/signup', req);
  res.locals.rootLogoutHref = getRootHref('/logout', req);
  if (req.currentUser) {
    res.locals.myCardHref = getClickableTenantHref(req.currentUser.username, '/', req);
    res.locals.myEditorHref = getClickableTenantHref(req.currentUser.username, '/edit', req);
  } else {
    res.locals.myCardHref = res.locals.rootHomeHref;
    res.locals.myEditorHref = res.locals.rootLoginHref;
  }
  next();
});

// Tenant Subdomain Resolution Middleware
app.use(tenantMiddleware);

// Dispatch Tenant Routes vs Root Domain Routes
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.isTenantRequest) {
    return tenantRoutes(req, res, next);
  }
  next();
});

app.use('/', rootRoutes);
app.use('/', authRoutes);

// Styled Liquid Glass 404 Catch-All
app.use((_req: Request, res: Response) => {
  res.status(404).render('tenant-error', {
    title: 'Page Not Found',
    badge: '404 • Not Found',
    heading: 'Page Not Found',
    message: 'The page you are looking for does not exist or may have moved.',
    ctaText: 'Back to Home',
    ctaLink: '/',
    accent: '#38bdf8',
  });
});

app.listen(config.port, () => {
  console.log(`✨ VirtualCard platform active at http://localhost:${config.port}`);
  console.log(`   - Landing Page: http://localhost:${config.port}/`);
  console.log(`   - Signup Flow:  http://localhost:${config.port}/signup`);
  console.log(`   - Design Demo:  http://localhost:${config.port}/demo`);
});

export default app;
