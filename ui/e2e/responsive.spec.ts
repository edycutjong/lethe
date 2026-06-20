import { test, expect } from '@playwright/test';

test.describe('Lethe Dashboard Responsive Design Tests', () => {
  test('should render properly on desktop viewports', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Check main elements
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByText('Campaign Onboarding')).toBeVisible();
  });

  test('should render properly on mobile viewports', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Check header logo and elements are still visible and stacked
    await expect(page.locator('header').getByText('LETHE')).toBeVisible();
    await expect(page.getByText('Campaign Onboarding')).toBeVisible();
  });
});
