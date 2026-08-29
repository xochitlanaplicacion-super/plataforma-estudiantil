import { expect, test } from '@playwright/test';

test.use({ video: 'on' });

test('Paso 10: estados, responsive, teclado y borrador → 100% → activar', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const evidenceRoot = 'docs/academic-grading/evidence/step10';

  for (const state of ['loading', 'empty', 'error', 'forbidden'] as const) {
    await page.goto(`/academic-step10-evidence?evidence=step10-local&state=${state}`);
    await page.screenshot({ path: `${evidenceRoot}/estado-${state}.png`, fullPage: true });
  }

  await page.goto('/academic-step10-evidence?evidence=step10-local&state=workspace');
  for (const viewport of [
    { name: 'movil-360', width: 360, height: 800 },
    { name: 'tableta-768', width: 768, height: 900 },
    { name: 'escritorio-1440', width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({ path: `${evidenceRoot}/${viewport.name}.png`, fullPage: true });
  }

  await page.getByLabel('Nombre del esquema').focus();
  await page.keyboard.type('Esquema E2E');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Esquema E2E · borrador/)).toBeVisible();

  await page.getByRole('textbox', { name: 'Criterio', exact: true }).fill('Examen final');
  await page.getByLabel('Peso %').fill('100');
  await expect(page.getByLabel('estado del total de ponderaciones')).toContainText('100.0000%');
  await page.getByRole('button', { name: 'Activar esquema' }).click();
  await expect(page.getByText('Esquema activo y persistencia confirmada.')).toBeVisible();
  await page.screenshot({ path: `${evidenceRoot}/flujo-activado.png`, fullPage: true });

  const html = await page.locator('main').innerHTML();
  expect(html).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|hsl\(/i);
  const video = page.video();
  await page.close();
  await video?.saveAs(`${evidenceRoot}/flujo-paso10.webm`);
  testInfo.annotations.push({ type: 'evidence', description: evidenceRoot });
});
