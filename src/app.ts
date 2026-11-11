import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import session from 'express-session';
import SQLiteStoreInit from 'better-sqlite3-session-store';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import type Database from 'better-sqlite3';
import type { Logger } from 'pino';

import type { AppEnv } from './lib/env.js';
import type { AppDatabase } from './db/index.js';
import { getClickableTenantHref, getRootHref } from './lib/url.js';

import { UserRepository } from './repositories/userRepository.js';
import { CardRepository } from './repositories/cardRepository.js';
import { HealthRepository } from './repositories/healthRepository.js';

import { AuthService } from './services/authService.js';
import { TenantService } from './services/tenantService.js';
import { QrService } from './services/qrService.js';
import { HealthService } from './services/healthService.js';

import { HealthController } from './controllers/healthController.js';
import { RootController } from './controllers/rootController.js';
import { AuthController } from './controllers/authController.js';
import { TenantController } from './controllers/tenantController.js';
import { MediaController } from './controllers/mediaController.js';

import { createRequestLoggerMiddleware } from './middleware/requestId.js';
import { createRateLimiters } from './middleware/rateLimit.js';
import { ensureCsrfToken } from './middleware/csrf.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createTenantMiddleware } from './middleware/tenant.js';
import { createErrorHandler } from './middleware/errorHandler.js';

import { createHealthRouter } from './routes/health.js';
import { createRootRouter } from './routes/root.js';
import { createAuthRouter } from './routes/auth.js';
import { createTenantRouter } from './routes/tenant.js';
import { createMediaRouter } from './routes/media.js';

import { NotFoundError } from './types/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AppDependencies {
  env: AppEnv;
  db: AppDatabase;
  sqliteDb: Database.Database;
  logger: Logger;
}

export function createApp(deps: AppDependencies): Express {
  const { env, db, sqliteDb, logger } = deps;
  const isProd = env.NODE_ENV === 'production';
  const isDev = env.NODE_ENV !== 'production';

  const app = express();
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // 1. Request ID + Structured Logger
  app.use(createRequestLoggerMiddleware(logger));

  // 2. Security Headers
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

  // 3. DI Composition (Repositories -> Services -> Controllers)
  const userRepo = new UserRepository(db);
  const cardRepo = new CardRepository(db);
  const healthRepo = new HealthRepository(db, sqliteDb);

  const authService = new AuthService(userRepo, env.UPLOAD_DIR);
  const tenantService = new TenantService(userRepo, cardRepo);
  const qrService = new QrService(env.BASE_DOMAIN);
  const healthService = new HealthService(healthRepo);

  const healthController = new HealthController(healthService);
  const rootController = new RootController(authService, qrService, env.BASE_DOMAIN);
  const authController = new AuthController(
    authService,
    qrService,
    cardRepo,
    env.BASE_DOMAIN,
    isProd
  );
  const tenantController = new TenantController(qrService);
  const mediaController = new MediaController(env.UPLOAD_DIR);

  const rateLimiters = createRateLimiters();
  const authMiddleware = createAuthMiddleware(userRepo, env.BASE_DOMAIN, isProd);
  const tenantMiddleware = createTenantMiddleware(tenantService, env.BASE_DOMAIN, isDev, isProd);

  // 4. Health Endpoints (bypass tenant middleware, static, and sessions)
  app.use('/', createHealthRouter(healthController));

  // 5. Static Assets & Controlled Media Serving
  app.use(express.static(path.join(__dirname, '../public')));
  app.use('/media', createMediaRouter(mediaController));

  // 6. Body Parsing & Persistent SQLite Session Store
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  const SQLiteStore = SQLiteStoreInit(session);
  app.use(
    session({
      store: new SQLiteStore({
        client: sqliteDb,
        expired: {
          clear: true,
          intervalMs: 900000,
        },
      }),
      name: 'vc_session',
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // 7. CSRF Token & Auth User Context
  app.use(ensureCsrfToken);
  app.use(authMiddleware.attachCurrentUser);
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.rootHomeHref = getRootHref('/', req, env.BASE_DOMAIN, isProd);
    res.locals.rootLoginHref = getRootHref('/login', req, env.BASE_DOMAIN, isProd);
    res.locals.rootSignupHref = getRootHref('/signup', req, env.BASE_DOMAIN, isProd);
    res.locals.rootLogoutHref = getRootHref('/logout', req, env.BASE_DOMAIN, isProd);
    if (req.currentUser) {
      res.locals.myCardHref = getClickableTenantHref(
        req.currentUser.username,
        '/',
        req,
        env.BASE_DOMAIN,
        isProd
      );
      res.locals.myEditorHref = getClickableTenantHref(
        req.currentUser.username,
        '/edit',
        req,
        env.BASE_DOMAIN,
        isProd
      );
    } else {
      res.locals.myCardHref = res.locals.rootHomeHref;
      res.locals.myEditorHref = res.locals.rootLoginHref;
    }
    next();
  });

  // 8. Tenant Subdomain Resolution & Routing
  app.use(tenantMiddleware);

  const tenantRouter = createTenantRouter(tenantController, rateLimiters);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.isTenantRequest) {
      return tenantRouter(req, res, next);
    }
    next();
  });

  // 9. Root Domain & Auth Routing
  app.use('/', createRootRouter(rootController, rateLimiters));
  app.use('/', createAuthRouter(authController, rateLimiters));

  // 10. 404 Catch-All & Centralized Error Handler
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(
      new NotFoundError(
        'The page you are looking for does not exist or may have moved.',
        'PAGE_NOT_FOUND'
      )
    );
  });

  app.use(createErrorHandler(isProd));

  return app;
}
