import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:9002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : undefined,
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: process.env.ACADEMIC_STEP10_EVIDENCE === 'true' || process.env.ACADEMIC_STEP11_EVIDENCE === 'true' || process.env.ACADEMIC_STEP13_EVIDENCE === 'true'
      ? 'ACADEMIC_STEP10_EVIDENCE=true ACADEMIC_STEP11_EVIDENCE=true ACADEMIC_STEP13_EVIDENCE=true npm run dev'
      : 'npm run dev',
    env: {
      ...process.env,
      ACADEMIC_STEP10_EVIDENCE: process.env.ACADEMIC_STEP10_EVIDENCE ?? 'false',
      ACADEMIC_STEP11_EVIDENCE: process.env.ACADEMIC_STEP11_EVIDENCE ?? 'false',
      ACADEMIC_STEP13_EVIDENCE: process.env.ACADEMIC_STEP13_EVIDENCE ?? 'false',
    },
    url: 'http://127.0.0.1:9002',
    reuseExistingServer: !process.env.CI,
    // El proyecto completo puede tardar varios minutos en compilar en frío.
    // El límite sólo cubre el arranque; cada prueba conserva su timeout propio.
    timeout: 600_000,
  },
});
