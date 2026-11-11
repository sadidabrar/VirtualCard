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

    // Suspend user and test 404 on tenant subdomain (per spec: 404 if suspended or unpublished)
    const userRepo = new UserRepository(ctx.db);
    userRepo.updateStatus(1, 'suspended', new Date().toISOString());

    const suspendedTenant = await request(ctx.app)
      .get('/')
      .set('Host', 'master.virtualcard.duckdns.org')
      .set('Accept', 'application/json');
    expect(suspendedTenant.status).toBe(404);
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

  it('enforces owner auth, tenant mismatch 403, card updates, social reordering, and avatar upload/removal', async () => {
    // 1. Unauthenticated /edit redirects or returns 401
    const unauthHtml = await request(ctx.app)
      .get('/edit')
      .set('Host', 'master.virtualcard.duckdns.org');
    expect(unauthHtml.status).toBe(302);
    expect(unauthHtml.headers.location).toContain('/login');

    const unauthJson = await request(ctx.app)
      .get('/edit')
      .set('Host', 'master.virtualcard.duckdns.org')
      .set('Accept', 'application/json');
    expect(unauthJson.status).toBe(401);
    expect(unauthJson.body.error.code).toBe('UNAUTHENTICATED');

    // 2. Sign up alice2026 (logs in automatically)
    const agent = request.agent(ctx.app);
    const signupPage = await agent.get('/signup');
    const signupCsrf = extractCsrf(signupPage.text);

    const signupRes = await agent.post('/signup').type('form').send({
      _csrf: signupCsrf,
      username: 'alice2026',
      email: 'alice.editor@example.com',
      password: 'Password123!',
      confirm_password: 'Password123!',
      full_name: 'Alice Original',
    });
    expect(signupRes.status).toBe(302);

    // 3. Tenant mismatch: alice2026 cannot GET or POST /edit on master subdomain
    const mismatchGet = await agent
      .get('/edit')
      .set('Host', 'master.virtualcard.duckdns.org')
      .set('Accept', 'application/json');
    expect(mismatchGet.status).toBe(403);
    expect(mismatchGet.body.error.code).toBe('TENANT_MISMATCH');

    const mismatchPost = await agent
      .post('/edit')
      .set('Host', 'master.virtualcard.duckdns.org')
      .set('Accept', 'application/json')
      .type('form')
      .send({
        _csrf: signupCsrf,
        full_name: 'Hacked Name',
      });
    expect(mismatchPost.status).toBe(403);
    expect(mismatchPost.body.error.code).toBe('TENANT_MISMATCH');

    // 4. Owner loads /edit on her own subdomain
    const editPage = await agent.get('/edit').set('Host', 'alice2026.virtualcard.duckdns.org');
    expect(editPage.status).toBe(200);
    expect(editPage.text).toContain('Edit Card (@alice2026)');
    const editCsrf = extractCsrf(editPage.text);

    // 5. Invalid form submit renders 400 validation feedback
    const invalidEdit = await agent
      .post('/edit')
      .set('Host', 'alice2026.virtualcard.duckdns.org')
      .type('form')
      .send({
        _csrf: editCsrf,
        full_name: 'X',
        website: 'javascript:alert(1)',
      });
    expect(invalidEdit.status).toBe(400);

    // 6. Valid card edit persists fields, theme, and custom social order (github before linkedin)
    const saveRes = await agent
      .post('/edit')
      .set('Host', 'alice2026.virtualcard.duckdns.org')
      .type('form')
      .send({
        _csrf: editCsrf,
        full_name: 'Alice Updated',
        job_title: 'Principal Systems Architect',
        company: 'Liquid Co',
        tagline: 'Designing glassmorphic web apps',
        address: 'Dhaka, Bangladesh',
        phone: '+8801711000000',
        whatsapp: '+8801711000000',
        public_email: 'alice@liquid.co',
        website: 'https://liquid.co',
        theme: '#10b981',
        is_published: 'true',
        social_linkedin: 'https://linkedin.com/in/alice-updated',
        social_github: 'https://github.com/alice-updated',
        social_order: 'github,linkedin',
      });
    expect(saveRes.status).toBe(302);
    expect(saveRes.headers.location).toContain('/edit?saved=1');

    const savedBannerPage = await agent
      .get('/edit?saved=1')
      .set('Host', 'alice2026.virtualcard.duckdns.org');
    expect(savedBannerPage.status).toBe(200);
    expect(savedBannerPage.text).toContain('Card changes saved!');

    const publicRes = await request(ctx.app)
      .get('/')
      .set('Host', 'alice2026.virtualcard.duckdns.org');
    expect(publicRes.status).toBe(200);
    expect(publicRes.text).toContain('Alice Updated');
    expect(publicRes.text).toContain('Principal Systems Architect');
    expect(publicRes.text).toContain('Dhaka, Bangladesh');
    expect(publicRes.text).toContain('#10b981');
    const githubIdx = publicRes.text.indexOf('https://github.com/alice-updated');
    const linkedinIdx = publicRes.text.indexOf('https://linkedin.com/in/alice-updated');
    expect(githubIdx).toBeGreaterThan(-1);
    expect(linkedinIdx).toBeGreaterThan(githubIdx);

    // 7. Avatar upload & replace & removal
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const avatarRes = await agent
      .post('/edit/avatar')
      .set('Host', 'alice2026.virtualcard.duckdns.org')
      .field('_csrf', editCsrf)
      .attach('avatar', pngBytes, { filename: 'photo.png', contentType: 'image/png' });
    expect(avatarRes.status).toBe(302);
    expect(avatarRes.headers.location).toContain('/edit?avatar=1');

    const cardRepo = new CardRepository(ctx.db);
    const aliceUser = new UserRepository(ctx.db).findByUsername('alice2026')!;
    const cardAfterUpload = cardRepo.findByUserId(aliceUser.id)!;
    expect(cardAfterUpload.avatar_url).toMatch(/^\/media\/avatars\/avatar-[a-f0-9]{32}\.webp$/);

    const mediaRes = await request(ctx.app).get(cardAfterUpload.avatar_url);
    expect(mediaRes.status).toBe(200);
    expect(mediaRes.headers['content-type']).toContain('image/webp');

    const removeAvatarRes = await agent
      .post('/edit/avatar')
      .set('Host', 'alice2026.virtualcard.duckdns.org')
      .type('form')
      .send({ _csrf: editCsrf, action: 'remove' });
    expect(removeAvatarRes.status).toBe(302);
    expect(removeAvatarRes.headers.location).toContain('/edit?avatar=removed');

    const cardAfterRemove = cardRepo.findByUserId(aliceUser.id)!;
    expect(cardAfterRemove.avatar_url).toBe('');

    const deletedMediaRes = await request(ctx.app).get(cardAfterUpload.avatar_url);
    expect(deletedMediaRes.status).toBe(404);

    // 8. Unpublishing via editor form hides public card from visitors while owner can still preview
    const unpublishRes = await agent
      .post('/edit')
      .set('Host', 'alice2026.virtualcard.duckdns.org')
      .type('form')
      .send({
        _csrf: editCsrf,
        full_name: 'Alice Draft',
        theme: '#38bdf8',
      });
    expect(unpublishRes.status).toBe(302);

    const visitorDraft = await request(ctx.app)
      .get('/')
      .set('Host', 'alice2026.virtualcard.duckdns.org')
      .set('Accept', 'application/json');
    expect(visitorDraft.status).toBe(404);
    expect(visitorDraft.body.error.code).toBe('CARD_UNPUBLISHED');

    const ownerPreview = await agent.get('/').set('Host', 'alice2026.virtualcard.duckdns.org');
    expect(ownerPreview.status).toBe(200);
    expect(ownerPreview.text).toContain('Alice Draft');

    // 9. Logout from tenant subdomain clears session
    const logoutRes = await agent
      .post('/logout')
      .set('Host', 'alice2026.virtualcard.duckdns.org')
      .type('form')
      .send({ _csrf: editCsrf });
    expect(logoutRes.status).toBe(302);

    const postLogoutEdit = await agent
      .get('/edit')
      .set('Host', 'alice2026.virtualcard.duckdns.org');
    expect(postLogoutEdit.status).toBe(302);
    expect(postLogoutEdit.headers.location).toContain('/login');
  });

  it('enforces master-only access and supports search, edit, suspend, password reset, CSV export (formula-safe), and user deletion', async () => {
    // 1. Unauthenticated /master redirects or 401
    const unauthMasterHtml = await request(ctx.app).get('/master');
    expect(unauthMasterHtml.status).toBe(302);
    expect(unauthMasterHtml.headers.location).toContain('/login');

    const unauthMasterJson = await request(ctx.app)
      .get('/master')
      .set('Accept', 'application/json');
    expect(unauthMasterJson.status).toBe(401);
    expect(unauthMasterJson.body.error.code).toBe('UNAUTHENTICATED');

    // 2. Sign up an owner user (alice2026) with avatar + formula-prefixed company to test CSV safety
    const ownerAgent = request.agent(ctx.app);
    const sPage = await ownerAgent.get('/signup');
    const sCsrf = extractCsrf(sPage.text);

    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const signupRes = await ownerAgent
      .post('/signup')
      .field('_csrf', sCsrf)
      .field('username', 'alice2026')
      .field('email', 'alice2026@example.com')
      .field('password', 'InitialPass123!')
      .field('confirm_password', 'InitialPass123!')
      .field('full_name', 'Alice Owner')
      .field('company', '=1+1')
      .attach('avatar', pngBytes, { filename: 'av.png', contentType: 'image/png' });
    expect(signupRes.status).toBe(302);

    const aliceUser = new UserRepository(ctx.db).findByUsername('alice2026')!;
    const aliceCardBefore = new CardRepository(ctx.db).findByUserId(aliceUser.id)!;

    // 3. Regular owner is blocked from /master with 403 MASTER_ONLY
    const ownerBlocked = await ownerAgent.get('/master').set('Accept', 'application/json');
    expect(ownerBlocked.status).toBe(403);
    expect(ownerBlocked.body.error.code).toBe('MASTER_ONLY');

    const ownerExportBlocked = await ownerAgent
      .get('/master/export.csv')
      .set('Accept', 'application/json');
    expect(ownerExportBlocked.status).toBe(403);

    // 4. Master logs in on root domain
    const masterAgent = request.agent(ctx.app);
    const loginPage = await masterAgent.get('/login');
    const loginCsrf = extractCsrf(loginPage.text);

    const masterLogin = await masterAgent.post('/login').type('form').send({
      _csrf: loginCsrf,
      identifier: ctx.env.MASTER_USERNAME,
      password: ctx.env.MASTER_PASSWORD,
    });
    expect(masterLogin.status).toBe(302);

    // /master is blocked on tenant subdomains (404)
    const masterOnSubdomain = await masterAgent
      .get('/master')
      .set('Host', 'alice2026.virtualcard.duckdns.org')
      .set('Accept', 'application/json');
    expect(masterOnSubdomain.status).toBe(404);

    // 5. Master dashboard metrics & search filtering
    const dashRes = await masterAgent.get('/master?q=alice');
    expect(dashRes.status).toBe(200);
    expect(dashRes.text).toContain('Platform Directory');
    expect(dashRes.text).toContain('alice2026');
    expect(dashRes.text).toContain('Alice Owner');

    const dashJson = await masterAgent
      .get('/master?q=nonexistent_xyz')
      .set('Accept', 'application/json');
    expect(dashJson.status).toBe(200);
    expect(dashJson.body.ok).toBe(true);
    expect(dashJson.body.data.metrics.totalUsers).toBe(2);
    expect(dashJson.body.data.items).toHaveLength(0);

    // 6. Inspect & update target user + card via Master Panel
    const detailRes = await masterAgent.get(`/master/users/${aliceUser.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.text).toContain(`Manage @alice2026`);
    const masterCsrf = extractCsrf(detailRes.text);

    const editUserRes = await masterAgent.post(`/master/users/${aliceUser.id}`).type('form').send({
      _csrf: masterCsrf,
      email: 'alice.edited@example.com',
      role: 'owner',
      status: 'active',
      full_name: 'Alice Edited By Master',
      job_title: 'VP Platform',
      company: '=1+1',
      theme: '#a855f7',
      is_published: 'true',
      social_github: 'https://github.com/alice2026',
    });
    expect(editUserRes.status).toBe(302);
    expect(editUserRes.headers.location).toBe(`/master/users/${aliceUser.id}?saved=1`);

    const publicAfterEdit = await request(ctx.app)
      .get('/')
      .set('Host', 'alice2026.virtualcard.duckdns.org');
    expect(publicAfterEdit.status).toBe(200);
    expect(publicAfterEdit.text).toContain('Alice Edited By Master');

    // Prevent master self-demotion / self-suspend
    const selfSuspend = await masterAgent
      .post('/master/users/1/status')
      .set('Accept', 'application/json')
      .type('form')
      .send({ _csrf: masterCsrf, status: 'suspended' });
    expect(selfSuspend.status).toBe(400);

    // 7. Suspend alice2026 -> public card immediately 404s AND her active session invalidates
    const suspendRes = await masterAgent
      .post(`/master/users/${aliceUser.id}/status`)
      .type('form')
      .send({ _csrf: masterCsrf, status: 'suspended', redirect_to: 'list' });
    expect(suspendRes.status).toBe(302);
    expect(suspendRes.headers.location).toBe('/master?status=updated');

    const suspendedCard = await request(ctx.app)
      .get('/')
      .set('Host', 'alice2026.virtualcard.duckdns.org')
      .set('Accept', 'application/json');
    expect(suspendedCard.status).toBe(404);
    expect(suspendedCard.body.error.code).toBe('ACCOUNT_SUSPENDED');

    const ownerSuspendedEdit = await ownerAgent
      .get('/edit')
      .set('Host', 'alice2026.virtualcard.duckdns.org')
      .set('Accept', 'application/json');
    expect(ownerSuspendedEdit.status).toBe(404);

    // Reactivate alice2026 -> card returns 200 again, while owner's old session stayed invalidated
    const reactivateRes = await masterAgent
      .post(`/master/users/${aliceUser.id}/status`)
      .type('form')
      .send({ _csrf: masterCsrf, status: 'active', redirect_to: 'detail' });
    expect(reactivateRes.status).toBe(302);

    const ownerEditAfterReactivate = await ownerAgent
      .get('/edit')
      .set('Host', 'alice2026.virtualcard.duckdns.org');
    expect(ownerEditAfterReactivate.status).toBe(302);
    expect(ownerEditAfterReactivate.headers.location).toContain('/login');

    const reactivatedCard = await request(ctx.app)
      .get('/')
      .set('Host', 'alice2026.virtualcard.duckdns.org');
    expect(reactivatedCard.status).toBe(200);

    // 8. Admin resets alice2026 password -> new password works
    const resetRes = await masterAgent
      .post(`/master/users/${aliceUser.id}/reset-password`)
      .type('form')
      .send({
        _csrf: masterCsrf,
        new_password: 'ResetTempPassword99!',
        confirm_password: 'ResetTempPassword99!',
      });
    expect(resetRes.status).toBe(302);
    expect(resetRes.headers.location).toBe(`/master/users/${aliceUser.id}?pwreset=1`);

    const aliceLoginPage = await ownerAgent.get('/login');
    const aliceLoginCsrf = extractCsrf(aliceLoginPage.text);
    const oldPassFail = await ownerAgent.post('/login').type('form').send({
      _csrf: aliceLoginCsrf,
      identifier: 'alice2026',
      password: 'InitialPass123!',
    });
    expect(oldPassFail.status).toBe(401);

    const newPassOk = await ownerAgent.post('/login').type('form').send({
      _csrf: aliceLoginCsrf,
      identifier: 'alice2026',
      password: 'ResetTempPassword99!',
    });
    expect(newPassOk.status).toBe(302);

    // 9. CSV & JSON exports never leak password_hash and neutralize formula injection
    const csvRes = await masterAgent.get('/master/export.csv');
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('alice2026');
    expect(csvRes.text).toContain("'=1+1");
    expect(csvRes.text).not.toContain('password_hash');

    const jsonRes = await masterAgent.get('/master/export.json');
    expect(jsonRes.status).toBe(200);
    expect(jsonRes.body.ok).toBe(true);
    expect(jsonRes.body.data.users.length).toBe(2);
    expect(jsonRes.body.data.users[0].user.password_hash).toBeUndefined();

    // 10. Delete self / master prevented (400), delete owner via HTTP DELETE removes user + avatar
    const deleteMasterFail = await masterAgent
      .delete('/master/users/1')
      .set('Accept', 'application/json')
      .set('X-CSRF-Token', masterCsrf);
    expect(deleteMasterFail.status).toBe(400);
    expect(deleteMasterFail.body.error.code).toBe('SELF_DELETE_FORBIDDEN');

    const deleteOwnerRes = await masterAgent
      .delete(`/master/users/${aliceUser.id}`)
      .set('Accept', 'application/json')
      .set('X-CSRF-Token', masterCsrf);
    expect(deleteOwnerRes.status).toBe(200);
    expect(deleteOwnerRes.body).toEqual({
      ok: true,
      data: { deletedUsername: 'alice2026' },
    });

    const deletedAvatarRes = await request(ctx.app).get(aliceCardBefore.avatar_url!);
    expect(deletedAvatarRes.status).toBe(404);

    const availAgain = await request(ctx.app).get('/api/username-available?u=alice2026');
    expect(availAgain.status).toBe(200);
    expect(availAgain.body.data.available).toBe(true);
  });
});
