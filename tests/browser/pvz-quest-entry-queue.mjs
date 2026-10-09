import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { resolve, sep, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';

// Local-only bridge: neither teacher access nor production game files change.
const root = resolve('public');
const screenshots = await mkdtemp(join(tmpdir(), 'pvz-entry-queue-'));
const template = (await readFile('src/lib/games/pvz-quest/template.html', 'utf8'))
  .replace('<html lang="es">', '<html lang="es" data-pvz-asset-root="/games/pvz-quest">')
  .replace('<head>', '<head><base href="/games/pvz-quest/classroom/">');
const bridge = `
window.queueTest = {
  state: () => structuredClone(match), stop: stopLiveLoop,
  noAutomaticArrivals() { match.assistantNextActionAt = Infinity; match.cpuNextActionAt = Infinity; },
  assistantLane() {
    stopLiveLoop(); match.assistantWavePlan = ['common', 'bucket', 'football'].map((typeId, index) => ({ typeId, row: 1, at: match.elapsed + (index + 1) / 60 }));
    match.assistantNextIndex = 0; match.assistantNextActionAt = match.assistantWavePlan[0].at;
    this.advance(.05); this.noAutomaticArrivals();
  },
  advance(seconds) {
    stopLiveLoop(); const events = [];
    while (seconds > 1e-8) {
      const dt = Math.min(.25, seconds), result = stepLive(match, dt);
      match = result.state; events.push(...result.events); seconds -= dt;
    }
    render(); updateLiveUI(events);
  },
  drawn() {
    const drawn = [], original = renderer.drawUnit;
    renderer.drawUnit = function(unit, ...args) { drawn.push(unit.id); return original.call(this, unit, ...args); };
    try { renderer.draw(performance.now()); } finally { renderer.drawUnit = original; }
    return drawn;
  },
};`;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(template); return; }
    if (pathname === '/api/classroom/ai-status') { response.setHeader('Content-Type', 'application/json'); response.end('{"configured":false}'); return; }
    const path = resolve(root, '.' + pathname); assert(path.startsWith(root + sep));
    let contents = await readFile(path);
    if (pathname === '/games/pvz-quest/classroom/app.js') contents = contents.toString() + bridge;
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg' })[extname(path)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store'); response.end(contents);
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PVZ_BROWSER || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const cases = [
    { name: 'PC duel', mode: 'duel', profile: 'classic', viewport: { width: 1366, height: 768 } },
    { name: 'iPad class Zombies', mode: 'coop-zombies', profile: 'aula', viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true },
    { name: 'phone class Plants', mode: 'coop-plants', profile: 'classic', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
  ];
  for (const { name, mode, profile, ...options } of cases) {
    const context = await browser.newContext(options), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.queueTest && !document.querySelector('#start').disabled);
      await page.selectOption('#balance-profile', profile);
      await page.selectOption('[name="mode"]', mode); await page.selectOption('[name="timer"]', '0');
      await page.selectOption('[name="waveSeconds"]', '600'); await page.click('#start');
      await page.evaluate(() => window.queueTest.stop());
      if (mode === 'coop-plants') await page.evaluate(() => window.queueTest.assistantLane());
      else {
        if (mode === 'duel') {
          await page.click('[data-action="initial-coin"]');
          await page.waitForFunction(() => window.queueTest.state().tacticalPhase === 'shopping');
          if ((await page.evaluate(() => window.queueTest.state())).activeSide === 'plants') await page.click('[data-action="tactical-confirm"]');
        } else await page.click('#live-pause');
        await page.click('[data-action="award"][data-side="zombies"][data-amount="100"]');
        for (const typeId of ['common', 'bucket', 'football']) {
          await page.click('[data-action="select"][data-id="' + typeId + '"]');
          const bounds = await page.locator('#board').boundingBox();
          await page.mouse.click(bounds.x + (48 + 7.5 * 108) / 960 * bounds.width, bounds.y + (44 + 1.5 * 90) / 540 * bounds.height);
        }
        const staged = await page.evaluate(() => window.queueTest.state());
        assert.equal(staged.stats.resourcesSpent.zombies, 300); assert.equal(staged.resources.zombies, 0);
        const positions = staged.units.map(unit => [unit.id, unit.col, unit.entryPending]);
        await page.evaluate(() => window.queueTest.advance(5));
        assert.deepEqual((await page.evaluate(() => window.queueTest.state())).units.map(unit => [unit.id, unit.col, unit.entryPending]), positions, 'Pausing also freezes waiting arrivals');
      }
      let state = await page.evaluate(() => window.queueTest.state());
      const zombies = state.units.filter(unit => unit.side === 'zombies' && unit.row === 1);
      assert.deepEqual(zombies.map(unit => unit.typeId), ['common', 'bucket', 'football']);
      assert.deepEqual(zombies.map(unit => !!unit.entryPending), [false, true, true]);
      assert.match(await page.locator('#board-caption').textContent(), /En fila: B: 2/);
      const visible = await page.evaluate(() => window.queueTest.drawn());
      assert(visible.includes(zombies[0].id)); assert(!visible.includes(zombies[1].id)); assert(!visible.includes(zombies[2].id));
      await page.screenshot({ path: join(screenshots, name.replaceAll(' ', '-') + '-queued.png') });
      if (mode === 'duel') {
        await page.click('[data-action="tactical-confirm"]');
        if ((await page.evaluate(() => window.queueTest.state())).tacticalPhase === 'shopping') await page.click('[data-action="tactical-confirm"]');
        await page.click('[data-action="tactical-resume"]');
      } else if (mode === 'coop-zombies') await page.click('#live-pause');
      await page.evaluate(() => { window.queueTest.stop(); window.queueTest.noAutomaticArrivals(); });
      state = await page.evaluate(() => window.queueTest.state());
      const first = state.units.find(unit => unit.id === zombies[0].id);
      const secondsToClear = (first.col - 6) * 5 / (first.move * state.zombieSpeed);
      await page.evaluate(seconds => window.queueTest.advance(seconds), secondsToClear - .1);
      assert.equal((await page.evaluate(() => window.queueTest.state())).units.find(unit => unit.id === zombies[1].id).entryPending, true);
      await page.evaluate(() => window.queueTest.advance(.2));
      state = await page.evaluate(() => window.queueTest.state());
      assert(state.units.find(unit => unit.id === zombies[0].id).col <= 6);
      assert.equal(state.units.find(unit => unit.id === zombies[1].id).entryPending, false);
      assert.equal(state.units.find(unit => unit.id === zombies[2].id).entryPending, true, 'Faster football must not jump ahead of the earlier bucket');
      assert.equal(state.stats.resourcesSpent.zombies, mode === 'coop-plants' ? 0 : 300, 'Releasing arrivals never charges again');
      assert.match(await page.locator('#board-caption').textContent(), /En fila: B: 1/);
      const after = await page.evaluate(() => window.queueTest.drawn());
      assert(after.includes(zombies[1].id)); assert(!after.includes(zombies[2].id));
      assert.deepEqual(errors, []);
      await page.screenshot({ path: join(screenshots, name.replaceAll(' ', '-') + '-released.png') });
      console.log('PASS ' + name + ': FIFO, spacing, pause, payment, assistant and actual canvas visibility');
    } finally { await context.close(); }
  }
  console.log('Screenshots: ' + screenshots);
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
}
