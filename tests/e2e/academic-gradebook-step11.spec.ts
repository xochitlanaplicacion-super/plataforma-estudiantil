import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const evidenceDir = 'docs/academic-grading/evidence/step11';
mkdirSync(evidenceDir, { recursive: true });

test.use({ video: 'on' });

test('Paso 11: libreta, responsive, concurrencia y lote único', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const stateEvidence = [
    { state: 'loading', text: 'Cargando libreta de evidencia…' },
    { state: 'empty', text: 'La libreta todavía está vacía' },
    { state: 'error', text: 'No se pudo cargar' },
    { state: 'forbidden', text: 'Acceso no disponible' },
    { state: 'closed', text: 'Cerrado · sólo lectura' },
  ];
  for (const { state, text } of stateEvidence) {
    await page.goto(`/academic-step11-evidence?state=${state}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${evidenceDir}/estado-${state}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/academic-step11-evidence?state=workspace', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Matemáticas · Grupo 1° A' })).toBeVisible({ timeout: 30_000 });
  const firstGrade = page.getByLabel('Ramírez Ana, Examen parcial, calificación de 0 a 10').first();
  await firstGrade.fill('9.3');
  await firstGrade.press('ArrowDown');
  await expect(page.getByLabel('Sánchez Bruno, Examen parcial, calificación de 0 a 10').first()).toBeFocused();
  await page.getByRole('button', { name: 'Guardar lote' }).click();
  await expect(page.getByText('Cambios guardados y verificados al recargar la libreta.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('save-request-count')).toContainText('1');
  await expect(page.getByLabel('Recibo de auditoría del guardado')).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/flujo-guardado-desktop-1440.png`, fullPage: true });

  await page.goto('/academic-step11-evidence?state=conflict', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Matemáticas · Grupo 1° A' })).toBeVisible({ timeout: 30_000 });
  const conflictGrade = page.getByLabel('Ramírez Ana, Examen parcial, calificación de 0 a 10').first();
  await conflictGrade.fill('8.7');
  await page.getByRole('button', { name: 'Guardar lote' }).click();
  await expect(page.getByRole('heading', { name: 'Conciliar cambios recientes' })).toBeVisible({ timeout: 30_000 });
  await expect(conflictGrade).toHaveValue('8.7');
  await expect(page.getByTestId('save-request-count')).toContainText('1');
  await page.screenshot({ path: `${evidenceDir}/conflicto-sin-sobrescritura.png`, fullPage: true });

  await page.goto('/academic-step11-evidence?state=large', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Matemáticas · Grupo 1° A' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('200 alumnos')).toBeVisible();
  await page.getByPlaceholder('Buscar nombre o matrícula').fill('Alumno 200');
  await expect(page.getByText('Alumno 200').first()).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/grupo-200-alumnos.png`, fullPage: false });

  for (const viewport of [{ name: 'movil-360', width: 360, height: 800 }, { name: 'tableta-768', width: 768, height: 1000 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/academic-step11-evidence?state=workspace', { waitUntil: 'domcontentloaded' });
    if (viewport.width < 768) {
      await expect(page.getByTestId('mobile-gradebook')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('desktop-gradebook')).toBeHidden();
    } else {
      await expect(page.getByTestId('desktop-gradebook')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('mobile-gradebook')).toBeHidden();
    }
    await page.screenshot({ path: `${evidenceDir}/${viewport.name}.png`, fullPage: true });
  }

  const video = page.video();
  await page.close();
  if (video) await video.saveAs(`${evidenceDir}/flujo-paso11.webm`);
  await testInfo.attach('conteo-solicitudes', {
    body: 'Un clic explícito produjo exactamente 1 solicitud de guardado.',
    contentType: 'text/plain',
  });
});
