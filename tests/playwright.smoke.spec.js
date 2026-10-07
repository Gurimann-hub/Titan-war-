const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

test.describe('Titan War Front-End Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  });

  test('Page loads with accessible title, favicon, and canonical link', async ({ page }) => {
    await expect(page).toHaveTitle(/TITAN WAR/);

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', 'https://titanwar.intel/');

    const favicon = page.locator('link[rel="icon"]');
    await expect(favicon).toHaveAttribute('href', 'assets/favicon.svg');
  });

  test('Audio defaults to OFF and muted state', async ({ page }) => {
    const audioState = page.locator('#audio-state');
    await expect(audioState).toHaveText('OFF');

    const audioBtn = page.locator('#audio-toggle-btn');
    await expect(audioBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(audioBtn).toHaveClass(/muted/);
  });

  test('Modals have role="dialog" and aria-modal="true"', async ({ page }) => {
    const intelModal = page.locator('#intel-modal');
    await expect(intelModal).toHaveAttribute('role', 'dialog');
    await expect(intelModal).toHaveAttribute('aria-modal', 'true');

    const smtpModal = page.locator('#smtp-setup-modal');
    await expect(smtpModal).toHaveAttribute('role', 'dialog');
    await expect(smtpModal).toHaveAttribute('aria-modal', 'true');
  });

  test('Clicking a war news card opens accessible modal and Escape key closes it', async ({ page }) => {
    const card = page.locator('[data-intel-id="intel-1"]').first();
    await card.scrollIntoViewIfNeeded();
    await card.click({ force: true });

    const intelModal = page.locator('#intel-modal');
    await expect(intelModal).not.toHaveClass(/hidden/);

    // Press Escape to dismiss
    await page.keyboard.press('Escape');
    await expect(intelModal).toHaveClass(/hidden/);
  });

  test('Footer contains legal modal links for Privacy, Terms, and Refund', async ({ page }) => {
    const privacyBtn = page.locator('[data-intel-id="intel-privacy"]');
    await privacyBtn.scrollIntoViewIfNeeded();
    await expect(privacyBtn).toBeVisible();

    await privacyBtn.click();
    const intelModal = page.locator('#intel-modal');
    await expect(intelModal).not.toHaveClass(/hidden/);
    await expect(page.locator('#modal-body-content')).toContainText('Privacy Policy');

    await page.keyboard.press('Escape');
    await expect(intelModal).toHaveClass(/hidden/);
  });

  test('Responsive check at 360px viewport width has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // Allowance for subpixel rounding
  });

  test('Dossier modal displays Last Verified audit badge and primary source citations', async ({ page }) => {
    const card = page.locator('[data-intel-id="intel-2"]').first();
    await card.scrollIntoViewIfNeeded();
    await card.click({ force: true });

    const intelModal = page.locator('#intel-modal');
    await expect(intelModal).not.toHaveClass(/hidden/);
    await expect(page.locator('.modal-verification-bar')).toBeVisible();
    await expect(page.locator('.modal-verification-bar')).toContainText('LAST AUDIT');
    await expect(page.locator('.modal-sources-block')).toBeVisible();
    await expect(page.locator('.source-link').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(intelModal).toHaveClass(/hidden/);
  });
});
