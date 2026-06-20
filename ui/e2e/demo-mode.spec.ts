import { test, expect } from '@playwright/test';

test.describe('Lethe Dashboard Demo Mode Smoke Tests', () => {
  test('should load the dashboard successfully with metadata', async ({ page }) => {
    // Open the home page
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/Lethe/);

    // Check header logo
    const headerLogo = page.locator('header').getByText('LETHE');
    await expect(headerLogo).toBeVisible();

    // Check SLA Target
    const slaTarget = page.getByText('SLA TARGET');
    await expect(slaTarget).toBeVisible();

    // Check TEE Enclave status badge
    const statusLabel = page.getByText('TEE ENCLAVE:');
    await expect(statusLabel).toBeVisible();
  });
});
