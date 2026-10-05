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
    contents: `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import FlyingCatGame from './src/components/activities/flying-cat/FlyingCatGame';
import {FlyingCatViewport} from './src/components/activities/flying-cat/FlyingCatViewport';
const long = 'Una persona capacitada conduce aeronaves para transportar pasajeros y mercancías. Antes de despegar revisa los instrumentos y las condiciones del tiempo, y durante el viaje se comunica con la torre de control. Identifica la profesión que corresponde a esta descripción. ';
window.completedFlights=[];window.saveRequests=0;
function Fixture(){
  const [open,setOpen]=useState(true);
  return <div style={{minHeight:'220vh',background:'#e6f3ef'}}>
    <header style={{height:96,padding:'24px',boxSizing:'border-box',background:'#087c6d',color:'white'}}>XOCHITLAN · Panel docente · Mis materias y grupos</header>
    <main data-testid="transformed-dashboard" style={{transform:'translate3d(24px,32px,0)',contain:'paint',overflow:'hidden',height:460,width:'calc(100% - 96px)',margin:24,padding:16,boxSizing:'border-box',position:'relative',background:'white',borderRadius:16}}>
      <h1>Mis asignaturas</h1><p>Unidad · Tema · Actividades · Vista previa</p>
      <div style={{height:240,background:'#d5e7e2',borderRadius:12}}>Contenido del panel del profesor</div>
      <button type="button" onClick={()=>setOpen(true)}>Volver a probar Flying Cat</button>
      {open&&<FlyingCatViewport><FlyingCatGame exercise={{id:'qa',titulo:'Amazing jobs · prueba de vuelo',contenido:{version:1,instructions:'Lee la definición y pilota hacia el concepto correcto. Tienes tres vidas para esquivar obstáculos.',showFeedback:true,settings:{difficulty:'easy'},items:[{id:'q1',prompt:long.repeat(3),options:['Pilot','Doctor','Farmer','Teacher'],correctIndex:0,feedback:'Un piloto conduce aeronaves. Un médico atiende pacientes, un agricultor cultiva la tierra y un docente acompaña el aprendizaje. '.repeat(8)},{id:'q2',prompt:long,options:['Pilot','Doctor','Farmer','Teacher'],correctIndex:0,feedback:'Pilot significa piloto, la persona preparada para conducir una aeronave.'}]}}} onComplete={r=>{window.saveRequests++;if(location.search==='?fail=1'&&window.saveRequests===1)throw new Error('fallo de prueba');window.completedFlights.push(r);return null}} onClose={()=>{window.flightClosed=true;setOpen(false)}}/></FlyingCatViewport>}
    </main>
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`,
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
      response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/main.css"><style>html,body,#root{margin:0;min-height:100%;width:100%}body{overflow:auto}</style></head><body><div id="root"></div><script src="/main.js"></script></body></html>');
      return;
    }
    const assetPaths = [...['cat-aviator.jpg', 'paper.jpg', 'sky-hills.jpg'].map((name) => `/games/flying-cat/images/${name}`),
      '/games/flying-cat/audio/paper-wings-and-sunday-naps.mp3'];
    if (!assetPaths.includes(requestPath) && !['/main.js', '/main.css'].includes(requestPath)) {
      response.statusCode = 404; response.end(); return;
    }
    const path = assetPaths.includes(requestPath)
      ? resolve(root, 'public', requestPath.slice(1)) : join(directory, requestPath.slice(1));
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
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

async function parallaxSnapshot(page) {
  return page.locator('.fc-parallax-layer').evaluateAll((layers) => layers.map((layer) => {
    const track = layer.querySelector('.fc-parallax-track');
    const transform = getComputedStyle(track).transform;
    return { name: layer.dataset.layer, speed: Number(layer.dataset.speed), transform,
      x: transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41,
      tiles: track.querySelectorAll('.fc-parallax-tile').length };
  }));
}

function assertParallaxRetained(before, after, message, tolerance = 0.05) {
  assert.deepEqual(after.map((layer) => layer.name), before.map((layer) => layer.name), message);
  for (let index = 0; index < before.length; index++) {
    assert(Math.abs(after[index].x - before[index].x) <= tolerance,
      `${message}: ${before[index].name} (${before[index].x} → ${after[index].x})`);
  }
}

async function assertParallaxFrozen(page, message, duration = 500) {
  const before = await parallaxSnapshot(page);
  assert.equal(before.length, 5, 'The paused backdrop must retain all five independent scenery layers');
  await page.clock.runFor(duration);
  assertParallaxRetained(before, await parallaxSnapshot(page), message);
}

async function assertParallaxMoving(page) {
  const before = await parallaxSnapshot(page);
  assert.deepEqual(before.map((layer) => layer.name), ['clouds', 'mountains', 'hills', 'fields', 'trees']);
  assert(before.every((layer) => layer.tiles === 2), 'Every scenery layer must repeat seamlessly with two SVG tiles');
  await page.clock.runFor(250);
  const after = await parallaxSnapshot(page);
  const distances = before.map((layer, index) => layer.x - after[index].x);
  assert(distances.every((distance) => distance > 0.1), 'All five scenery layers must visibly scroll during active flight');
  for (let index = 1; index < distances.length; index++) {
    assert(distances[index] > distances[index - 1],
      `${before[index].name} must move faster than ${before[index - 1].name}, giving the flight real depth`);
  }
}

// CDP sends a real held joystick pointer, including capture and analogue diagonals.
// Synthetic PointerEvents cannot exercise capture: they have no active pointer ID.
async function flightInput(page, touch) {
  const session = touch ? await page.context().newCDPSession(page) : null;
  let active = [];
  return {
    async set(directions = []) {
      if (directions.join(',') === active.join(',')) return;
      if (session) {
        if (!directions.length) {
          if (active.length) await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          const box = await page.getByRole('button', { name: 'Palanca táctil de vuelo', exact: true }).boundingBox();
          assert(box, 'Touch piloting must have one visible circular analogue joystick');
          const origin = center(box);
          if (!active.length) {
            await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...origin, id: 41 }] });
          }
          const x = Number(directions.includes('right')) - Number(directions.includes('left'));
          const y = Number(directions.includes('down')) - Number(directions.includes('up'));
          const length = Math.max(1, Math.hypot(x, y));
          const radius = Math.min(box.width, box.height) * 0.31;
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
            x: origin.x + x / length * radius,
            y: origin.y + y / length * radius, id: 41,
          }] });
        }
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

async function assertJoystickDeadZone(page) {
  const box = await page.getByRole('button', { name: 'Palanca táctil de vuelo', exact: true }).boundingBox();
  assert(box, 'Touch controls must expose one circular joystick');
  const origin = center(box);
  const before = center(await page.locator('.fc-plane').boundingBox());
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...origin, id: 52 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
      x: origin.x + box.width * 0.02, y: origin.y, id: 52,
    }] });
    await page.clock.runFor(100);
    const after = center(await page.locator('.fc-plane').boundingBox());
    assert(Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1,
      'A small movement inside the joystick dead zone must not drift the pilot');
  } finally {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  }
}

async function visibleGameViewport(page) {
  return page.evaluate(() => document.fullscreenElement?.classList.contains('fc-viewport')
    ? { width: innerWidth, height: innerHeight, left: 0, top: 0 }
    : { width: visualViewport.width, height: visualViewport.height,
      left: visualViewport.offsetLeft, top: visualViewport.offsetTop });
}

async function assertNativeFullscreen(page) {
  await page.waitForFunction(() => document.fullscreenElement?.classList.contains('fc-viewport'), null, { polling: 100 });
  const box = await page.locator('.fc-viewport').boundingBox();
  const visible = await visibleGameViewport(page);
  assert(Math.abs(box.x) < 1 && Math.abs(box.y) < 1
    && Math.abs(box.width - visible.width) < 1 && Math.abs(box.height - visible.height) < 1,
  'Native fullscreen must occupy the complete screen, ignoring stale pre-entry browser-toolbar insets');
  assert.equal(await page.getByRole('button', { name: 'Salir de pantalla completa', exact: true }).count(), 1);
}

async function flightProgress(page) {
  return { progress: await page.locator('.fc-progress').innerText(),
    lives: await page.locator('.fc-hearts').getAttribute('aria-label') };
}

async function assertJoystickSettings(page) {
  const before = await flightProgress(page);
  await page.getByRole('button', { name: 'Ajustar controles', exact: true }).click();
  assert.equal(await page.locator('.fc-stage').getAttribute('data-mode'), 'paused',
    'Control settings must pause the flight rather than leave it running behind the dialog');
  await page.getByLabel('Tamaño', { exact: true }).selectOption('small');
  await page.getByLabel('Lado del control', { exact: true }).selectOption('right');
  const opacity = page.getByLabel(/^Visibilidad/);
  for (let step = 0; step < 4; step++) await opacity.press('ArrowLeft');
  const sensitivity = page.getByLabel(/^Sensibilidad/);
  for (let step = 0; step < 3; step++) await sensitivity.press('ArrowRight');
  const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem('flying-cat:controls:v1')));
  assert.deepEqual(preferences, { size: 'small', side: 'right', opacity: 0.65, sensitivity: 1.3 },
    'Joystick preferences must persist on this device without requiring an account or database write');
  await page.getByRole('button', { name: /Continuar vuelo/ }).click();
  await page.clock.runFor(32);
  const joystick = page.locator('.fc-joystick');
  assert.equal(await joystick.getAttribute('data-side'), 'right');
  assert.equal(await joystick.getAttribute('data-size'), 'small');
  const pad = await joystick.boundingBox();
  const field = await page.locator('.fc-stage').boundingBox();
  assert(pad.width <= 80 && pad.x > field.x + field.width / 2
    && pad.x + pad.width <= field.x + field.width + 1 && pad.y + pad.height <= field.y + field.height + 1,
    'A customized right-hand joystick must fit inside the visible stage');
  assert.deepEqual(await flightProgress(page), before, 'Changing control preferences must preserve the current question and lives');
  await page.screenshot({ path: join(directory, 'ipad-landscape-controls-right.png') });
  await page.getByRole('button', { name: 'Ajustar controles', exact: true }).click();
  await page.getByRole('button', { name: 'Restablecer controles', exact: true }).click();
  await page.getByRole('button', { name: /Continuar vuelo/ }).click();
  await page.clock.runFor(32);
  assert.equal(await joystick.getAttribute('data-side'), 'left');
  assert.equal(await joystick.getAttribute('data-size'), 'medium');
  await assertNativeFullscreen(page);
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
  assert.fail('The analogue joystick or WASD must collide with a concept and open its feedback');
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
  const devices = [
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    { name: 'mobile-small', viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true },
    { name: 'mobile-landscape', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
    { name: 'ipad-portrait', viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true },
    { name: 'ipad-landscape', viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true },
    { name: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
  ];
  const requestedDevice = process.env.FLYING_CAT_DEVICE;
  if (requestedDevice) assert(devices.some((device) => device.name === requestedDevice), `Unknown FLYING_CAT_DEVICE: ${requestedDevice}`);
  for (const device of devices.filter((candidate) => !requestedDevice || candidate.name === requestedDevice)) {
    const context = await browser.newContext(device);
    const page = await context.newPage();
    // Answer cards use the top lane; obstacles must keep their corridor open.
    // This fixture is isolated and cannot affect a production activity or database.
    await page.addInitScript(() => { Math.random = () => 0.1; });
    await page.addInitScript(() => {
      const RealAudio = window.Audio;
      window.Audio = function(...args) { window.testMusic = new RealAudio(...args); return window.testMusic; };
      window.flightInputTrace = [];
      const trace = (event) => {
        const pad = document.querySelector('.fc-joystick-pad');
        if (event.type.startsWith('pointer') || event.type === 'lostpointercapture') {
          if (!(event.target instanceof Element) || !event.target.closest('.fc-joystick')) return;
        }
        const stage = document.querySelector('.fc-stage')?.getBoundingClientRect();
        window.flightInputTrace.push({ type: event.type, pointerId: event.pointerId,
          x: event.clientX, y: event.clientY, time: performance.now(), active: pad?.dataset.active,
          mode: document.querySelector('.fc-stage')?.dataset.mode,
          fullscreen: !!document.fullscreenElement, stage: stage && { x: stage.x, y: stage.y, width: stage.width, height: stage.height } });
        if (window.flightInputTrace.length > 60) window.flightInputTrace.shift();
      };
      for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'resize']) window.addEventListener(name, trace, true);
      document.addEventListener('fullscreenchange', trace, true);
    });
    if (device.name.startsWith('ipad')) {
      // Browser bars/zoom may leave less visible height than the layout viewport.
      // The dashboard ancestor intentionally clips/transforms descendants above.
      await page.addInitScript(() => {
        const visible = new EventTarget();
        let inset = 180, top = 24, left = 0;
        Object.defineProperties(visible, {
          width: { get: () => innerWidth }, height: { get: () => innerHeight - inset },
          offsetLeft: { get: () => left }, offsetTop: { get: () => top },
        });
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: visible });
        window.setTestVisibleViewport = (rect) => {
          if ('height' in rect) inset = innerHeight - rect.height;
          if ('offsetTop' in rect) top = rect.offsetTop;
          if ('offsetLeft' in rect) left = rect.offsetLeft;
          visible.dispatchEvent(new Event('resize')); visible.dispatchEvent(new Event('scroll'));
        };
      });
    }
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
    await assertNativeFullscreen(page);
    assert.equal(await page.locator('.fc-touch-controls').count(), device.hasTouch ? 1 : 0);
    assert.equal(await page.getByRole('button', { name: 'Palanca táctil de vuelo', exact: true }).count(), device.hasTouch ? 1 : 0,
      'Mobile/iPad controls must be a single circular joystick, never the old four-button pad');
    assert.equal(await page.locator('.fc-pad').count(), 0);
    assert.equal(await page.getByRole('button', { name: /^Bonus [12] vacío$/ }).count(), 2,
      'An unplayed activity must start with two fixed empty bonus slots');
    assert.equal(await page.locator('.fc-stage').getAttribute('data-difficulty'), chosenDifficulty,
      'The chosen student difficulty must reach the flight without changing the exercise');
    assert.equal(await page.getByRole('dialog').count(), 1);
    const start = page.getByRole('button', { name: /Continuar vuelo/ });
    await start.scrollIntoViewIfNeeded();
    const startBox = await start.boundingBox();
    assert(startBox.y >= 0 && startBox.y + startBox.height <= page.viewportSize().height, 'Long definition must not hide the resume button');
    await assertParallaxFrozen(page, 'The initial reading pause must leave the scenery still');
    await page.screenshot({ path: join(directory, `${device.name}-reading.png`) });
    await start.click();
    await page.waitForFunction(() => window.testMusic && !window.testMusic.paused);
    await page.getByRole('button', { name: 'Silenciar música', exact: true }).click();
    assert.equal(await page.evaluate(() => window.testMusic.paused), true, 'Mute must stop the soundtrack immediately');
    await page.getByRole('button', { name: 'Activar música', exact: true }).click();
    await page.waitForFunction(() => !window.testMusic.paused);
    assert.equal(await page.evaluate(() => window.testMusic.loop), true, 'The supplied soundtrack must loop');
    assert(await page.evaluate(() => window.testMusic.readyState >= 2), 'The provided MP3 must decode and be ready for playback');
    const input = await flightInput(page, device.hasTouch);
    await page.clock.runFor(1000);
    assert.equal(await page.getByText(/Escudo ·/).count(), 1);
    assert.equal(await page.locator('.fc-art-energy-sphere').count(), 1, 'Immunity must show the blue energy sphere');
    await assertParallaxMoving(page);
    if (device.name === 'desktop') {
      const moving = await parallaxSnapshot(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const reduced = await parallaxSnapshot(page);
      assertParallaxRetained(moving, reduced,
        'Reduced motion must freeze the last scenery frame without jumping back to its origin');
      await assertParallaxFrozen(page, 'Reduced motion must not animate the backdrop');
      assert.equal(await page.locator('.fc-stage').getAttribute('data-mode'), 'flying',
        'Reduced motion must not interrupt the academic activity or pilot controls');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.clock.runFor(32);
      const restored = await parallaxSnapshot(page);
      assertParallaxRetained(moving, restored, 'Re-enabling scenery must retain its phase instead of restarting it', 6);
      assert(restored.some((layer) => layer.transform !== 'none'), 'The moving backdrop must return after the preference changes');
    }
    await page.screenshot({ path: join(directory, `${device.name}-flight.png`) });
    assert.equal(await page.locator('.fc-card').count(), 1, 'The field has only one concept node');
    const definition = await page.locator('.fc-definition').boundingBox();
    const field = await page.locator('.fc-stage').boundingBox();
    const visible = await visibleGameViewport(page);
    const game = await page.locator('.fc-viewport').boundingBox();
    assert(Math.abs(game.x - visible.left) < 1 && Math.abs(game.y - visible.top) < 1
      && Math.abs(game.width - visible.width) < 1 && Math.abs(game.height - visible.height) < 1,
      'The body portal must fill the real visible viewport, not a clipped/transformed dashboard');
    assert(game.x >= 0 && game.x + game.width <= page.viewportSize().width + 1
      && game.y + game.height <= page.viewportSize().height + 1,
      'The simulated visible area must also fit inside the actual device screen');
    assert.equal(await page.locator('.fc-viewport header').count(), 0, 'Flying Cat must not waste a separate close/title header');
    const closeBox = await page.getByRole('button', { name: 'Cerrar juego', exact: true }).boundingBox();
    const pauseBox = await page.getByRole('button', { name: /Pausar y releer/ }).boundingBox();
    assert(Math.abs(closeBox.y - pauseBox.y) < 1, 'Close must sit beside pause in the same HUD row');
    const pilotSize = await page.locator('.fc-plane').boundingBox();
    assert(phone ? pilotSize.width <= 96 : pilotSize.width >= 90,
      'Only compact phones must use the smaller pilot body');
    assert(definition.y >= 0 && definition.y + definition.height <= field.y + 1,
      'The active definition must stay above the flight field, within the screen');
    if (device.hasTouch) {
      assert.equal(await page.locator('.fc-stage > .fc-touch-controls').count(), 1);
      const pad = await page.locator('.fc-touch-controls').boundingBox();
      assert(pad.x >= field.x && pad.y >= field.y && pad.x + pad.width <= field.x + field.width + 1
        && pad.y + pad.height <= field.y + field.height + 1 && pad.y + pad.height <= visible.top + visible.height + 1,
      'The complete analogue joystick must remain inside the visible flight field');
      assert(pad.x < field.x + field.width / 3 && pad.y + pad.height / 2 > field.y + field.height / 2
        && field.y + field.height - pad.y - pad.height <= 30,
        'The default joystick must be at the lower left, for the left hand');
      if (field.height < 240) {
        const world = await page.locator('.fc-world').boundingBox();
        const pilot = await page.locator('.fc-plane').boundingBox();
        assert(world.x >= pad.x + pad.width && pilot.x >= pad.x + pad.width,
          'A short phone arena must reserve a control gutter so the pilot is not covered by the pad');
        const overflow = await page.locator('.fc-world').evaluate((node) => getComputedStyle(node).overflowX);
        assert.equal(overflow, 'hidden', 'Departing cards and obstacles must be clipped before crossing beneath the control pad');
      }
      await assertJoystickDeadZone(page);
    }
    const bonusRail = await page.locator('.fc-bonus-rail').boundingBox();
    assert(bonusRail && bonusRail.x >= field.x && bonusRail.y >= field.y
      && bonusRail.x + bonusRail.width <= field.x + field.width + 1
      && bonusRail.y + bonusRail.height <= field.y + field.height + 1,
      'Both right-hand bonus slots must remain inside the visible flight field');
    assert(bonusRail.x > field.x + field.width / 2, 'Bonuses must be easy to find on the right side');
    if (field.height < 240) {
      const world = await page.locator('.fc-world').boundingBox();
      assert(world.x + world.width <= bonusRail.x + 1,
        'A short arena must reserve the bonus rail as well as the analogue control area');
    }
    await assertNoFieldSteering(page, device.hasTouch);
    if (device.name === 'ipad-landscape') await assertJoystickSettings(page);
    if (device.name.startsWith('ipad')) {
      const progress = await flightProgress(page);
      const sceneryBeforeResize = await parallaxSnapshot(page);
      await page.getByRole('button', { name: 'Salir de pantalla completa', exact: true }).click();
      await page.waitForFunction(() => document.fullscreenElement === null, null, { polling: 100 });
      await page.waitForFunction(() => document.querySelector('.fc-viewport').style.height === `${innerHeight - 180}px`, null, { polling: 100 });
      await page.evaluate(() => window.setTestVisibleViewport({ height: innerHeight - 260, offsetTop: 40 }));
      await page.waitForFunction(() => document.querySelector('.fc-viewport').style.height === `${innerHeight - 260}px`, null, { polling: 100 });
      await page.clock.runFor(32);
      const pad = await page.locator('.fc-touch-controls').boundingBox();
      assert(pad.y + pad.height <= device.viewport.height - 260 + 40,
        'An iPad toolbar/visible-area change must not put the controls below the visible screen');
      assert.deepEqual(await flightProgress(page), progress, 'Visible viewport changes must not reset question or lives');
      assert.equal(await page.locator('.fc-stage').getAttribute('data-mode'), 'flying');
      assertParallaxRetained(sceneryBeforeResize, await parallaxSnapshot(page),
        'An iPad visible-viewport resize must retain the moving scenery phase', 6);
      await page.screenshot({ path: join(directory, `${device.name}-constrained-viewport.png`) });
      await page.evaluate(() => window.setTestVisibleViewport({ height: innerHeight - 180, offsetTop: 24 }));
      await page.waitForFunction(() => document.querySelector('.fc-viewport').style.height === `${innerHeight - 180}px`, null, { polling: 100 });
      await page.clock.runFor(32);
      await page.getByRole('button', { name: 'Entrar en pantalla completa', exact: true }).click();
      await assertNativeFullscreen(page);
      // The mocked clock must paint the recentered pilot after native resizing
      // before its position becomes the baseline for the held-input assertion.
      await page.clock.runFor(32);
      assert.deepEqual(await flightProgress(page), progress, 'Re-entering fullscreen must preserve question and lives');
    }
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
    if (!(afterMovement.x > beforeMovement.x && afterMovement.y < beforeMovement.y)) {
      console.error(`DEBUG ${device.name} diagonal movement`, JSON.stringify({ beforeMovement, afterMovement,
        state: await page.evaluate(() => ({ mode: document.querySelector('.fc-stage')?.dataset.mode,
          viewport: { width: innerWidth, height: innerHeight },
          padActive: document.querySelector('.fc-joystick-pad')?.dataset.active,
          thumb: document.querySelector('.fc-joystick-thumb')?.style.transform,
          plane: document.querySelector('.fc-plane')?.style.transform,
          trace: window.flightInputTrace })) }));
      await page.screenshot({ path: join(directory, `${device.name}-diagonal-failure.png`) });
      console.error(`Failure screenshot: ${join(directory, `${device.name}-diagonal-failure.png`)}`);
    }
    assert(afterMovement.x > beforeMovement.x && afterMovement.y < beforeMovement.y,
      'A held analogue diagonal or WASD keys must steer smoothly');
    const stopped = center(await page.locator('.fc-plane').boundingBox());
    await page.clock.runFor(150);
    const still = center(await page.locator('.fc-plane').boundingBox());
    assert(Math.abs(still.x - stopped.x) < 1 && Math.abs(still.y - stopped.y) < 1,
      'Releasing the directions must stop movement');
    if (phone) {
      const progress = await flightProgress(page);
      const conceptBeforeRotation = await page.locator('.fc-card').textContent();
      const sceneryBeforeRotation = await parallaxSnapshot(page);
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
      assert.deepEqual(await flightProgress(page), progress,
        'A portrait interruption must preserve the current question and lives');
      assert.equal(await page.locator('.fc-card').textContent(), conceptBeforeRotation,
        'A remounted concept card must retain its label after rotating back');
      assertParallaxRetained(sceneryBeforeRotation, await parallaxSnapshot(page),
        'A portrait interruption must preserve the scenery phase when the flight remounts');
      await assertParallaxFrozen(page, 'Returning to landscape must keep the paused scenery still');
      await page.getByRole('button', { name: /Continuar vuelo/ }).click();
      await page.clock.runFor(100);
    }
    await page.getByRole('button', { name: /Pausar y releer/ }).click();
    assert.equal(await page.evaluate(() => window.testMusic.paused), true, 'Pausing flight must pause music too');
    await assertParallaxFrozen(page, 'The explicit pause must stop every background layer', 3000);
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
        await assertParallaxFrozen(page, 'The answer explanation must pause scenery instead of distracting from reading');
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
      assert.equal(await page.evaluate(() => window.testMusic.paused), true, 'Music must stop on the final result');
      await page.screenshot({ path: join(directory, `${device.name}-result.png`) });
      if (phone) {
        await page.setViewportSize(portrait);
        await page.getByRole('region', { name: 'Resumen del vuelo' }).waitFor({ state: 'visible' });
        assert.equal(await page.locator('.fc-rotate').count(), 0, 'Saved results must remain readable in portrait');
        assert.equal(await page.evaluate(() => window.completedFlights.length), 1, 'Rotating a result must not save it again');
      }
    }
    await page.getByRole('button', { name: 'Volver a mis actividades', exact: true }).click();
    await page.locator('.fc-viewport').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.fullscreenElement === null, null, { polling: 100 });
    assert.equal(await page.evaluate(() => window.flightClosed), true);
    assert.equal(await page.locator('.fc-viewport').count(), 0, 'Closing must remove the fullscreen portal');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'auto', 'Closing must restore dashboard scrolling');
    assert.equal(await page.evaluate(() => window.testMusic.paused), true, 'Leaving must release soundtrack playback');
    assert.deepEqual(errors, []);
    await input.dispose();
    console.log(`PASS ${device.name}: native fullscreen and exit cleanup, five-speed parallax, paused scenery${device.name === 'desktop' ? ' and reduced motion' : ''}, ${phone ? 'landscape gate and safe rotation, ' : ''}difficulty choice, persistent definition, ${device.hasTouch ? 'in-field analogue joystick only' : 'WASD only'}, two bonus slots, pause, immunity, two answers and one save`);
    await context.close();
  }
  console.log(`Screenshots: ${directory}`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
