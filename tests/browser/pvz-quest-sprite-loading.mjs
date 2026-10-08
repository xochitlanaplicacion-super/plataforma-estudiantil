import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';

// Isolated loopback harness exercises the exact published catalogue/rendering
// modules. It does not bypass or call production teacher authentication.
const project = fileURLToPath(new URL('../../', import.meta.url));
const assets = resolve(project, 'public/games/pvz-quest');
const html = `<!doctype html><html data-pvz-asset-root="/games/pvz-quest"><head>
<style>body{margin:20px;background:#eceac8}#cards{display:flex;flex-wrap:wrap}#cards canvas{width:112px;height:90px}#board{max-width:960px}</style>
</head><body><div id="cards"></div><canvas id="board"></canvas><script type="module">
import {UNITS} from '/games/pvz-quest/classroom/catalog.js';
import {BoardRenderer,renderCard} from '/games/pvz-quest/classroom/renderer.js';
const cards=Object.values(UNITS).map(unit=>{
  const canvas=document.createElement('canvas');canvas.id=unit.id;canvas.width=112;canvas.height=90;
  document.querySelector('#cards').append(canvas);
  return renderCard(canvas,unit.id).then(loaded=>({id:unit.id,loaded}));
});
window.board=new BoardRenderer(document.querySelector('#board'));
window.board.setView({units:[{id:'football-test',typeId:'football',side:'zombies',row:2,col:6,hp:8,maxHp:8}],mowers:Array(5).fill(false)});
window.spriteChecks=Promise.all(cards);
window.boardReady=window.board.load();
window.redPixels=(id)=>{
  const canvas=document.querySelector(id);
  const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>150&&pixels[i+1]<100&&pixels[i+2]<100&&pixels[i+3]>100)count++;
  return count;
};
</script></body></html>`;
const types = { '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
    assert(pathname.startsWith('/games/pvz-quest/'));
    const path = resolve(assets, pathname.slice('/games/pvz-quest/'.length));
    assert(path.startsWith(assets + sep));
    response.setHeader('Content-Type', types[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PVZ_BROWSER || '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const scenarios = [
    { name: 'PC: all shop portraits and football board animation are visible', options: { viewport: { width: 1360, height: 900 } } },
    { name: 'iPad: the football sprite recovers on cards and board after eight seconds', slow: true,
      options: { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true } },
    { name: 'Phone: a failed football request recovers automatically without reloading', retry: true,
      options: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
  ];
  for (const scenario of scenarios) {
    const context = await browser.newContext(scenario.options);
    const page = await context.newPage();
    const errors = [];
    let requests = 0;
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/FootballZombieWalk_300.png', async route => {
      requests += 1;
      if (scenario.retry && requests === 1) { await route.abort('failed'); return; }
      if (scenario.slow) await new Promise(resolve => setTimeout(resolve, 11000));
      await route.continue();
    });
    try {
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.spriteChecks && window.boardReady);
      const cards = await page.evaluate(() => window.spriteChecks);
      await page.evaluate(() => window.boardReady);
      if (scenario.slow) {
        assert.equal(cards.find(card => card.id === 'football').loaded, false);
        assert.equal(await page.evaluate(() => window.redPixels('#football')), 0);
        assert.equal(await page.evaluate(() => window.board.images.get('/assets/images/Zombies/FootballZombieWalk_300.png')), null);
      } else assert(cards.every(card => card.loaded), JSON.stringify(cards));
      await page.waitForFunction(() => window.redPixels('#football') > 100 &&
        !!window.board.images.get('/assets/images/Zombies/FootballZombieWalk_300.png'), null, { timeout: 20000 });
      const animation = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 120;
        const ctx = canvas.getContext('2d');
        const results = [];
        for (const clock of [0, 135, 540, 1755, 3915]) {
          ctx.clearRect(0, 0, 120, 120);
          const target = window.board.context;
          window.board.context = ctx;
          ctx.translate(-690, -209);
          window.board.drawUnit({ id: 'football-test', typeId: 'football', side: 'zombies', row: 2, col: 6, hp: 8, maxHp: 8 }, clock);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          window.board.context = target;
          const pixels = ctx.getImageData(0, 0, 120, 120).data;
          let red = 0;
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 150 && pixels[i + 1] < 100 && pixels[i + 2] < 100 && pixels[i + 3] > 100) red++;
          results.push(red);
        }
        return results;
      });
      assert(animation.every(red => red > 100), JSON.stringify(animation));
      assert.equal(requests, scenario.retry ? 2 : 1);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `/tmp/pvz-football-${scenario.slow ? 'slow-ipad' : scenario.retry ? 'retry-phone' : 'desktop'}.png` });
      console.log(`PASS ${scenario.name}`);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
