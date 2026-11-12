import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnvOrExit } from '../../src/lib/env.js';
import { createLogger } from '../../src/lib/logger.js';
import { createDatabase } from '../../src/db/index.js';
import { createApp } from '../../src/app.js';
import { seedMasterAdmin } from '../../src/db/seed.js';
import { terminateOcrWorker } from '../../src/lib/documentProcessor.js';

function extractCsrf(html: string): string {
  const m = html.match(/name="_csrf"\s+value="([^"]+)"/);
  if (!m) throw new Error('Failed to extract _csrf token from HTML');
  return m[1];
}

describe('Multi-Phone Cards, Private Vault, OCR Search & Master Blindness Integration', () => {
  let tmpDir: string;
  let sqliteDb: ReturnType<typeof createDatabase>['sqliteDb'];
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-vault-int-'));
    process.env.NODE_ENV = 'development';
    process.env.PORT = '3099';
    process.env.BASE_DOMAIN = '127.0.0.1';
    process.env.DATABASE_URL = path.join(tmpDir, 'test.db');
    process.env.UPLOAD_DIR = path.join(tmpDir, 'uploads');
    process.env.SESSION_SECRET = 'integration_vault_secret_min_32_characters_long';
    process.env.MASTER_USERNAME = 'master';
    process.env.MASTER_EMAIL = 'master@example.com';
    process.env.MASTER_PASSWORD = 'MasterVaultInt2026!';
    process.env.LOG_LEVEL = 'silent';

    const env = loadEnvOrExit();
    const logger = createLogger({ nodeEnv: 'development', logLevel: 'silent' });
    const dbConn = createDatabase(env.DATABASE_URL);
    sqliteDb = dbConn.sqliteDb;
    migrate(dbConn.db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });
    await seedMasterAdmin(dbConn.db, {
      username: env.MASTER_USERNAME,
      email: env.MASTER_EMAIL,
      password: env.MASTER_PASSWORD,
    });
    app = createApp({ env, db: dbConn.db, sqliteDb, logger });
  });

  afterAll(async () => {
    await terminateOcrWorker();
    sqliteDb?.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('supports multi-phone vCard, zero-knowledge vault encryption, compressed OCR search, and strictly blinds Master admin', async () => {
    const ownerAgent = request.agent(app);

    // 1. Owner signs up
    const signupPage = await ownerAgent.get('/signup');
    const signupCsrf = extractCsrf(signupPage.text);

    const signupRes = await ownerAgent
      .post('/signup')
      .type('form')
      .send({
        _csrf: signupCsrf,
        username: 'nadia',
        email: 'nadia@example.com',
        password: 'OwnerStrongPass2026!',
        confirm_password: 'OwnerStrongPass2026!',
        full_name: 'Nadia Rahman',
        job_title: 'Product Director',
        company: 'Dhaka Labs',
      });
    expect(signupRes.status).toBe(302);

    // 2. Owner saves multiple phone numbers, Google Maps link, and extra social accounts
    const editPage = await ownerAgent.get('/edit?__tenant=nadia');
    expect(editPage.status).toBe(200);
    const editCsrf = extractCsrf(editPage.text);

    const updateCardRes = await ownerAgent
      .post('/edit?__tenant=nadia')
      .type('form')
      .send({
        _csrf: editCsrf,
        full_name: 'Nadia Rahman',
        job_title: 'Product Director',
        company: 'Dhaka Labs',
        tagline: 'Shipping fast',
        address: 'Gulshan 2, Dhaka',
        maps_url: 'https://maps.google.com/?q=Gulshan+2+Dhaka',
        phone: '+8801711111111',
        whatsapp: '+8801722222222',
        phones_json: JSON.stringify([
          { id: 'primary', label: 'Mobile', number: '+8801711111111', is_whatsapp: false },
          { id: 'support', label: 'Support Desk', number: '+8801833333333', is_whatsapp: true },
        ]),
        extra_socials_json: JSON.stringify([
          { id: 'tg1', platform: 'telegram', label: 'Direct Telegram', value: '@nadiarahman', kind: 'handle' },
        ]),
        public_email: 'nadia@dhakalabs.io',
        website: 'https://dhakalabs.io',
        theme: '#38bdf8',
        is_published: 'on',
      });
    expect(updateCardRes.status).toBe(302);

    // Verify public card renders direct Save-to-Phone, Google Maps link & extra social
    const pubCard = await request(app).get('/?__tenant=nadia');
    expect(pubCard.status).toBe(200);
    expect(pubCard.text).toContain('Save Contact to Phone (.vcf)');
    expect(pubCard.text).toContain('Support Desk');
    expect(pubCard.text).toContain('+8801833333333');
    expect(pubCard.text).toContain('Direct Telegram');
    expect(pubCard.text).toContain('https://maps.google.com/?q=Gulshan+2+Dhaka');

    // Verify per-phone single-number .vcf download (/vcard?phone=1)
    const singleVcf = await request(app).get('/vcard?__tenant=nadia&phone=1');
    expect(singleVcf.status).toBe(200);
    expect(singleVcf.text).toContain('+8801833333333');
    expect(singleVcf.text).not.toContain('+8801711111111');

    // 3. Vault Setup + Wrong PIN rejection + Unlock
    const vaultSetupView = await ownerAgent.get('/vault?__tenant=nadia');
    expect(vaultSetupView.status).toBe(200);
    expect(vaultSetupView.text).toContain('Create Your Private Vault Passcode');
    const setupCsrf = extractCsrf(vaultSetupView.text);

    const setupRes = await ownerAgent
      .post('/vault/setup?__tenant=nadia')
      .type('form')
      .send({
        _csrf: setupCsrf,
        passcode: 'VaultSecret99!',
        confirm_passcode: 'VaultSecret99!',
      });
    expect(setupRes.status).toBe(302);

    // Lock vault cleanly and confirm wrong passcode returns 401
    const unlockedView = await ownerAgent.get('/vault?__tenant=nadia');
    expect(unlockedView.status).toBe(200);
    expect(unlockedView.text).toContain('Personal &amp; Government IDs');

    const lockCsrf = extractCsrf(unlockedView.text);
    const lockRes = await ownerAgent
      .post('/vault/lock?__tenant=nadia')
      .type('form')
      .send({ _csrf: lockCsrf });
    expect(lockRes.status).toBe(302);

    const lockedView = await ownerAgent.get('/vault?__tenant=nadia');
    expect(lockedView.text).toContain('Private Vault is Locked');

    const wrongUnlock = await ownerAgent
      .post('/vault/unlock?__tenant=nadia')
      .type('form')
      .send({
        _csrf: extractCsrf(lockedView.text),
        passcode: 'WrongPass123',
      });
    expect(wrongUnlock.status).toBe(401);
    expect(wrongUnlock.text).toContain('Incorrect');

    const goodUnlock = await ownerAgent
      .post('/vault/unlock?__tenant=nadia')
      .type('form')
      .send({
        _csrf: extractCsrf(wrongUnlock.text),
        passcode: 'VaultSecret99!',
      });
    expect(goodUnlock.status).toBe(302);

    // 4. Save NID, Academics w/ Semester Results, Present & Permanent Addresses
    const unlockedAgain = await ownerAgent.get('/vault?__tenant=nadia');
    const profCsrf = extractCsrf(unlockedAgain.text);

    const saveProfRes = await ownerAgent
      .post('/vault/profile?__tenant=nadia')
      .type('form')
      .send({
        _csrf: profCsrf,
        payload: JSON.stringify({
          identity: {
            nid: '9988112233445',
            birthCertificateNo: 'BC-19980011',
            passportNumber: 'E0998877',
            tinNumber: 'TIN-123456',
            drivingLicenseNumber: 'DL-DHAKA-88',
            bloodGroup: 'A+',
            customFields: [{ id: 'cf1', label: 'Smart Card', value: 'SC-4455' }],
          },
          academics: [
            {
              id: 'ac1',
              examType: 'HSC',
              customExamType: '',
              institute: 'Viqarunnisa Noon College',
              boardOrUniversity: 'Dhaka',
              passingYear: '2017',
              instituteRoll: '1044',
              examRoll: '551199',
              registrationNo: 'REG-882211',
              overallResult: '5.00',
              semesters: [{ id: 's1', term: '1st Year Final', gpa: '4.95', credits: '6', remarks: 'Merit' }],
              customFields: [],
              notes: 'Science',
            },
          ],
          presentAddresses: [
            {
              id: 'pa1',
              label: 'Current Flat',
              addressLine: 'Road 71 Gulshan',
              city: 'Dhaka',
              postalCode: '1212',
              mapsUrl: 'https://maps.google.com/?q=Road+71+Gulshan',
              notes: '',
            },
          ],
          permanentAddress: {
            addressLine: 'Station Road',
            villageOrArea: 'Boalia',
            district: 'Rajshahi',
            country: 'Bangladesh',
            postalCode: '6000',
            mapsUrl: 'https://maps.google.com/?q=Rajshahi',
            notes: '',
          },
          customSections: [
            {
              id: 'cs1',
              title: 'Purchase Records',
              fields: [{ id: 'csf1', label: 'MacBook Pro Warranty', value: 'APPLE-WAR-777' }],
            },
          ],
        }),
      });
    expect(saveProfRes.status).toBe(302);

    // 5. Upload PNG Certificate -> verify WebP compression, OCR extraction & search
    const certSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="840" height="220">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <text x="40" y="95" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="bold" fill="#000000">
          DHAKA CERTIFICATE 778899
        </text>
        <text x="40" y="170" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="#000000">
          SERIAL WARRANTY 2029
        </text>
      </svg>
    `;
    const certPng = await sharp(Buffer.from(certSvg)).png().toBuffer();

    const afterProf = await ownerAgent.get('/vault?__tenant=nadia');
    expect(afterProf.text).toContain('9988112233445');
    const uploadCsrf = extractCsrf(afterProf.text);

    const uploadRes = await ownerAgent
      .post('/vault/documents?__tenant=nadia')
      .field('_csrf', uploadCsrf)
      .field('title', 'SSC Marksheet Scan')
      .field('category', 'certificate')
      .field('tags', 'dhaka, ssc')
      .field('document_date', '2026-01-10')
      .field('expiry_date', '')
      .field('linked_ref', 'HSC 2017')
      .field('notes', 'Original board copy')
      .attach('file', certPng, { filename: 'ssc-cert.png', contentType: 'image/png' });
    expect(uploadRes.status).toBe(302);

    // Confirm compressed image & OCR search via live JSON endpoint
    const searchJson = await ownerAgent
      .get('/vault/search?__tenant=nadia&q=778899')
      .set('Accept', 'application/json');
    expect(searchJson.status).toBe(200);
    expect(searchJson.body.ok).toBe(true);
    expect(searchJson.body.data.hits.length).toBeGreaterThan(0);
    const docHit = searchJson.body.data.hits.find((h: { kind: string }) => h.kind === 'document');
    expect(docHit).toBeDefined();

    // Confirm decrypted image file serves as WebP when unlocked
    const fileRes = await ownerAgent.get(`/vault/documents/${docHit.documentId}/file?__tenant=nadia`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers['content-type']).toContain('image/webp');
    expect(fileRes.body.length).toBeLessThan(certPng.length);

    // Confirm encrypted ciphertext on disk does NOT leak plaintext strings
    const vaultFilesDir = path.join(process.env.UPLOAD_DIR!, '_vault');
    const diskFiles = fs.readdirSync(vaultFilesDir, { recursive: true }) as string[];
    const encFiles = diskFiles.filter((f) => f.endsWith('.enc'));
    expect(encFiles.length).toBeGreaterThan(0);
    const rawDiskBlob = fs.readFileSync(path.join(vaultFilesDir, encFiles[0]));
    expect(rawDiskBlob.toString('utf8')).not.toContain('WEBP');
    expect(rawDiskBlob.toString('utf8')).not.toContain('778899');

    // 6. Strict Master Admin Blindness Check
    const masterAgent = request.agent(app);
    const mLoginPage = await masterAgent.get('/login');
    const mLoginRes = await masterAgent
      .post('/login')
      .type('form')
      .send({
        _csrf: extractCsrf(mLoginPage.text),
        identifier: 'master',
        password: 'MasterVaultInt2026!',
      });
    expect(mLoginRes.status).toBe(302);

    const masterVaultTry = await masterAgent.get('/vault?__tenant=nadia');
    expect(masterVaultTry.status).toBe(403);

    const masterSearchTry = await masterAgent.get('/vault/search?__tenant=nadia&q=9988112233445');
    expect(masterSearchTry.status).toBe(403);

    const masterDocTry = await masterAgent.get(`/vault/documents/${docHit.documentId}/file?__tenant=nadia`);
    expect(masterDocTry.status).toBe(403);

    const csvExport = await masterAgent.get('/master/export.csv');
    expect(csvExport.status).toBe(200);
    expect(csvExport.text).not.toContain('9988112233445');
    expect(csvExport.text).not.toContain('E0998877');
    expect(csvExport.text).not.toContain('778899');
    expect(csvExport.text).not.toContain('APPLE-WAR-777');

    const jsonExport = await masterAgent.get('/master/export.json');
    expect(jsonExport.status).toBe(200);
    expect(jsonExport.text).not.toContain('9988112233445');
    expect(jsonExport.text).not.toContain('E0998877');
    expect(jsonExport.text).not.toContain('778899');
  });
});
