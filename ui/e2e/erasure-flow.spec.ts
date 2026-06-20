import { test, expect } from '@playwright/test';

test.describe('Lethe Right-to-Erasure Lifecycle Flow', () => {
  test('should complete the entire onboarding, erasure execution, self-destruct, and reinitialization flow', async ({ page }) => {
    // 1. Navigate to the dashboard
    await page.goto('/');

    // Verify initial onboarding state
    await expect(page.getByText('Campaign Onboarding')).toBeVisible();
    await expect(page.locator('header')).toContainText('TEE ENCLAVE:');
    await expect(page.locator('header')).toContainText('UNTRUSTED HOST');

    // 2. Step 1: Wallet SIWE Onboarding
    const onboardButton = page.getByRole('button', { name: 'Onboard Wallet' });
    await expect(onboardButton).toBeVisible();
    await onboardButton.click();
    await expect(page.getByRole('button', { name: 'Authenticated' })).toBeVisible();
    await expect(page.locator('header')).toContainText('SECURED (Intel TDX)');

    // 3. Step 2: Delegate Agent
    const authorizeButton = page.getByRole('button', { name: 'Authorize scopes' });
    await expect(authorizeButton).toBeVisible();
    await authorizeButton.click();
    await expect(page.getByRole('button', { name: 'Authorized' })).toBeVisible();

    // 4. Step 3: Escrow & Micropayment
    const fundButton = page.getByRole('button', { name: 'Batch Fund' });
    await expect(fundButton).toBeVisible();
    await fundButton.click();

    // Verify onboarding is completed and hidden, and the main trigger shows up
    await expect(page.getByText('Campaign Onboarding')).not.toBeVisible();
    await expect(page.getByText('ERASE ME EVERYWHERE')).toBeVisible();

    // 5. Trigger Deletion Campaign
    const eraseButton = page.getByRole('button', { name: 'ERASE NOW' });
    await expect(eraseButton).toBeVisible();
    await eraseButton.click();

    // Wait for the campaign to execute (all 40 brokers, taking ~150ms per broker, total ~6 seconds)
    // We increase timeout to 15s to be safe
    await expect(page.getByRole('button', { name: 'ERASED' })).toBeVisible({ timeout: 15000 });

    // Verify that the evidence ledger and self-destruct triggers are now visible
    await expect(page.getByText('Signed Evidence Ledger')).toBeVisible();
    await expect(page.getByText('Initiate Cryptographic Purge')).toBeVisible();

    // 6. Trigger Self-Destruct Purge
    // Intercept window.confirm dialog to click OK
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('WARNING: This action is permanent and irreversible.');
      await dialog.accept();
    });

    const purgeButton = page.getByRole('button', { name: 'Purge Identity & Self-Destruct' });
    await expect(purgeButton).toBeVisible();
    await purgeButton.click();

    // Wait for the shredding sequence and transition to the de-authorized state
    await expect(page.getByText('Identity Erased')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('STATUS: 401 UNAUTHORIZED')).toBeVisible();

    // 7. Reinitialize Sandbox
    const reinitButton = page.getByRole('button', { name: 'Reinitialize Sandbox' });
    await expect(reinitButton).toBeVisible();
    await reinitButton.click();

    // Verify that it has successfully reinitialized to the clean onboarding state
    await expect(page.getByText('Campaign Onboarding')).toBeVisible();
    await expect(page.locator('header')).toContainText('UNTRUSTED HOST');
  });
});
