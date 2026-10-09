import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';

const project = fileURLToPath(new URL('../../', import.meta.url));
const assets = resolve(project, 'public/games/pvz-quest');
const html = `<!doctype html><html data-pvz-asset-root="/games/pvz-quest"><body>
<canvas id="board"></canvas><canvas id="card" width="112" height="90"></canvas>
<script type="module">
import {getUnit} from '/games/pvz-quest/classroom/catalog.js';
import {BoardRenderer,renderCard} from '/games/pvz-quest/classroom/renderer.js';
window.board=new BoardRenderer(document.querySelector('#board'));
window.ready=Promise.all(['peashooter','common','chomper','wallnut'].map(async typeId=>{
  const src=getUnit(typeId).sprite.src;
  const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src='/games/pvz-quest'+src;});
  window.board.images.set(src,image);
}));
window.card=async typeId=>{
  const canvas=document.querySelector('#card');await renderCard(canvas,typeId);
  return inspect(canvas);
};
function inspect(canvas){
  const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  let blue=0,visible=0,hash=2166136261;
  for(let i=0;i<pixels.length;i+=4){
    if(pixels[i+3]>100){visible++;if(pixels[i+2]>pixels[i]*1.15&&pixels[i+2]>pixels[i+1]*1.05)blue++;}
    for(let k=0;k<4;k++)hash=Math.imul(hash^pixels[i+k],16777619)>>>0;
  }
  return {blue,visible,hash};
}
window.unit=(typeId,options={},elapsed=0,clock=1000)=>{
  const definition=getUnit(typeId),canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const context=canvas.getContext('2d'),previous=window.board.context;
  window.board.context=context;window.board.view.elapsed=elapsed;
  context.translate(-362,-205);
  window.board.drawUnit({id:'unit-visual',typeId,side:definition.side,row:2,col:3,hp:definition.hp,maxHp:definition.hp,...options},clock);
  window.board.context=previous;
  return inspect(canvas);
};
</script></body></html>`;
const types = { '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
    assert(pathname.startsWith('/games/pvz-quest/'));
    const path = resolve(assets, pathname.slice('/games/pvz-quest/'.length));
    assert(path.startsWith(assets + sep));
    response.setHeader('Content-Type', types[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PVZ_BROWSER || '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ready && window.card && window.unit);
  await page.evaluate(() => window.ready);
  const results = await page.evaluate(async () => ({
    green: await window.card('peashooter'), ice: await window.card('snow-pea'),
    normal: window.unit('common'), frozen: window.unit('common', { freezeUntil: 14 }, 10), thawed: window.unit('common', { freezeUntil: 14 }, 14),
    bite: window.unit('chomper', { chompCooldown: 30 }, 10), chew: window.unit('chomper', { chompCooldown: 30 }, 12), swallow: window.unit('chomper', { chompCooldown: 30 }, 29),
    pausedA: window.unit('chomper', { chompCooldown: 30 }, 15, 1000), pausedB: window.unit('chomper', { chompCooldown: 30 }, 15, 35000),
    nut: window.unit('wallnut', { hp: 10, maxHp: 10 }), damagedNut: window.unit('wallnut', { hp: 6, maxHp: 10 }), criticalNut: window.unit('wallnut', { hp: 3, maxHp: 10 }),
  }));
  assert(results.ice.blue > results.green.blue + 500, 'Snow pea uses genuinely blue pixels, including its shop card');
  assert(results.frozen.blue > results.normal.blue + 200, 'Frozen zombies are visibly blue without coloring the lawn');
  assert.equal(results.thawed.hash, results.normal.hash, 'Thawed zombies return to their original art');
  for (const pose of ['bite', 'chew', 'swallow', 'damagedNut', 'criticalNut']) assert(results[pose].visible > 1000, `${pose} cannot be an empty sprite`);
  assert.equal(new Set(['bite', 'chew', 'swallow'].map(key => results[key].hash)).size, 3, 'Jaw closing, chewing and swallowing have distinct original art');
  assert.equal(results.pausedA.hash, results.pausedB.hash, 'A paused chomper does not visually consume its cooldown');
  assert.equal(new Set(['nut', 'damagedNut', 'criticalNut'].map(key => results[key].hash)).size, 3);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks: 13, iceBluePixels: results.ice.blue, frozenBluePixels: results.frozen.blue }));
  await context.close();
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
