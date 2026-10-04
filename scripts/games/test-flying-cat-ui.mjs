// Isolated browser smoke test: no teacher/student credentials and no database writes.
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'flying-cat-browser-'));
await build({
  absWorkingDir: root,
  stdin: {
    contents: `import React from 'react';
import {createRoot} from 'react-dom/client';
import FlyingCatGame from './src/components/activities/flying-cat/FlyingCatGame';
const long = 'Una persona capacitada conduce aeronaves para transportar pasajeros y mercancías. Antes de despegar revisa los instrumentos y las condiciones del tiempo, y durante el viaje se comunica con la torre de control. Identifica la profesión que corresponde a esta descripción. ';
window.completedFlights=[];window.saveRequests=0;
createRoot(document.getElementById('root')).render(<div style={{height:'100dvh',display:'flex',flexDirection:'column'}}><header style={{height:56,flexShrink:0,background:'#234353',color:'white',padding:12}}>Vista de actividad · Flying Cat</header><main style={{minHeight:0,flex:1}}><FlyingCatGame exercise={{id:'qa',titulo:'Amazing jobs · prueba de vuelo',contenido:{version:1,instructions:'Lee la definición y pilota hacia el concepto correcto. Tienes tres vidas para esquivar obstáculos.',showFeedback:true,settings:{difficulty:'easy'},items:[{id:'q1',prompt:long.repeat(3),options:['Pilot','Doctor','Farmer','Teacher'],correctIndex:0,feedback:'Un piloto conduce aeronaves. Un médico atiende pacientes, un agricultor cultiva la tierra y un docente acompaña el aprendizaje. '.repeat(8)},{id:'q2',prompt:long,options:['Pilot','Doctor','Farmer','Teacher'],correctIndex:0,feedback:'Pilot significa piloto, la persona preparada para conducir una aeronave.'}]}}} onComplete={r=>{window.saveRequests++;if(location.search==='?fail=1'&&window.saveRequests===1)throw new Error('fallo de prueba');window.completedFlights.push(r);return null}} onClose={()=>{window.closed=true}}/></main></div>);`,
    resolveDir: root, sourcefile: 'flying-cat-browser-fixture.tsx', loader: 'tsx',
  },
  bundle: true, outfile: join(directory, 'main.js'), jsx: 'automatic',
  external: ['/games/*'],
  alias: { '@': resolve(root, 'src') }, define: { 'process.env.NODE_ENV': '"development"' },
});

const server = createServer(async (request, response) => {
  try {
    const requestPath = new URL(request.url, 'http://localhost').pathname;
    if (requestPath === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/main.css"><style>html,body,#root{margin:0;height:100%;overflow:hidden}</style></head><body><div id="root"></div><script src="/main.js"></script></body></html>');
      return;
    }
    const assetPaths = ['cat-aviator.jpg', 'paper.jpg', 'sky-hills.jpg'].map((name) => `/games/flying-cat/images/${name}`);
    if (!assetPaths.includes(requestPath) && !['/main.js', '/main.css'].includes(requestPath)) {
      response.statusCode = 404; response.end(); return;
    }
    const path = assetPaths.includes(requestPath)
      ? resolve(root, 'public', requestPath.slice(1)) : join(directory, requestPath.slice(1));
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg' };
    response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.statusCode = 404; response.end(); }
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const address = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.FLYING_CAT_BROWSER_PATH ? { executablePath: process.env.FLYING_CAT_BROWSER_PATH } : {}),
});
try {
  for (const device of [
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    { name: 'mobile-small', viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true },
    { name: 'mobile-landscape', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
    { name: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
  ]) {
    const context = await browser.newContext(device);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(address + (device.name === 'mobile-small' ? '/?fail=1' : '/'));
    await page.clock.install();
    assert.equal(await page.locator('.fc-cover-picture img').evaluate((img) => img.complete && img.naturalWidth > 0), true);
    assert.equal(await page.getByText('WASD o flechas', { exact: true }).count(), device.hasTouch ? 0 : 1);
    await page.getByRole('button', { name: /Comenzar vuelo/ }).click();
    assert.equal(await page.locator('.fc-touch-controls').count(), device.hasTouch ? 1 : 0);
    assert.equal(await page.getByRole('dialog').count(), 1);
    const start = page.getByRole('button', { name: /Continuar vuelo/ });
    await start.scrollIntoViewIfNeeded();
    const startBox = await start.boundingBox();
    assert(startBox.y >= 0 && startBox.y + startBox.height <= device.viewport.height, 'Long definition must not hide the resume button');
    await page.screenshot({ path: join(directory, `${device.name}-reading.png`) });
    await start.click();
    await page.clock.runFor(1000);
    assert.equal(await page.getByText(/Escudo ·/).count(), 1);
    assert.equal(await page.locator('.fc-art-energy-sphere').count(), 1, 'Immunity must show the blue energy sphere');
    await page.screenshot({ path: join(directory, `${device.name}-flight.png`) });
    assert.equal(await page.locator('.fc-card').count(), 1, 'The field has only one concept node');
    await page.getByRole('button', { name: /Pausar y releer/ }).click();
    await page.clock.runFor(3000);
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('button', { name: /Continuar vuelo/ }).click();
    await page.clock.runFor(100);
    assert.equal(await page.getByText('Escudo · 3 s').count(), 1);
    if (device.hasTouch) {
      // Two actual collisions, including a long explanation and next-definition transition.
      for (let question = 0; question < 2; question++) {
        let collision = false;
        for (let tick = 0; tick < 260; tick++) {
          await page.clock.runFor(100);
          if (await page.getByRole('dialog').count()) { collision = true; break; }
          // Isolate the question/input contract from random obstacle collisions.
          // Pausing/resuming is real UI interaction, not a production debug hook.
          if (tick > 0 && tick % 18 === 0) {
            await page.getByRole('button', { name: /Pausar y releer/ }).click();
            await page.getByRole('button', { name: /Continuar vuelo/ }).click();
            await page.clock.runFor(100);
          }
          const stage = await page.locator('.fc-stage').boundingBox();
          const card = await page.locator('.fc-card').boundingBox();
          if (card && card.x + card.width / 2 > stage.x + 70 && card.x + card.width / 2 < stage.x + stage.width - 50) {
            const x = card.x + card.width / 2;
            const y = card.y + card.height / 2 + 32;
            if (y < stage.y + stage.height - 2) await page.touchscreen.tap(x, y);
          }
        }
        assert(collision, 'Touch steering should collide with a concept and show feedback');
        assert.equal(await page.getByText('Explicación · vuelo en pausa', { exact: true }).count(), 1);
        await page.screenshot({ path: join(directory, `${device.name}-feedback-${question}.png`) });
        const next = page.getByRole('button', { name: question === 1 ? 'Ver mi resultado' : 'Siguiente definición' });
        await next.scrollIntoViewIfNeeded();
        await next.click();
        if (question === 0) await page.getByRole('button', { name: /Continuar vuelo/ }).click();
        await page.clock.runFor(100);
      }
      if (device.name === 'mobile-small') {
        assert.equal(await page.evaluate(() => window.completedFlights.length), 0);
        await page.getByRole('button', { name: 'Reintentar guardar' }).click();
        await page.clock.runFor(100);
        assert.equal(await page.evaluate(() => window.saveRequests), 2);
      }
      assert.equal(await page.evaluate(() => window.completedFlights.length), 1);
      const completed = await page.evaluate(() => window.completedFlights[0]);
      assert.equal(completed.total, 2);
      assert.equal(completed.answers.length, 2);
      assert.equal(await page.getByText('Resultado guardado en la plataforma.', { exact: true }).count(), 1);
      await page.screenshot({ path: join(directory, `${device.name}-result.png`) });
    } else {
      const before = await page.locator('.fc-plane').boundingBox();
      await page.keyboard.down('d');
      await page.clock.runFor(400);
      await page.keyboard.up('d');
      const after = await page.locator('.fc-plane').boundingBox();
      assert(after.x > before.x, 'WASD must restore movement after pausing');
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${device.name}: cover, long definition, input mode, pause, immunity, ${device.hasTouch ? 'two answers and one save' : 'WASD'}`);
    await context.close();
  }
  console.log(`Screenshots: ${directory}`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
