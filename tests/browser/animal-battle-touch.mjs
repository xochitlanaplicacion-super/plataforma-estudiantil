import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { chromium } from '@playwright/test';

const root = process.cwd();
const gameDir = path.join(root, 'public/games/squeak-and-destroy');
const template = path.join(root, 'src/lib/games/squeak-and-destroy/template.html');
const mime = { '.js':'text/javascript', '.css':'text/css', '.png':'image/png',
  '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2',
  '.json':'application/json', '.webmanifest':'application/manifest+json' };

test('dos equipos humanos y controles táctiles editables en iPad', async () => {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (relative.includes('..')) { res.writeHead(400).end(); return; }
      const filename = relative ? path.join(gameDir, relative) : template;
      const body = await readFile(filename);
      res.setHeader('Content-Type', relative ? mime[path.extname(filename)] || 'application/octet-stream' : 'text/html');
      res.writeHead(200).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
  const port = server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ executablePath:'/usr/bin/google-chrome', headless:true,
      args:['--no-sandbox','--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport:{width:1194,height:834},
      hasTouch:true, isMobile:true, deviceScaleFactor:2, locale:'es-MX' });
    const page = await context.newPage();
    const errors=[]; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.2:${port}/`, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.CA?.Menu?.go && window.CA?.settings);
    await page.evaluate(() => CA.Menu.go('newgame'));
    const duel = page.locator('.ng-human-choice [data-human="1"]');
    await duel.waitFor({state:'visible'});
    await duel.click();
    assert.equal(await duel.getAttribute('aria-pressed'),'true');
    const settingsButton = page.locator('#menu-root').getByText('Ajustar posición de cada botón táctil');
    await page.evaluate(() => CA.Menu.go('settings'));
    await settingsButton.click();
    const fire = page.locator('.abg-touch-editor-control[data-control="fire"]');
    await fire.waitFor({state:'visible'});
    const before=await page.evaluate(() => CA.settings.touchPositions.fire || null);
    const box=await fire.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width/2-80,box.y+box.height/2-45,{steps:5});
    await page.mouse.up();
    const after=await page.evaluate(() => CA.settings.touchPositions.fire);
    assert.ok(after && after.x>0 && after.x<1 && after.y>0 && after.y<1);
    assert.notDeepEqual(after,before);
    await page.locator('.abg-touch-editor-done').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ca_settings')).touchPositions.fire.x),after.x);
    await page.evaluate(() => CA.Menu.go('newgame'));
    await duel.click();
    await page.locator('#menu-root .screen.active').getByRole('button',{name:/Indítás|Start/}).first().click();
    await page.waitForFunction(() => window.CA?.state?.teams?.length>=2);
    assert.equal(await page.evaluate(() => CA.state.teams[1].isAI),false);
    assert.deepEqual(errors,[]);
  } finally {
    if(browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
