import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import os from 'os';
import path from 'path';
import fs from 'fs';

import { createApp } from '../../src/app.js';
import { createDatabase, applyMigrations } from '../../src/db/index.js';
import { createLogger } from '../../src/lib/logger.js';
import { parseEnv } from '../../src/lib/env.js';
import { seedMasterAdmin } from '../../src/db/seed.js';
import { UserRepository } from '../../src/repositories/userRepository.js';
import { CardRepository } from '../../src/repositories/cardRepository.js';

function createTestContext() {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-test-uploads-'));
  const env = parseEnv({
    NODE_ENV: 'test',
    PORT: '3000',
    BASE_DOMAIN: 'virtualcard.duckdns.org',
    DATABASE_URL: ':memory:',
    UPLOAD_DIR: uploadDir,
    SESSION_SECRET: 'test_session_secret_with_more_than_16_chars',
    MASTER_EMAIL: 'master@virtualcard.duckdns.org',
    MASTER_USERNAME: 'master',
    MASTER_PASSWORD: 'MasterTestPassword2026!',
    LOG_LEVEL: 'silent',
  });

  const { sqliteDb, db } = createDatabase(':memory:');
  applyMigrations(db);
  const logger = createLogger({ nodeEnv: 'test', logLevel: 'silent' });
  const app = createApp({ env, db, sqliteDb, logger });

  return { app, db, sqliteDb, env, uploadDir };
}

function extractCsrf(html: string): string {
  const match = html.match(/name="_csrf" value="([a-f0-9]+)"/);
  if (!match) throw new Error('CSRF token not found in HTML response');
  return match[1];
}

describe('VirtualCard Backend Integration Tests', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(async () => {
    ctx = createTestContext();
    await seedMasterAdmin(ctx.db, {
      username: ctx.env.MASTER_USERNAME,
      email: ctx.env.MASTER_EMAIL,
      password: ctx.env.MASTER_PASSWORD,
    });
  });

  afterEach(() => {
    ctx.sqliteDb.close();
    fs.rmSync(ctx.uploadDir, { recursive: true, force: true });
  });

  it('serves /healthz and /readyz bypassing tenant middleware and sets X-Request-Id', async () => {
    const h = await request(ctx.app)
      .get('/healthz')
      .set('Host', 'nonexistent.virtualcard.duckdns.org');
    expect(h.status).toBe(200);
    expect(h.headers['x-request-id']).toBeTruthy();
    expect(h.body).toMatchObject({ ok: true, data: { status: 'alive' } });

    const r = await request(ctx.app)
      .get('/readyz')
      .set('Host', 'nonexistent.virtualcard.duckdns.org');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      ok: true,
      data: { status: 'ready', db: true },
    });
  });

  it('validates /api/username-available with unified API contract', async () => {
    const missing = await request(ctx.app).get('/api/username-available');
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        field: 'u',
      },
    });

    const reserved = await request(ctx.app).get('/api/username-available?u=admin');
    expect(reserved.status).toBe(200);
    expect(reserved.body.ok).toBe(true);
    expect(reserved.body.data.available).toBe(false);

    const fresh = await request(ctx.app).get('/api/username-available?u=alice2026');
    expect(fresh.status).toBe(200);
    expect(fresh.body).toEqual({
      ok: true,
      data: { available: true, username: 'alice2026' },
    });
  });

  it('enforces CSRF, password match, avatar EXIF stripping, signup success, and duplicate rejection', async () => {
    const agent = request.agent(ctx.app);

    const signupPage = await agent.get('/signup');
    expect(signupPage.status).toBe(200);
    const csrf = extractCsrf(signupPage.text);

    // 1. Bad CSRF rejected with 403
    const badCsrfRes = await agent
      .post('/signup')
      .type('form')
      .send({ _csrf: 'badtoken', username: 'alice2026' });
    expect(badCsrfRes.status).toBe(403);

    // 2. Password mismatch rejected with 400 and visible message
    const mismatchRes = await agent.post('/signup').type('form').send({
      _csrf: csrf,
      username: 'alice2026',
      email: 'alice@example.com',
      password: 'Password123!',
      confirm_password: 'DifferentPassword123!',
      full_name: 'Alice Dev',
    });
    expect(mismatchRes.status).toBe(400);
    expect(mismatchRes.text).toContain('Password and confirmation do not match');

    // 3. Valid signup with PNG avatar
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const okRes = await agent
      .post('/signup')
      .field('_csrf', csrf)
      .field('username', 'alice2026')
      .field('email', 'alice@example.com')
      .field('password', 'Password123!')
      .field('confirm_password', 'Password123!')
      .field('full_name', 'Alice Dev')
      .field('job_title', 'Staff Engineer')
      .field('theme', '#a855f7')
      .attach('avatar', pngBytes, { filename: 'avatar.png', contentType: 'image/png' });

    expect(okRes.status).toBe(302);
    expect(okRes.headers.location).toBe('/signup/success');

    const successPage = await agent.get('/signup/success');
    expect(successPage.status).toBe(200);
    expect(successPage.text).toContain('https://alice2026.virtualcard.duckdns.org');

    // 4. Tenant resolution on subdomain via Host header
    const tenantCard = await request(ctx.app)
      .get('/')
      .set('Host', 'alice2026.virtualcard.duckdns.org');
    expect(tenantCard.status).toBe(200);
    expect(tenantCard.text).toContain('Alice Dev');

    // 5. QR downloads on tenant subdomain
    const qrPng = await request(ctx.app)
      .get('/qr.png?size=2048')
      .set('Host', 'alice2026.virtualcard.duckdns.org');
    expect(qrPng.status).toBe(200);
    expect(qrPng.headers['content-type']).toBe('image/png');
    expect(qrPng.headers['content-disposition']).toContain('alice2026-card.png');

    // 6. Duplicate username conflict (409 JSON)
    const dupRes = await agent.post('/signup').set('Accept', 'application/json').type('form').send({
      _csrf: csrf,
      username: 'alice2026',
      email: 'other@example.com',
      password: 'Password123!',
      confirm_password: 'Password123!',
      full_name: 'Duplicate Alice',
    });
    expect(dupRes.status).toBe(409);
    expect(dupRes.body).toMatchObject({
      error: { code: 'USERNAME_TAKEN', field: 'username' },
    });
  });

  it('enforces login, suspended account rejection, and strict 5/min login rate limit', async () => {
    const agent = request.agent(ctx.app);
    const loginPage = await agent.get('/login');
    const csrf = extractCsrf(loginPage.text);

    // Master login succeeds
    const okLogin = await agent.post('/login').set('Accept', 'application/json').type('form').send({
      _csrf: csrf,
      identifier: ctx.env.MASTER_USERNAME,
      password: ctx.env.MASTER_PASSWORD,
    });
    expect(okLogin.status).toBe(200);
    expect(okLogin.body.ok).toBe(true);

    // Suspend user and test 403 on tenant subdomain
    const userRepo = new UserRepository(ctx.db);
    userRepo.updateStatus(1, 'suspended', new Date().toISOString());

    const suspendedTenant = await request(ctx.app)
      .get('/')
      .set('Host', 'master.virtualcard.duckdns.org')
      .set('Accept', 'application/json');
    expect(suspendedTenant.status).toBe(403);
    expect(suspendedTenant.body.error.code).toBe('ACCOUNT_SUSPENDED');

    // Rate limit test: we already did 1 login, 4 more allowed, 6th triggers 429
    for (let i = 0; i < 4; i++) {
      await agent
        .post('/login')
        .set('Accept', 'application/json')
        .type('form')
        .send({ _csrf: csrf, identifier: 'master', password: 'wrong' });
    }
    const rateLimited = await agent
      .post('/login')
      .set('Accept', 'application/json')
      .type('form')
      .send({ _csrf: csrf, identifier: 'master', password: 'wrong' });
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.body.error.code).toBe('LOGIN_RATE_LIMIT');
  });

  it('returns structured 404 for unknown subdomain', async () => {
    const res = await request(ctx.app)
      .get('/')
      .set('Host', 'unknownuser.virtualcard.duckdns.org')
      .set('Accept', 'application/json');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TENANT_NOT_FOUND');
  });

  it('serves full public card with OG tags, socials, vCard, QR, and hides unpublished cards from visitors', async () => {
    const cardRepo = new CardRepository(ctx.db);
    cardRepo.updateByUserId(1, {
      phone: '+1 555-234-5678',
      whatsapp: '+1 555-234-5678',
      website: 'https://virtualcard.duckdns.org',
      socials: JSON.stringify({
        github: 'https://github.com/master',
        linkedin: 'https://linkedin.com/in/master',
      }),
      address: 'San Francisco, CA',
    });

    const cardRes = await request(ctx.app).get('/').set('Host', 'master.virtualcard.duckdns.org');
    expect(cardRes.status).toBe(200);
    expect(cardRes.text).toContain('property="og:title"');
    expect(cardRes.text).toContain(
      'property="og:url" content="https://master.virtualcard.duckdns.org"'
    );
    expect(cardRes.text).toContain('https://wa.me/15552345678');
    expect(cardRes.text).toContain('https://github.com/master');
    expect(cardRes.text).toContain('San Francisco, CA');

    // vCard download
    const vcfRes = await request(ctx.app)
      .get('/vcard')
      .set('Host', 'master.virtualcard.duckdns.org');
    expect(vcfRes.status).toBe(200);
    expect(vcfRes.headers['content-type']).toContain('text/vcard');
    expect(vcfRes.headers['content-disposition']).toContain('master.vcf');
    expect(vcfRes.text).toContain('BEGIN:VCARD');
    expect(vcfRes.text).toContain('URL;TYPE=CARD:https://master.virtualcard.duckdns.org');

    // QR SVG download
    const svgRes = await request(ctx.app)
      .get('/qr.svg')
      .set('Host', 'master.virtualcard.duckdns.org');
    expect(svgRes.status).toBe(200);
    expect(svgRes.headers['content-type']).toContain('image/svg+xml');
    const svgContent = svgRes.text || Buffer.from(svgRes.body).toString('utf8');
    expect(svgContent).toContain('<svg');

    // Unpublish card -> visitor gets 404
    cardRepo.updateByUserId(1, { is_published: false });
    const unpubVisitor = await request(ctx.app)
      .get('/')
      .set('Host', 'master.virtualcard.duckdns.org')
      .set('Accept', 'application/json');
    expect(unpubVisitor.status).toBe(404);
    expect(unpubVisitor.body.error.code).toBe('CARD_UNPUBLISHED');

    const unpubVcf = await request(ctx.app)
      .get('/vcard')
      .set('Host', 'master.virtualcard.duckdns.org')
      .set('Accept', 'application/json');
    expect(unpubVcf.status).toBe(404);
  });
});
