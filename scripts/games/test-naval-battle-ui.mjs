// Local browser smoke proof: no credentials, Supabase connection, AI bill or database writes.
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'naval-battle-browser-'));
const operations = ['createNavalBattle', 'autoPlaceNavalFleet', 'placeNavalShip', 'removeNavalShip', 'confirmNavalFleet', 'startNavalTurn', 'answerNavalTurn', 'continueNavalAnswer', 'attackNaval', 'advanceNavalTurn', 'skipNavalAttack', 'activateNavalRadar', 'activateNavalFlare', 'repairNavalShip', 'clearNavalRadar', 'selectNavalTarget'];
await build({
  absWorkingDir: root,
  stdin: {
    contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import NavalBattleGame from './src/components/classroom-games/naval/NavalBattleGame';
import {NAVAL_SHIP_KINDS} from './src/lib/activities/naval-battle';
window.__navalState=null;window.__navalClosed=false;window.__navalFleetSize=NAVAL_SHIP_KINDS.length;
function Fixture(){const[open,setOpen]=useState(true);return <div style={{minHeight:'180vh',background:'#e6f3ef'}}><header style={{height:90,padding:24,background:'#087c6d',color:'white'}}>XOCHITLAN · Actividades en clase · Repertorio de juegos</header><main style={{transform:'translate3d(20px,25px,0)',contain:'paint',overflow:'hidden',height:400,width:'calc(100% - 60px)',margin:20,background:'white',padding:20}}><h1>Panel del profesor</h1><button onClick={()=>{window.__navalClosed=false;window.__navalState=null;setOpen(true)}}>Volver a abrir Batalla Naval</button>{open&&<NavalBattleGame onClose={()=>{window.__navalClosed=true;setOpen(false)}}/>}</main></div>};
createRoot(document.getElementById('root')).render(<Fixture/>);`,
    resolveDir: root, sourcefile: 'naval-battle-browser-fixture.tsx', loader: 'tsx',
  },
  bundle: true, outfile: join(directory, 'main.js'), jsx: 'automatic',
  alias: { '@': resolve(root, 'src') }, define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'test-only-state-observer', setup(builder) {
    builder.onLoad({ filter: /[\\/]activities[\\/]naval-battle\.ts$/ }, async ({ path }) => {
      let contents = await readFile(path, 'utf8');
      for (const name of operations) contents = contents.replace(`export function ${name}(`, `function fixture_${name}(`);
      // Instrument only this temporary compiled fixture, never the production engine source.
      contents += operations.map((name) => `\nexport function ${name}(...args:any[]){const next=fixture_${name}(...args);window.__navalState=next;return next}`).join('');
      return { contents, loader: 'ts', resolveDir: resolve(path, '..') };
    });
  } }],
});
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/main.css"><style>html,body,#root{margin:0;width:100%;min-height:100%}body{overflow:auto}</style></head><body><div id="root"></div><script src="/main.js"></script></body></html>');
    } else if (['/main.js', '/main.css'].includes(path)) {
      response.setHeader('Content-Type', extname(path) === '.js' ? 'text/javascript' : 'text/css');
      response.end(await readFile(join(directory, path.slice(1))));
    } else { response.statusCode = 404; response.end(); }
  } catch { response.statusCode = 404; response.end(); }
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const address = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.NAVAL_BROWSER_PATH || process.env.FLYING_CAT_BROWSER_PATH ? { executablePath: process.env.NAVAL_BROWSER_PATH || process.env.FLYING_CAT_BROWSER_PATH } : {}),
});
const devices = [
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, hasTouch: false, isMobile: false },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: false },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
];
let activePage = null;
let activeDevice = 'fixture';

const state = (page) => page.evaluate(() => window.__navalState);
const cellName = ({ row, col }) => new RegExp(`^${String.fromCharCode(65 + col)}${row + 1},`);
async function tap(page, name) {
  const button = page.getByRole('button', { name, exact: typeof name === 'string' });
  await button.scrollIntoViewIfNeeded(); await button.click();
}
async function assertFullscreen(page) {
  await page.waitForFunction(() => document.fullscreenElement?.classList.contains('fc-viewport'), null, { polling: 100 });
  const box = await page.locator('.fc-viewport').boundingBox();
  const dimensions = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert(box && Math.abs(box.x) < 1 && Math.abs(box.y) < 1 && Math.abs(box.width - dimensions.width) < 1 && Math.abs(box.height - dimensions.height) < 1,
    'Fullscreen portal must own the entire screen, not the transformed dashboard rectangle');
}
async function placeFleets(page, size) {
  await tap(page, 'Comenzar colocación de flotas'); await assertFullscreen(page);
  assert.equal(await page.getByRole('grid').count(), 0, 'Private handoff must not contain a fleet or board');
  for (let player = 0; player < 2; player++) {
    await tap(page, 'Estoy listo para colocar mi flota');
    await tap(page, 'Acomodar flota automáticamente');
    const current = await state(page);
    const expectedFleet = await page.evaluate(() => window.__navalFleetSize);
    assert.equal(current.players[player].ships.length, expectedFleet, 'Each participant needs the complete fleet including island troops and hospital');
    assert.equal(await page.locator('.nb-fleet-unit').count(), expectedFleet);
    assert.equal(await page.getByRole('gridcell').count(), size * size);
    const cells = await page.getByRole('gridcell').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect(); return { width: box.width, height: box.height };
    }));
    assert(cells.every((box) => box.width >= 43.5 && box.height >= 43.5), 'Every coordinate needs a touch-sized target');
    const scroll = await page.locator('.nb-board-scroll').evaluate((node) => ({ width: node.clientWidth, content: node.scrollWidth }));
    if (size === 14) assert(scroll.content >= 14 * 44, 'Large maps preserve all 14 columns instead of squeezing coordinates');
    await page.locator('.nb-board-scroll').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(directory, `${page.__deviceName}-${size}-placement-${player}.png`) });
    await tap(page, 'Guardar flota y ocultar');
    assert.equal(await page.locator('.nb-fleet-unit').count(), 0, 'Confirming the fleet removes its full footprint from the shared screen');
  }
  await tap(page, 'Comenzar siguiente turno');
  await page.clock.runFor(32);
}
async function verifyPauseAndFullscreenReentry(page) {
  await page.clock.runFor(2100);
  await tap(page, /Pausa/);
  await page.getByText('Partida en pausa', { exact: true }).waitFor();
  // Native pointer/autoscroll may spend active time before clicking Pause.
  // Compare only after the pause commits, not against the pre-gesture clock.
  const before = await page.locator('.naval-clock').innerText();
  assert.equal(await page.locator('.naval-content').getAttribute('inert'), '', 'Paused gameplay must be inert to keyboard or pointer activation');
  const ocean = await page.locator('.nb-ocean').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationPlayState));
  assert(ocean.every((value) => value === 'paused'), 'Pausing the classroom freezes the ocean as well as the clocks');
  await page.clock.runFor(7000);
  assert.equal(await page.locator('.naval-clock').innerText(), before);
  await tap(page, 'Reanudar'); await assertFullscreen(page);
  const recorded = await state(page);
  await page.evaluate(() => document.exitFullscreen());
  await page.getByText('Partida en pausa', { exact: true }).waitFor();
  await page.clock.runFor(32);
  await tap(page, 'Reanudar'); await assertFullscreen(page); await page.clock.runFor(32);
  assert.deepEqual(await state(page), recorded, 'Re-entering fullscreen preserves all fleets, XP and the current turn');
}
async function closeAndReopen(page) {
  await tap(page, 'Cerrar Batalla Naval'); await tap(page, 'Sí, cerrar la partida');
  await page.locator('.fc-viewport').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.fullscreenElement === null, null, { polling: 100 });
  assert.equal(await page.evaluate(() => window.__navalClosed), true);
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'auto', 'Closing restores the teacher dashboard scroll');
  await tap(page, 'Volver a abrir Batalla Naval');
}

try {
  for (const device of devices.filter((entry) => !process.env.NAVAL_DEVICE || entry.name === process.env.NAVAL_DEVICE)) {
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.hasTouch, isMobile: device.isMobile, reducedMotion: 'no-preference' });
    const page = await context.newPage(); page.__deviceName = device.name; activePage = page; activeDevice = device.name;
    const errors = []; const external = []; let aiRequests = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (!request.url().startsWith(address) && !request.url().startsWith('data:')) external.push(request.url()); });
    await page.route('**/api/exercises/generate-naval-battle', async (route) => {
      const request = route.request().postDataJSON(); const batch = ++aiRequests;
      const items = Array.from({ length: 10 }, (_, index) => {
        const type = request.mode === 'mixed' ? index % 2 === 0 ? 'multiple_choice' : 'true_false' : request.mode;
        return { id: `${batch}:${index}`, type, prompt: `Caso educativo ${batch}-${index + 1}: ${type === 'true_false' ? 'La Tierra es un planeta del sistema solar.' : '¿Qué palabra identifica un planeta del sistema solar?'}`, options: type === 'true_false' ? ['Verdadero', 'Falso'] : ['Tierra', 'Mesa', 'Lápiz', 'Puerta', 'Libro', 'Ventana'].slice(0, request.optionCount), correctIndex: 0, explanation: 'La Tierra es un planeta. Esta explicación corresponde al nivel escolar indicado.' };
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items }) });
    });
    await page.clock.install({ time: new Date('2026-10-05T18:00:00Z') });
    await page.goto(address); await page.getByRole('dialog', { name: 'Batalla Naval en clase' }).waitFor();
    assert.equal(aiRequests, 0);
    assert.equal(await page.getByLabel('Modalidad de preguntas').inputValue(), 'none');
    assert.equal(await page.getByRole('option', { name: 'Pequeño · 10 × 10' }).count(), 1);
    await page.screenshot({ path: join(directory, `${device.name}-setup.png`) });
    await placeFleets(page, 10);
    await verifyPauseAndFullscreenReentry(page);
    const first = await state(page);
    const target = first.players.find((player) => player.id === first.targetId);
    const coordinate = target.ships[0].cells[0];
    const enemyBoard = page.locator('.naval-map-panel .nb-board');
    assert.equal(await enemyBoard.locator('.nb-fleet-unit, clipPath').count(), 0, 'Live enemy hulls and their full masks must never exist in DOM');
    assert.equal(await enemyBoard.locator('.nb-ocean').count(), 2);
    await page.getByRole('gridcell', { name: cellName(coordinate) }).scrollIntoViewIfNeeded();
    await page.getByRole('gridcell', { name: cellName(coordinate) }).click();
    assert.equal((await state(page)).players.find((player) => player.id === first.targetId).shots.length, 0, 'Touching a coordinate only selects it');
    await tap(page, /^Disparar en /); await page.clock.runFor(1000);
    const fired = await state(page);
    const victim = fired.players.find((player) => player.id === first.targetId);
    assert.equal(victim.shots.length, 1); assert.deepEqual(victim.shots[0], { ...coordinate, hit: true });
    assert.equal(await page.getByRole('gridcell', { name: cellName(coordinate) }).getAttribute('class').then((value) => value.includes('nb-cell--hit')), true);
    await page.locator('.nb-board-scroll').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(directory, `${device.name}-hit.png`) });
    await tap(page, 'Continuar al siguiente turno'); await tap(page, 'Comenzar siguiente turno');
    const second = await state(page);
    assert.equal(second.turnNumber, 2);
    assert.notEqual(second.actorId, first.actorId, 'Sequential turns alternate the two participants');
    await page.clock.runFor(30_100);
    assert.equal((await state(page)).phase, 'attack_result');
    assert.equal((await state(page)).lastAttack, null, 'Expired shot does not fabricate damage');
    if (device.name === 'desktop' || device.name === 'ipad-landscape') {
      await tap(page, 'Continuar al siguiente turno'); await tap(page, 'Comenzar siguiente turno');
      assert.equal(await page.getByRole('button', { name: /Big Boy/ }).isEnabled(), true, 'Real hits and supply turns earn a lower-tier bonus');
      await tap(page, /Big Boy/);
      const powered = await state(page);
      const rival = powered.players.find((player) => player.id === powered.targetId);
      const nextCoordinate = rival.ships[0].cells[1];
      await page.getByRole('gridcell', { name: cellName(nextCoordinate) }).scrollIntoViewIfNeeded();
      await page.getByRole('gridcell', { name: cellName(nextCoordinate) }).click();
      const shotsBefore = rival.shots.length;
      await tap(page, /^Confirmar coordenada /);
      assert.equal((await state(page)).phase, 'attack');
      assert.equal((await state(page)).players.find((player) => player.id === powered.targetId).shots.length, shotsBefore, 'Special cinematic starts before damage');
      await page.screenshot({ path: join(directory, `${device.name}-bonus-cinematic.png`) });
      await page.clock.runFor(1100);
      const resolved = await state(page);
      assert.equal(resolved.phase, 'attack_result');
      assert.equal(resolved.lastAttack.special, 'big_boy');
      assert(resolved.lastAttack.cells.length >= 1 && resolved.lastAttack.cells.length <= 2);
    }
    assert.equal(aiRequests, 0, 'Offline mode never starts an AI request, including late turns');
    await closeAndReopen(page);

    if (device.name === 'desktop' || device.name === 'ipad-landscape') {
      await page.getByLabel('Mapa', { exact: true }).selectOption('large');
      await placeFleets(page, 14);
      assert.equal(await page.getByRole('gridcell').count(), 196);
      await page.screenshot({ path: join(directory, `${device.name}-14-board.png`) });
      await closeAndReopen(page);
    }
    if (device.name === 'desktop') {
      await page.getByLabel('Modalidad de preguntas').selectOption('multiple_choice');
      await page.getByLabel('Grado, nivel y dificultad').fill('Primero de secundaria, dificultad básica');
      await page.getByLabel('Tema e instrucciones').fill('Planetas del sistema solar.');
      await page.getByLabel('Opciones por pregunta').selectOption('3');
      assert.equal(await page.getByRole('button', { name: 'Comenzar colocación de flotas' }).isDisabled(), true);
      await tap(page, 'Generar banco para revisar');
      await page.getByRole('checkbox', { name: /Revisé el banco/ }).waitFor();
      assert.equal(aiRequests, 1);
      await page.getByRole('checkbox', { name: /Revisé el banco/ }).check();
      await placeFleets(page, 10);
      assert.equal((await state(page)).phase, 'question');
      assert.equal(await page.getByRole('button', { name: /Tierra/ }).count(), 1);
      assert.equal(await page.locator('.naval-answer').count(), 3, 'Multiple-choice count follows teacher configuration');
      await tap(page, /Tierra/);
      assert.equal((await state(page)).answerCorrect, true);
      assert.equal(await page.getByRole('grid').count(), 0, 'Educational feedback is shown before enabling the shot');
      await page.screenshot({ path: join(directory, `${device.name}-question-feedback.png`) });
      await tap(page, 'Elegir coordenada de disparo');
      assert.equal((await state(page)).phase, 'attack');
      await closeAndReopen(page);
    }
    assert.deepEqual(errors, [], 'Browser must not report React, pointer, fullscreen or canvas exceptions');
    assert.deepEqual(external, [], 'Isolated fixture must never contact production or Supabase');
    console.log(`PASS ${device.name}: isolated local/offline setup, private fleets, touch-sized10x10, fullscreen re-entry, pause/timeout, real hit, sequential turns${device.name === 'desktop' || device.name === 'ipad-landscape' ? ', 14x14 layout' : ''}${device.name === 'desktop' ? ', reviewed mock AI bank and three-option shuffled answer' : ''}`);
    await context.close();
  }
  console.log(`Screenshots: ${directory}`);
} catch (error) {
  console.error(`FAIL ${activeDevice}; screenshots: ${directory}`);
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: join(directory, `${activeDevice}-failure.png`) }).catch(() => {});
    console.error(await activePage.evaluate(() => ({ phase: window.__navalState?.phase, turn: window.__navalState?.turnNumber, fullscreen: !!document.fullscreenElement, overlays: document.querySelectorAll('.naval-overlay').length })).catch(() => ({})));
  }
  throw error;
} finally { await browser.close(); await new Promise((done) => server.close(done)); }
