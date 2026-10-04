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

const center = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const keyForDirection = { up: 'w', left: 'a', down: 's', right: 'd' };

// CDP sends real held touches, including pointer capture and two-finger diagonals.
// Synthetic PointerEvents cannot exercise capture: they have no active pointer ID.
async function flightInput(page, touch) {
  const session = touch ? await page.context().newCDPSession(page) : null;
  let active = [];
  return {
    async set(directions = []) {
      if (directions.join(',') === active.join(',')) return;
      if (session) {
        if (active.length) await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const touchPoints = [];
        for (let index = 0; index < directions.length; index++) {
          const box = await page.locator(`.fc-pad button[data-direction="${directions[index]}"]`).boundingBox();
          assert(box, 'A held direction must have a visible digital button');
          touchPoints.push({ ...center(box), id: index + 1 });
        }
        if (touchPoints.length) await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
      } else {
        for (const direction of active) await page.keyboard.up(keyForDirection[direction]);
        for (const direction of directions) await page.keyboard.down(keyForDirection[direction]);
      }
      active = [...directions];
    },
    async release() { await this.set([]); },
    async dispose() { await this.release(); if (session) await session.detach(); },
  };
}

async function assertNoFieldSteering(page, touch) {
  const stage = await page.locator('.fc-stage').boundingBox();
  const before = center(await page.locator('.fc-plane').boundingBox());
  const destination = { x: stage.x + stage.width * 0.72, y: stage.y + stage.height * 0.58 };
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...destination, id: 17 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: destination.x - 50, y: destination.y - 35, id: 17 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
    await page.keyboard.down('d');
    await page.clock.runFor(100);
    await page.keyboard.up('d');
  } else {
    await page.mouse.move(destination.x, destination.y);
    await page.mouse.down();
    await page.mouse.move(destination.x - 50, destination.y - 35);
    await page.mouse.up();
    await page.keyboard.down('ArrowRight');
    await page.clock.runFor(100);
    await page.keyboard.up('ArrowRight');
  }
  await page.clock.runFor(100);
  const after = center(await page.locator('.fc-plane').boundingBox());
  assert(Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1,
    touch ? 'Touching/dragging the field and a hardware keyboard must not move the plane' : 'Mouse dragging and arrow keys must not move the plane');
}

async function flyIntoCard(page, input) {
  for (let tick = 0; tick < 300; tick++) {
    if (await page.locator('.fc-stage').getAttribute('data-mode') === 'feedback') {
      await input.release();
      return;
    }
    const card = await page.locator('.fc-card').boundingBox();
    const plane = center(await page.locator('.fc-plane').boundingBox());
    const directions = [];
    // Stay in the left-hand flight corridor and intercept the next passing card.
    // Its answer need not be correct: this verifies a real collision and saved trace.
    if (card) {
      const target = center(card);
      if (target.y < plane.y - 12) directions.push('up');
      if (target.y > plane.y + 12) directions.push('down');
    }
    await input.set(directions);
    await page.clock.runFor(50);
    assert.notEqual(await page.locator('.fc-stage').getAttribute('data-mode'), 'crashing',
      'The answer corridor should remain reachable without exhausting the lives');
  }
  await input.release();
  assert.fail('Directional controls must collide with a concept and open its feedback');
}

async function testNonfatalImpact(page, input, directory, deviceName) {
  // Keep the plane away from the deterministic upper answer lane until a wave arrives.
  await input.release();
  await page.clock.runFor(6000);
  assert((await page.locator('.fc-obstacle:not([hidden])').count()) >= 2,
    'Even easy flight must show several obstacles as the wave advances');
  for (let tick = 0; tick < 200; tick++) {
    if (await page.locator('.fc-stage--impact').count()) {
      await input.release();
      assert.equal(await page.locator('.fc-plane-reaction--impact').count(), 1, 'The plane must react visibly to a nonfatal collision');
      assert.equal(await page.locator('.fc-art-pilot--worried').count(), 1, 'A worried expression must explain the lost life');
      assert.equal(await page.locator('.fc-art-energy-sphere').count(), 0, 'The worried reaction must precede the shield');
      assert.equal(await page.getByLabel('2 vidas', { exact: true }).count(), 1);
      if (deviceName === 'desktop') {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const animations = await page.locator('.fc-plane-reaction--impact, .fc-world').evaluateAll((nodes) =>
          nodes.map((node) => getComputedStyle(node).animationName));
        assert.deepEqual(animations, ['none', 'none'], 'Reduced motion must suppress both wobble and world shake');
        assert.equal(await page.locator('.fc-art-pilot--worried').count(), 1, 'Reduced motion must retain a visible collision signal');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
      await page.screenshot({ path: join(directory, `${deviceName}-impact.png`) });
      await page.clock.runFor(900);
      assert.equal(await page.locator('.fc-stage--impact').count(), 0, 'The short shake must stop; the flight must remain playable');
      assert.equal(await page.locator('.fc-stage').getAttribute('data-mode'), 'flying');
      assert.equal(await page.locator('.fc-art-energy-sphere').count(), 1, 'A nonfatal impact must grant the resume shield');
      return;
    }
    const plane = center(await page.locator('.fc-plane').boundingBox());
    const obstacles = await page.locator('.fc-obstacle:not([hidden])').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }));
    const target = obstacles.find((obstacle) => obstacle.x > plane.x + 20) || obstacles[0];
    await input.set(!target ? [] : target.y < plane.y - 10 ? ['up'] : target.y > plane.y + 10 ? ['down'] : []);
    await page.clock.runFor(50);
    assert.equal(await page.locator('.fc-stage').getAttribute('data-mode'), 'flying', 'Impact fixture must avoid the answer cards');
  }
  await input.release();
  assert.fail('An obstacle collision must show the temporary worried-pilot, wobble and shake state');
}

try {
  for (const device of [
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    { name: 'mobile-small', viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true },
    { name: 'mobile-landscape', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
    { name: 'ipad-portrait', viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true },
    { name: 'ipad-landscape', viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true },
    { name: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
  ]) {
    const context = await browser.newContext(device);
    const page = await context.newPage();
    // Answer cards use the top lane; obstacles must keep their corridor open.
    // This fixture is isolated and cannot affect a production activity or database.
    await page.addInitScript(() => { Math.random = () => 0.1; });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(address + (device.name === 'mobile-small' ? '/?fail=1' : '/'));
    await page.clock.install({ time: new Date('2026-10-04T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-04T12:00:10Z'));
    const phone = device.hasTouch && Math.min(device.viewport.width, device.viewport.height) < 600;
    const portrait = { width: Math.min(device.viewport.width, device.viewport.height), height: Math.max(device.viewport.width, device.viewport.height) };
    const landscape = { width: portrait.height, height: portrait.width };
    if (phone && device.viewport.height > device.viewport.width) {
      await page.locator('.fc-rotate').waitFor({ state: 'visible' });
      assert.equal(await page.getByRole('heading', { name: 'Gira tu teléfono para jugar', exact: true }).count(), 1);
      assert.equal(await page.locator('.fc-cover').count(), 0, 'A portrait phone must not begin the flight in an unusable layout');
      const heading = await page.getByRole('heading', { name: 'Gira tu teléfono para jugar', exact: true }).boundingBox();
      assert(heading.y >= 0 && heading.y + heading.height <= page.viewportSize().height,
        'The landscape instruction must be legible without scrolling');
      await page.screenshot({ path: join(directory, `${device.name}-rotate.png`) });
      await page.setViewportSize(landscape);
    }
    await page.locator('.fc-cover').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.fc-rotate').count(), 0, 'Landscape phones and either iPad orientation can choose their flight');
    assert.equal(await page.locator('.fc-cover-picture img').evaluate((img) => img.complete && img.naturalWidth > 0), true);
    assert.equal(await page.getByText('Teclado WASD', { exact: true }).count(), device.hasTouch ? 0 : 1);
    assert.equal(await page.getByRole('radio', { name: 'Fácil', exact: true }).isChecked(), true, 'The teacher difficulty remains the initial default');
    await page.getByRole('radio', { name: 'Difícil', exact: true }).check();
    assert.equal(await page.getByRole('radio', { name: 'Difícil', exact: true }).isChecked(), true);
    const chosenDifficulty = device.name === 'ipad-landscape' ? 'normal' : 'easy';
    await page.getByRole('radio', { name: chosenDifficulty === 'normal' ? 'Normal' : 'Fácil', exact: true }).check();
    await page.getByRole('button', { name: /Comenzar vuelo/ }).click();
    assert.equal(await page.locator('.fc-touch-controls').count(), device.hasTouch ? 1 : 0);
    assert.equal(await page.locator('.fc-stage').getAttribute('data-difficulty'), chosenDifficulty,
      'The chosen student difficulty must reach the flight without changing the exercise');
    assert.equal(await page.getByRole('dialog').count(), 1);
    const start = page.getByRole('button', { name: /Continuar vuelo/ });
    await start.scrollIntoViewIfNeeded();
    const startBox = await start.boundingBox();
    assert(startBox.y >= 0 && startBox.y + startBox.height <= page.viewportSize().height, 'Long definition must not hide the resume button');
    await page.screenshot({ path: join(directory, `${device.name}-reading.png`) });
    await start.click();
    const input = await flightInput(page, device.hasTouch);
    await page.clock.runFor(1000);
    assert.equal(await page.getByText(/Escudo ·/).count(), 1);
    assert.equal(await page.locator('.fc-art-energy-sphere').count(), 1, 'Immunity must show the blue energy sphere');
    await page.screenshot({ path: join(directory, `${device.name}-flight.png`) });
    assert.equal(await page.locator('.fc-card').count(), 1, 'The field has only one concept node');
    const definition = await page.locator('.fc-definition').boundingBox();
    const field = await page.locator('.fc-stage').boundingBox();
    assert(definition.y >= 0 && definition.y + definition.height <= field.y + 1,
      'The active definition must stay above the flight field, within the screen');
    if (device.hasTouch) {
      assert.equal(await page.locator('.fc-stage > .fc-touch-controls').count(), 1);
      const pad = await page.locator('.fc-touch-controls').boundingBox();
      assert(pad.x >= field.x && pad.y >= field.y && pad.x + pad.width <= field.x + field.width + 1
        && pad.y + pad.height <= field.y + field.height + 1 && pad.y + pad.height <= page.viewportSize().height,
      'All touch buttons must remain inside the visible flight field');
      assert(pad.x < field.x + field.width / 3 && pad.y + pad.height / 2 > field.y + field.height / 2
        && field.y + field.height - pad.y - pad.height <= 30,
        'Digital controls must be at the lower left, for the left hand');
      if (field.height < 240) {
        const world = await page.locator('.fc-world').boundingBox();
        const pilot = await page.locator('.fc-plane').boundingBox();
        assert(world.x >= pad.x + pad.width && pilot.x >= pad.x + pad.width,
          'A short phone arena must reserve a control gutter so the pilot is not covered by the pad');
        const overflow = await page.locator('.fc-world').evaluate((node) => getComputedStyle(node).overflowX);
        assert.equal(overflow, 'hidden', 'Departing cards and obstacles must be clipped before crossing beneath the control pad');
      }
    }
    await assertNoFieldSteering(page, device.hasTouch);
    const beforeMovement = center(await page.locator('.fc-plane').boundingBox());
    await input.set(['up', 'right']);
    await page.clock.runFor(150);
    if (device.hasTouch) {
      const whileHeld = center(await page.locator('.fc-plane').boundingBox());
      await page.keyboard.down('d');
      await page.keyboard.up('d');
      await page.clock.runFor(100);
      const stillHeld = center(await page.locator('.fc-plane').boundingBox());
      assert(stillHeld.x > whileHeld.x,
        'An ignored hardware key release must not cancel a held touch direction');
    }
    await input.release();
    const afterMovement = center(await page.locator('.fc-plane').boundingBox());
    assert(afterMovement.x > beforeMovement.x && afterMovement.y < beforeMovement.y,
      'Two held digital directions or WASD keys must steer a diagonal');
    const stopped = center(await page.locator('.fc-plane').boundingBox());
    await page.clock.runFor(150);
    const still = center(await page.locator('.fc-plane').boundingBox());
    assert(Math.abs(still.x - stopped.x) < 1 && Math.abs(still.y - stopped.y) < 1,
      'Releasing the directions must stop movement');
    if (phone) {
      const progress = await page.locator('.fc-hud').innerText();
      const conceptBeforeRotation = await page.locator('.fc-card').textContent();
      assert(conceptBeforeRotation.trim(), 'A concept must be visible before the orientation interruption');
      await page.setViewportSize(portrait);
      await page.locator('.fc-rotate').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.fc-stage').count(), 0);
      await page.clock.runFor(3000);
      assert.equal(await page.evaluate(() => window.saveRequests), 0, 'Rotating must not finish or save the paused flight');
      await page.setViewportSize(landscape);
      await page.getByRole('dialog').waitFor({ state: 'visible' });
      await page.clock.runFor(100);
      assert.equal(await page.locator('.fc-stage').getAttribute('data-mode'), 'paused');
      assert.equal(await page.locator('.fc-hud').innerText(), progress,
        'A portrait interruption must preserve the current question and lives');
      assert.equal(await page.locator('.fc-card').textContent(), conceptBeforeRotation,
        'A remounted concept card must retain its label after rotating back');
      await page.getByRole('button', { name: /Continuar vuelo/ }).click();
      await page.clock.runFor(100);
    }
    await page.getByRole('button', { name: /Pausar y releer/ }).click();
    await page.clock.runFor(3000);
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('button', { name: /Continuar vuelo/ }).click();
    await page.clock.runFor(100);
    assert.equal(await page.getByText('Escudo · 3 s').count(), 1);
    if (device.name === 'ipad-portrait' || device.name === 'desktop') {
      await testNonfatalImpact(page, input, directory, device.name);
    }
    {
      // Two real concept collisions through digital controls/WASD, never field teleportation.
      for (let question = 0; question < 2; question++) {
        await flyIntoCard(page, input);
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
      if (phone) {
        await page.setViewportSize(portrait);
        await page.getByRole('region', { name: 'Resumen del vuelo' }).waitFor({ state: 'visible' });
        assert.equal(await page.locator('.fc-rotate').count(), 0, 'Saved results must remain readable in portrait');
        assert.equal(await page.evaluate(() => window.completedFlights.length), 1, 'Rotating a result must not save it again');
      }
    }
    assert.deepEqual(errors, []);
    await input.dispose();
    console.log(`PASS ${device.name}: ${phone ? 'landscape gate and safe rotation, ' : ''}difficulty choice, persistent definition, ${device.hasTouch ? 'in-field digital controls only' : 'WASD only'}, pause, immunity, two answers and one save`);
    await context.close();
  }
  console.log(`Screenshots: ${directory}`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
