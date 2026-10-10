import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from '@playwright/test';

// Loopback only: the production template remains protected by teacher login.
const root = resolve('public');
const template = (await readFile('src/lib/games/pvz-quest/template.html', 'utf8'))
  .replace('<html lang="es">', '<html lang="es" data-pvz-asset-root="/games/pvz-quest">')
  .replace('<head>', '<head><base href="/games/pvz-quest/classroom/">');
const bridge = `
window.questTest = {
  state: () => structuredClone(match),
  stop: stopLiveLoop,
  ice: () => gameAudio.play('freeze'),
  boundary(round, tacticalPauses = match.config.tacticalPauses) {
    stopLiveLoop();
    const elapsed = round * match.config.waveSeconds - .1;
    match = { ...match, config: { ...match.config, tacticalPauses }, round, elapsed, tickCount: Math.round(elapsed * 60), accumulator: 0,
      waveElapsed: match.config.waveSeconds - .1, paused: false, initialStaging: false,
      tacticalPhase: null, pendingWave: null, units: [], closing: false, waveEnding: true,
      assistantNextActionAt: Infinity, cpuNextActionAt: Infinity, mowers: Array(5).fill(true) };
    const result = stepLive(match,.25); match = result.state;
    render(); updateLiveUI(result.events);
  },
};`;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(template); return; }
    if (pathname === '/api/classroom/ai-status') { response.setHeader('Content-Type', 'application/json'); response.end('{"configured":false}'); return; }
    const path = resolve(root, '.' + pathname);
    assert(path.startsWith(root + sep));
    let contents = await readFile(path);
    if (pathname === '/games/pvz-quest/classroom/app.js') contents = contents.toString() + bridge;
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg' })[extname(path)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.end(contents);
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PVZ_BROWSER || '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const cases = [
    { name: 'PC duel', mode: 'duel', options: { viewport: { width: 1366, height: 768 } } },
    { name: 'iPad class Plants', mode: 'coop-plants', options: { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true } },
    { name: 'phone class Zombies', mode: 'coop-zombies', options: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
  ];
  for (const scenario of cases) {
    const context = await browser.newContext(scenario.options);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.questTest && !document.querySelector('#start').disabled);
      // This regression covers the previously approved classroom balance;
      // result-hud.mjs separately verifies Classic is the default on every screen.
      await page.selectOption('#balance-profile', 'aula');
      await page.selectOption('[name="mode"]', scenario.mode);
      await page.selectOption('[name="timer"]', '0');
      await page.fill('[name="rounds"]', '7');
      await page.click('#start');
      await page.evaluate(() => window.questTest.stop());
      assert.equal((await page.evaluate(() => window.questTest.state())).config.balanceProfile, 'aula');
      assert.equal((await page.evaluate(() => window.questTest.state())).zombieSpeed, .35);
      const sides = scenario.mode === 'duel' ? ['plants', 'zombies'] : [scenario.mode === 'coop-plants' ? 'plants' : 'zombies'];
      for (const side of sides) for (let reward = 0; reward < 13; reward++) await page.click(`#controls [data-action="award"][data-side="${side}"][data-amount="100"]`);
      if (scenario.mode === 'duel') {
        await page.click('[data-action="initial-coin"]');
        await page.waitForFunction(() => window.questTest.state().tacticalPhase === 'shopping');
      } else await page.click('#live-pause');
      for (let turn = 0; turn < sides.length; turn++) {
        const side = (await page.evaluate(() => window.questTest.state())).activeSide;
        const type = side === 'plants' ? 'spikeweed' : 'common';
        const count = side === 'plants' ? 20 : 60;
        for (let index = 0; index < count; index++) {
          await page.click(`#controls [data-action="select"][data-id="${type}"]`);
          const bounds = await page.locator('#board').boundingBox();
          const row = side === 'plants' ? Math.floor(index / 6) : index % 5;
          const col = side === 'plants' ? 1 + index % 6 : 7;
          await page.mouse.click(bounds.x + (48 + (col + .5) * 108) / 960 * bounds.width,
            bounds.y + (44 + (row + .5) * 90) / 540 * bounds.height);
          if (index === 10) assert.equal((await page.evaluate(() => window.questTest.state())).purchasesBySideThisWave[side], 11);
        }
        const bought = await page.evaluate(() => window.questTest.state());
        assert.equal(bought.resources[side], 0);
        assert.equal(bought.stats.resourcesSpent[side], 1500);
        assert.equal(bought.purchasesBySideThisWave[side], count);
        if (scenario.mode === 'duel') await page.click('[data-action="tactical-confirm"]');
      }
      if (scenario.mode === 'duel') {
        await page.click('[data-action="tactical-resume"]');
        await page.evaluate(() => window.questTest.stop());
      }
      assert.equal(await page.evaluate(() => window.questTest.ice()), true, 'Audio is unlocked by the start click');
      await page.click('.menu > summary');
      await page.click('#sound-toggle');
      assert.equal(await page.evaluate(() => window.questTest.ice()), false, 'Mute also silences ice');
      await page.click('.menu > summary');
      await page.click('[data-action="speed-preset"][data-speed="1.3"]');
      assert.match(await page.locator('#zombie-speed-mode').textContent(), /Manual/);
      await page.evaluate(() => window.questTest.boundary(1));
      assert.equal((await page.evaluate(() => window.questTest.state())).zombieSpeed, 1.3, 'A tactical pause does not silently reset the manual choice');
      for (const expected of [.55, 1.7]) {
        await page.waitForFunction(() => window.questTest.state().tacticalPhase === 'shopping');
        await page.click('[data-action="tactical-confirm"]');
        await page.click('[data-action="tactical-confirm"]');
        await page.click('[data-action="tactical-resume"]');
        await page.evaluate(() => window.questTest.stop());
        const resumed = await page.evaluate(() => window.questTest.state());
        assert.equal(resumed.zombieSpeed, expected);
        assert.equal(resumed.zombieSpeedMode, 'auto');
        assert.match(await page.locator('#zombie-speed-mode').textContent(), /automática/);
        if (expected === .55) await page.evaluate(() => window.questTest.boundary(5));
      }
      if (scenario.mode !== 'coop-zombies') {
        if (scenario.mode === 'duel') await page.click('[data-action="live-side"][data-side="plants"]');
        const iceCard = page.locator('[data-id="snow-pea"]');
        assert.equal(await iceCard.count(), 1);
        assert.match(await iceCard.textContent(), /175/);
        assert.match(await iceCard.textContent(), /4/);
      }
      await page.evaluate(() => window.questTest.boundary(2, false));
      const uninterrupted = await page.evaluate(() => window.questTest.state());
      assert.equal(uninterrupted.round, 3);
      assert.equal(uninterrupted.zombieSpeed, .8);
      assert.equal(uninterrupted.paused, false);
      assert.equal(uninterrupted.tacticalPhase, null);
      assert.match(await page.locator('.quest-announcement.start').textContent(), /Comienza la oleada 3/);
      assert.match(await page.locator('.quest-announcement.start').textContent(), /Tranquila/);
      assert.deepEqual(errors, []);
      console.log(`PASS ${scenario.name}: spends 1500 beyond ten purchases; automatic speed with and without tactical pauses; audio mute; no JS errors`);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
