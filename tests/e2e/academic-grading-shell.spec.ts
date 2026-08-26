import { expect, test } from '@playwright/test';

test('la aplicación base responde antes de incorporar la libreta', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Iniciar Sesión' })).toBeVisible({ timeout: 60_000 });
});
