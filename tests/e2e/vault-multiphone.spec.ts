import { expect, test } from '@playwright/test';
import sharp from 'sharp';

test.describe('Multi-Phone Public Card & Zero-Knowledge Private Vault E2E', () => {
  test('owner adds additional phone/social, downloads per-phone vcf, initializes vault, saves records, uploads compressed OCR doc, and searches', async ({
    page,
  }) => {
    const username = `vaulte2e${Date.now().toString().slice(-6)}`;

    // 1. Sign up fresh user
    await page.goto('/signup');
    await page.fill('#signup-username', username);
    await page.fill('#signup-email', `${username}@example.com`);
    await page.fill('#signup-password', 'StrongVaultE2E2026!');
    await page.fill('#signup-confirm-password', 'StrongVaultE2E2026!');
    await page.click('#btn-next-step');

    await page.fill('#card-full-name', 'Rafiul Hasan');
    await page.fill('#card-job-title', 'Cloud Architect');
    await page.fill('#card-company', 'Dhaka Systems');
    await page.getByRole('button', { name: /launch my virtual card/i }).click();
    await page.waitForURL(/\/signup\/success/);

    // 2. Card Editor: Add primary + extra phone number, Google Maps link, extra social
    await page.goto(`/edit?__tenant=${username}`);
    await page.fill('#edit-phone', '+8801700001111');
    await page.fill('#edit-address', 'Motijheel C/A, Dhaka');
    await page.click('#generate-maps-url-btn');
    await expect(page.locator('#edit-maps-url')).toHaveValue(/google\.com\/maps\/search/);

    await page.click('#add-phone-row-btn');
    const phoneRows = page.locator('#phone-rows-container .dynamic-row');
    const lastPhoneRow = phoneRows.last();
    await lastPhoneRow.locator('input[type="text"]').fill('Office Hotline');
    await lastPhoneRow.locator('input[type="tel"]').fill('+8801800002222');

    await page.click('#add-extra-social-btn');
    const extraSocialRow = page.locator('#extra-socials-container .dynamic-row').last();
    await extraSocialRow.locator('select').selectOption('telegram');
    await extraSocialRow.locator('input').nth(1).fill('@rafiul_work');

    await page.getByRole('button', { name: /save card changes/i }).click();
    await expect(page.locator('.glass-alert-success')).toBeVisible();

    // 3. Public Card: Check Save to Phone, per-phone Save #, Google Maps, Extra Social
    await page.goto(`/?__tenant=${username}`);
    await expect(page.getByText('Save Contact to Phone (.vcf)')).toBeVisible();
    await expect(page.getByText('Office Hotline')).toBeVisible();
    await expect(page.getByText('+8801800002222')).toBeVisible();
    await expect(page.locator('a[href*="google.com/maps"]')).toBeVisible();
    await expect(page.getByText('@rafiul_work')).toBeVisible();

    // Verify per-phone single-number vCard endpoint works directly
    const vcfResponse = await page.request.get(`/vcard?__tenant=${username}&phone=1`);
    expect(vcfResponse.status()).toBe(200);
    const vcfBody = await vcfResponse.text();
    expect(vcfBody).toContain('+8801800002222');
    expect(vcfBody).not.toContain('+8801700001111');

    // 4. Switch to Private Vault and initialize Vault Passcode
    await page.goto(`/edit?__tenant=${username}`);
    await page.locator('.workspace-switcher a', { hasText: 'Private Vault' }).click();
    await page.waitForURL(/\/vault/);

    await expect(page.getByText('Create Your Private Vault Passcode')).toBeVisible();
    await page.fill('#setup-passcode', 'MyVaultPin2026!');
    await page.fill('#setup-confirm-passcode', 'MyVaultPin2026!');
    await page.getByRole('button', { name: /initialize & unlock private vault/i }).click();

    await expect(page.locator('#vault-nid')).toBeVisible();

    // 5. Fill Personal Identity, Academic + Semester Result, Present & Permanent Addresses
    await page.fill('#vault-nid', '1997554433221');
    await page.fill('#vault-passport', 'P88776655');

    await page.click('#add-academic-btn');
    const acadCard = page.locator('#vault-academics-list .dynamic-row').first();
    await acadCard.locator('select').selectOption('HSC');
    await acadCard.getByRole('button', { name: '+ Add Semester Result' }).click();
    const semInputs = acadCard.locator('.vault-semester-grid input');
    await semInputs.nth(0).fill('Final Term');
    await semInputs.nth(1).fill('5.00');
    await semInputs.nth(3).fill('Golden GPA');

    await page.click('#add-present-address-btn');
    await page.fill('#perm-district', 'Sylhet');
    await page.click('#build-perm-maps-btn');
    await expect(page.locator('#perm-maps-url')).toHaveValue(/Sylhet/);

    await page.click('#save-vault-profile-btn');
    await expect(page.locator('.glass-alert-success')).toBeVisible();
    await expect(page.locator('#vault-nid')).toHaveValue('1997554433221');

    // 6. Upload PNG Document for Auto-Compression & Offline OCR Search
    const docPng = await sharp(
      Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="840" height="200">
          <rect width="100%" height="100%" fill="#ffffff"/>
          <text x="40" y="120" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="bold" fill="#000000">
            WARRANTY CERT SYL2026
          </text>
        </svg>
      `)
    )
      .png()
      .toBuffer();

    await page.setInputFiles('#doc-file-input', {
      name: 'warranty.png',
      mimeType: 'image/png',
      buffer: docPng,
    });
    await page.fill('#doc-title-input', 'Camera Warranty Paper');
    await page.selectOption('#doc-category-select', 'warranty_paper');
    await page.fill('#doc-tags-input', 'camera, canon');
    await page.click('#doc-upload-submit-btn');

    await expect(page.locator('.vault-doc-card')).toContainText('Camera Warranty Paper');
    await expect(page.locator('.vault-doc-card')).toContainText('Compressed');

    // 7. Live OCR Search & Highlighting
    await page.fill('#vault-search-input', 'SYL2026');
    const hitLink = page.locator('#vault-search-results .vault-search-hit').first();
    await expect(hitLink).toBeVisible();
    await expect(hitLink.locator('mark.vault-highlight')).toContainText('SYL2026');

    // 8. Lock Vault and verify locked state
    await page.click('#header-lock-vault-btn');
    await expect(page.getByText('Private Vault is Locked')).toBeVisible();
    await expect(page.locator('#unlock-passcode')).toBeVisible();
  });
});
