import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
  launchOptions: {
    args: [
      '--host-resolver-rules=MAP virtualcard.duckdns.org 127.0.0.1,MAP *.virtualcard.duckdns.org 127.0.0.1',
    ],
  },
});

test.describe('Mobile Browser Ergonomics & Touch Viewport', () => {
  test('1. Landing page: no overflow, hamburger toggle opens and closes on outside click', async ({ page }) => {
    await page.goto('/');

    // Check zero horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasHorizontalOverflow).toBe(false);

    // Desktop nav links should be hidden on mobile <= 768px
    const desktopLinks = page.locator('.glass-nav-links');
    await expect(desktopLinks).toBeHidden();

    // Hamburger button should be visible
    const hamburger = page.locator('.glass-nav-toggle-btn');
    await expect(hamburger).toBeVisible();

    // Click hamburger to open dropdown
    await hamburger.click();
    const dropdown = page.locator('.glass-nav-mobile-dropdown');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.getByRole('link', { name: /live preview/i })).toBeVisible();
    await expect(dropdown.getByRole('link', { name: /get started/i })).toBeVisible();

    // Click outside to dismiss
    await page.mouse.click(10, 500);
    await expect(page.locator('.glass-nav-mobile')).not.toHaveAttribute('open', '');

    // Check Subdomain Quick Claim bar on mobile: button is full width (no empty void space)
    const claimBar = page.locator('.claim-bar');
    const claimBtn = claimBar.locator('button[type="submit"]');
    await expect(claimBar).toBeVisible();
    await expect(claimBtn).toBeVisible();

    const barBox = await claimBar.boundingBox();
    const btnBox = await claimBtn.boundingBox();
    expect(barBox).not.toBeNull();
    expect(btnBox).not.toBeNull();
    if (barBox && btnBox) {
      // Button should fill at least 85% of claimBar width on phone (no awkward half-empty void)
      expect(btnBox.width / barBox.width).toBeGreaterThanOrEqual(0.85);
    }
  });

  test('2. Login page: clear password placeholder and 16px font-size to prevent iOS Safari auto-zoom', async ({ page }) => {
    await page.goto('/login');

    const passInput = page.locator('#login-password');
    await expect(passInput).toBeVisible();
    // Verify placeholder is readable and NOT confusing bullets
    await expect(passInput).toHaveAttribute('placeholder', 'Enter your password');

    // Verify computed font-size is at least 16px to prevent iOS auto-zoom
    const computedFontSize = await passInput.evaluate((el) => window.getComputedStyle(el).fontSize);
    expect(parseFloat(computedFontSize)).toBeGreaterThanOrEqual(16);
  });

  test('3. Card editor on mobile: view switcher toggles between edit form and live preview with no overflow', async ({ page }) => {
    // Perform signup to get an editor workspace
    const username = `mob${Date.now().toString().slice(-6)}`;
    await page.goto('/signup');

    await page.fill('#signup-username', username);
    await page.fill('#signup-email', `${username}@example.com`);
    await page.fill('#signup-password', 'MobileTest2026!');
    await page.fill('#signup-confirm-password', 'MobileTest2026!');
    await page.click('#btn-next-step');

    await page.fill('#card-full-name', 'Mobile User');
    await page.fill('#card-job-title', 'UX Specialist');
    await page.getByRole('button', { name: /launch my virtual card/i }).click();

    await page.waitForURL(/\/signup\/success/);

    // Navigate to editor
    await page.goto(`/edit?__tenant=${username}`);

    // Verify zero horizontal overflow on mobile
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasHorizontalOverflow).toBe(false);

    // Check mobile view switcher buttons are visible
    const editTab = page.locator('#mobile-tab-edit');
    const previewTab = page.locator('#mobile-tab-preview');
    await expect(editTab).toBeVisible();
    await expect(previewTab).toBeVisible();

    // Initially edit form is visible, preview card is hidden
    await expect(page.locator('#section-identity')).toBeVisible();
    await expect(page.locator('.editor-preview-col')).toBeHidden();

    // Switch to Live Preview
    await previewTab.click();
    await expect(page.locator('#editor-layout')).toHaveAttribute('data-mobile-view', 'preview');
    await expect(page.locator('.editor-preview-col')).toBeVisible();
    await expect(page.locator('#section-identity')).toBeHidden();

    // Switch back to Edit Form
    await editTab.click();
    await expect(page.locator('#editor-layout')).toHaveAttribute('data-mobile-view', 'edit');
    await expect(page.locator('#section-identity')).toBeVisible();
    await expect(page.locator('.editor-preview-col')).toBeHidden();

    // Verify bottom sticky save bar is visible and formatted for mobile
    const saveBar = page.locator('.editor-sticky-save');
    await expect(saveBar).toBeVisible();
  });
});
