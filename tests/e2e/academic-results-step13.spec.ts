import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const evidenceDir = 'docs/academic-grading/evidence/step13';
mkdirSync(evidenceDir, { recursive: true });

test.use({ video: 'on' });

test('Paso 13: alumno propio, supervisión, estados y responsive', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/academic-step13-evidence?role=student&state=results', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Mis calificaciones' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Provisional', { exact: true })).toBeVisible();
  await expect(page.getByText(/9\.3\s*\/\s*10/).first()).toBeVisible();
  await expect(page.getByText('Alumno 02')).toHaveCount(0);
  await page.screenshot({ path: `${evidenceDir}/alumno-provisional-desktop-1440.png`, fullPage: true });

  for (const state of ['final', 'reopened', 'empty'] as const) {
    await page.goto(`/academic-step13-evidence?role=student&state=${state}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Mis calificaciones' })).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${evidenceDir}/alumno-${state}.png`, fullPage: true });
  }

  await page.goto('/academic-step13-evidence?role=management&state=results', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('tenant-results-table')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('28', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Paginación de resultados' })).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/supervision-desktop-1440.png`, fullPage: true });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/academic-step13-evidence?role=management&state=final', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('tenant-results-table')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('article').getByText('Final v2').first()).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/supervision-final-movil-360.png`, fullPage: true });

  await page.setViewportSize({ width: 768, height: 1000 });
  await page.goto('/academic-step13-evidence?role=student&state=reopened', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Reabierta', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${evidenceDir}/alumno-reabierto-tableta-768.png`, fullPage: true });
});
