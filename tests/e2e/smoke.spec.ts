import { test, expect } from '@playwright/test';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test('E2E smoke: signup -> subdomain -> QR -> owner edit -> master suspend', async ({ page }) => {
  const username = 'smokecard';

  // 1. Landing page -> Signup
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /create your own/i })).toBeVisible();
  await page
    .getByRole('link', { name: /get started|create.*card/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/signup$/);

  // Check password mismatch warning UI
  await page.fill('#signup-username', username);
  await page.fill('#signup-email', 'smokecard@example.com');
  await page.fill('#signup-password', 'SmokeUserPass123!');
  await page.fill('#signup-confirm-password', 'WrongMatchPass123!');
  await expect(page.locator('#password-match-hint')).toContainText('Passwords do not match');

  // Fix password confirmation & check debounced username availability
  await page.fill('#signup-confirm-password', 'SmokeUserPass123!');
  await expect(page.locator('#password-match-hint')).toContainText('Passwords match');
  await expect(page.locator('#username-availability')).toContainText(`✓ ${username} is available!`);

  // Advance to Step 2
  await page.click('#btn-next-step');
  await expect(page.locator('#step-2-panel')).not.toHaveClass(/is-collapsed/);

  // Fill card data + upload avatar + select emerald accent
  await page.fill('#card-full-name', 'Smoke Test Founder');
  await page.fill('#card-job-title', 'Platform Architect');
  await page.fill('#card-company', 'Liquid Systems');
  await page.fill('#card-tagline', 'End-to-end verified card');
  await page.setInputFiles('#card-avatar', {
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });
  await page.locator('label[title="Emerald Green"]').click();

  await page.getByRole('button', { name: /launch my virtual card/i }).click();
  await expect(page).toHaveURL(/\/signup\/success$/);
  await expect(page.getByRole('heading', { name: /Your Virtual Card Is Live!/i })).toBeVisible();

  // 2. Public card via *.localhost subdomain resolution & ?__tenant= + QR checks
  const subdomainUrl = `http://${username}.localhost:3199/`;
  const cardResp = await page.goto(subdomainUrl);
  expect(cardResp?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Smoke Test Founder' })).toBeVisible();
  await expect(page.getByText('Platform Architect')).toBeVisible();
  await expect(page.getByText('Liquid Systems')).toBeVisible();

  // Expand corner QR badge & verify 2048px PNG + SVG QR endpoints
  await page.locator('.qr-corner-summary').click();
  const qrPngLink = page.locator('a[href*="/qr.png"]');
  await expect(qrPngLink).toBeVisible();
  const qrPngHref = await qrPngLink.getAttribute('href');
  const qrSvgHref = await page.locator('a[href*="/qr.svg"]').getAttribute('href');

  const qrPngRes = await page.request.get(qrPngHref || `/qr.png?size=2048&__tenant=${username}`);
  expect(qrPngRes.status()).toBe(200);
  expect(qrPngRes.headers()['content-type']).toContain('image/png');

  const qrSvgRes = await page.request.get(qrSvgHref || `/qr.svg?__tenant=${username}`);
  expect(qrSvgRes.status()).toBe(200);
  expect(qrSvgRes.headers()['content-type']).toContain('image/svg+xml');

  // 3. Owner Editor on local dev URL (inherits session cookie)
  await page.goto(`http://localhost:3199/edit?__tenant=${username}`);
  await expect(page).toHaveTitle(new RegExp(`Edit Card \\(@${username}\\)`));

  // Verify live preview updates synchronously in browser
  await page.fill('#edit-full-name', 'Smoke Test Updated');
  await expect(page.locator('#preview-name')).toHaveText('Smoke Test Updated');
  await page.fill('#edit-tagline', 'Edited live in Playwright');
  await expect(page.locator('#preview-tagline')).toHaveText('Edited live in Playwright');

  await page.getByRole('button', { name: /save card changes/i }).click();
  await expect(page).toHaveURL(/saved=1/);
  await expect(page.locator('#editor-toast')).toContainText('Card changes saved!');

  // Verify changes persisted on public subdomain card
  await page.goto(subdomainUrl);
  await expect(page.getByRole('heading', { name: 'Smoke Test Updated' })).toBeVisible();
  await expect(page.getByText('Edited live in Playwright')).toBeVisible();

  // Log out as owner
  await page.goto(`http://localhost:3199/edit?__tenant=${username}`);
  await page.getByRole('button', { name: /log out/i }).click();

  // 4. Master Admin Login -> Search -> Suspend -> Verify subdomain returns 404
  await page.goto('http://localhost:3199/login');
  await page.fill('#login-identifier', 'master');
  await page.fill('#login-password', 'MasterE2EPass2026!');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/master$/);

  await expect(page.getByText(`@${username}`)).toBeVisible();

  // Suspend user row via quick action
  const targetRow = page.locator('tbody tr', { hasText: `@${username}` });
  await targetRow.getByRole('button', { name: /^suspend$/i }).click();
  await expect(page).toHaveURL(/\/master\?notice=status_updated/);

  const updatedRow = page.locator('tbody tr', { hasText: `@${username}` });
  await expect(updatedRow.getByText('suspended')).toBeVisible();

  // Verify suspended public subdomain now returns 404
  const suspendedCardResp = await page.goto(subdomainUrl);
  expect(suspendedCardResp?.status()).toBe(404);
});
