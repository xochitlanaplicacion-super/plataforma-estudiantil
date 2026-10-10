import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve('public');
const template = (await readFile('src/lib/games/pvz-quest/template.html', 'utf8'))
  .replace('<html lang="es">', '<html lang="es" data-pvz-asset-root="/games/pvz-quest">')
  .replace('<head>', '<head><base href="/games/pvz-quest/classroom/">');

// Test hooks are appended only to this loopback response. Never expose these
// state setters or bypass teacher access in the production asset package.
const bridge = `
window.sunPauseTest = {
  info() {
    return {
      money: match.resources.plants, elapsed: match.elapsed,
      awarded: match.stats.resourcesAwarded.plants,
      income: match.stats.resourcesIncome.plants,
      paused: match.paused, tacticalPhase: match.tacticalPhase,
      timers: sunRewardTimers.size,
      canvasSuns: renderer.liveEffects.filter(effect => effect.event.type === 'sun').length,
      flights: document.querySelectorAll('[data-passive-sun]').length,
      manualFlights: document.querySelectorAll('.reward-flight:not([data-passive-sun])').length,
    };
  },
  play() {
    stopLiveLoop(); presentation.clear(); tacticalVisualKey = '';
    match = { ...match, phase: 'live', paused: false, initialStaging: false,
      tacticalPhase: null, tacticalPublicBaseline: null, tacticalPublicResources: null,
      pendingWave: null, assistantNextActionAt: Infinity, cpuNextActionAt: Infinity };
    render();
  },
  queueSun() {
    updateLiveUI([{ type: 'sun', unitId: 'browser-test-flower', row: 2, col: 2,
      side: 'plants', amount: 25 }]);
  },
  coin() {
    stopLiveLoop(); presentation.clear();
    // Hold the valid coin phase without its auto-completion animation so the
    // test can observe a delayed sunflower timer across the pause boundary.
    match = { ...match, paused: true, initialStaging: false, tacticalPhase: 'coin',
      pendingWave: 2, tacticalOrder: ['plants', 'zombies'], tacticalIndex: 0,
      activeSide: 'plants',
      tacticalPublicBaseline: { units: structuredClone(match.units), stats: structuredClone(match.stats) },
      tacticalPublicResources: structuredClone(match.resources) };
    tacticalVisualKey = '2:coin'; render();
  },
  pause() { stopLiveLoop(); match = pauseLive(match, true); render(); },
};`;

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html'); response.end(template); return;
    }
    if (pathname === '/api/classroom/ai-status') {
      response.setHeader('Content-Type', 'application/json'); response.end('{"configured":false}'); return;
    }
    const path = resolve(root, '.' + pathname);
    assert(path.startsWith(root + sep));
    let contents = await readFile(path);
    if (pathname === '/games/pvz-quest/classroom/app.js') contents = contents.toString() + bridge;
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg',
      '.png': 'image/png', '.mp3': 'audio/mpeg' })[extname(path)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store'); response.end(contents);
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PVZ_BROWSER || '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const scenarios = [
    { name: 'PC', viewport: { width: 1366, height: 768 } },
    { name: 'iPad touch', viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true },
    { name: 'phone touch', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
  ];
  for (const { name, ...options } of scenarios) {
    const context = await browser.newContext({ ...options, reducedMotion: 'no-preference' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.sunPauseTest && !document.querySelector('#start').disabled);
      await page.selectOption('[name="mode"]', 'coop-plants');
      await page.selectOption('[name="tempo"]', 'continuous');
      await page.selectOption('[name="questionMode"]', 'manual');
      await page.selectOption('[name="waveSeconds"]', '600');
      await page.selectOption('[name="timer"]', '0');
      await page.uncheck('[name="audio"]');
      await page.click('#start');
      await page.evaluate(() => window.sunPauseTest.play());
      const original = await page.evaluate(() => window.sunPauseTest.info());

      // A canvas sun is scheduled for a HUD flight 650 ms later. Entering the
      // coin phase before that deadline must cancel the delayed timer entirely.
      await page.evaluate(() => window.sunPauseTest.queueSun());
      let info = await page.evaluate(() => window.sunPauseTest.info());
      assert.equal(info.timers, 1); assert.equal(info.canvasSuns, 1); assert.equal(info.flights, 0);
      await page.waitForTimeout(100);
      await page.evaluate(() => window.sunPauseTest.coin());
      info = await page.evaluate(() => window.sunPauseTest.info());
      assert.equal(info.paused, true); assert.equal(info.tacticalPhase, 'coin');
      assert.equal(info.timers, 0); assert.equal(info.canvasSuns, 0); assert.equal(info.flights, 0);
      assert.equal(info.money, original.money, 'Passive visual cancellation does not change previously earned money');

      // Exercise the real award button: tactical pauses must not disable the
      // teacher's points or delete the manually awarded resource flight.
      const award = page.locator('#controls [data-action="award"][data-side="plants"][data-amount="100"]');
      assert.equal(await award.isEnabled(), true);
      await award.click();
      info = await page.evaluate(() => window.sunPauseTest.info());
      assert.equal(info.money, original.money + 100);
      assert.equal(info.awarded, original.awarded + 100);
      assert.equal(info.income, original.income);
      assert.equal(info.flights, 0); assert(info.manualFlights >= 1);
      assert.equal(Number(await page.locator('#plant-money').textContent()), original.money + 100);
      await page.waitForTimeout(750);
      info = await page.evaluate(() => window.sunPauseTest.info());
      assert.equal(info.timers, 0); assert.equal(info.canvasSuns, 0); assert.equal(info.flights, 0);
      assert.equal(info.elapsed, original.elapsed); assert.equal(info.money, original.money + 100);

      // Also interrupt a sun after the delayed callback has already created
      // its DOM flight. Pausing removes it immediately, not at animationend.
      await page.evaluate(() => window.sunPauseTest.play());
      assert.equal(await page.locator('[data-passive-sun]').count(), 0);
      await page.evaluate(() => window.sunPauseTest.queueSun());
      await page.waitForSelector('[data-passive-sun]', { timeout: 2000 });
      info = await page.evaluate(() => window.sunPauseTest.info());
      assert.equal(info.flights, 1); assert.equal(info.timers, 0);
      await page.evaluate(() => window.sunPauseTest.pause());
      info = await page.evaluate(() => window.sunPauseTest.info());
      assert.equal(info.paused, true); assert.equal(info.timers, 0);
      assert.equal(info.canvasSuns, 0); assert.equal(info.flights, 0);
      await award.click();
      info = await page.evaluate(() => window.sunPauseTest.info());
      assert.equal(info.money, original.money + 200); assert.equal(info.income, original.income);
      assert(info.manualFlights >= 1, 'Ordinary teacher-award flights survive paused rendering');
      await page.waitForTimeout(750);
      await page.evaluate(() => window.sunPauseTest.play());
      await page.waitForTimeout(750);
      info = await page.evaluate(() => window.sunPauseTest.info());
      assert.equal(info.timers, 0); assert.equal(info.canvasSuns, 0); assert.equal(info.flights, 0);
      assert.equal(info.money, original.money + 200);
      assert.equal(info.elapsed, original.elapsed, 'Stopped loopback fixture cannot farm during the test');
      assert.deepEqual(errors, []);
      console.log('PASS ' + name + ': pending/flying sun cancelled across coin and pause, teacher rewards preserved, no replay');
    } finally { await context.close(); }
  }
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
}
