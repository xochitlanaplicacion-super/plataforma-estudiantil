// Run: node tests/browser/naval-independent-scroll.mjs
// Real Chromium layout and gestures using the production CSS and map components.
// The loopback fixture has no Supabase connection, API requests or game timers.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'naval-independent-scroll-'));
await build({
  absWorkingDir: root,
  stdin: {
    resolveDir: root,
    sourcefile: 'naval-independent-scroll-fixture.tsx',
    loader: 'tsx',
    contents: `import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {NavalMapPanel} from './src/components/classroom-games/naval/NavalMapPanel';
import {NavalBoard} from './src/components/classroom-games/naval/NavalBoard';
import './src/components/classroom-games/naval/naval-game.css';
const query=new URLSearchParams(location.search),size=Number(query.get('size')||14);
function Fixture(){
  const [phase,setPhase]=useState(query.get('phase')||'attack');
  const [selected,setSelected]=useState(null);
  const [action,setAction]=useState('');
  window.__navalFixture={phase,action};
  window.__setNavalPhase=setPhase;
  return <div className="naval-game">
    <header className="naval-hud"><div className="naval-brand"><strong>BATALLA NAVAL</strong><span>Colegio Xochitlan</span></div><div className="naval-hud-actions"><button className="naval-icon-button" aria-label="Pausa">Ⅱ</button></div></header>
    <div className="naval-content naval-content--play">
      <div className="naval-team-strip">{Array.from({length:6},(_,index)=><div key={index}><strong>Equipo {index+1}</strong><span>7 unidades · 100 XP</span></div>)}</div>
      {query.has('error')&&<p className="naval-error">Revisa la coordenada seleccionada.</p>}
      <div className="naval-play-layout">
        <aside className="naval-panel naval-command"><span className="naval-eyebrow">{phase==='placement'?'COLOCACIÓN PRIVADA':'TURNO DE'}</span><h2>Equipo azul</h2><p>Desplaza esta lista para encontrar sus acciones.</p><div className="naval-xp"><div><span>Barra de poder</span><strong>100/100 XP</strong></div><progress value={100} max={100}/></div>
          <div className={phase==='placement'?'naval-fleet-picker':'naval-specials'}>{Array.from({length:24},(_,index)=><button key={index} onClick={()=>setAction('card-'+index)}><span>✦</span><span>{phase==='placement'?'Unidad de la flota':'Ataque especial'} {index+1}<small>Detalles y opciones de la tarjeta</small></span></button>)}</div>
          <button className="naval-button naval-button--primary" onClick={()=>setAction('command-end')}>{phase==='placement'?'Guardar flota y ocultar':'Continuar turno'}</button>
        </aside>
        <NavalMapPanel><NavalBoard size={size} islands={[]} playerName="Equipo rojo" selectedCell={selected} onSelect={setSelected}/></NavalMapPanel>
      </div>
      {query.has('bank')&&<div className="naval-bank-footer"><div className="naval-pool-status"><span>10 preguntas listas</span>{query.has('bank-error')&&<><p role="alert">No se pudo completar la generación de preguntas. Revisa la conexión y vuelve a intentarlo para continuar con el banco.</p><button className="naval-button" onClick={()=>setAction('bank-retry')}>Reintentar generación</button></>}</div><button className="naval-button naval-button--quiet" onClick={()=>setAction('bank-review')}>Revisar próximas preguntas</button></div>}
    </div>
    {phase!=='attack_result'&&<footer className="naval-fire-dock"><span>Equipo azul<strong>{selected?'Coordenada seleccionada':'Selecciona una coordenada del mapa'}</strong></span><button className="naval-button naval-button--primary" onClick={()=>setAction('dock')}>{phase==='placement'?'Confirmar posición':'Confirmar disparo'}</button></footer>}
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`,
  },
  bundle: true,
  outfile: join(directory, 'main.js'),
  jsx: 'automatic',
  alias: { '@': resolve(root, 'src') },
  define: { 'process.env.NODE_ENV': '"development"' },
});

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (path === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/main.css"><style>html,body{margin:0;width:100%}#root{height:100dvh}h2{margin:0}button{color:inherit}</style></head><body><div id="root"></div><script src="/main.js"></script></body></html>');
    } else if (path === '/main.js' || path === '/main.css') {
      response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/css');
      response.end(await readFile(join(directory, path.slice(1))));
    } else { response.statusCode = 404; response.end(); }
  } catch { response.statusCode = 500; response.end(); }
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const address = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.NAVAL_BROWSER_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const profiles = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'large-desktop', width: 2560, height: 1440 },
  { name: 'ipad-landscape', width: 1180, height: 820, touch: true },
  { name: 'ipad-1024', width: 1024, height: 768, touch: true },
  { name: 'ipad-portrait', width: 820, height: 1180, touch: true },
  { name: 'ipad-stacked', width: 768, height: 1024, touch: true },
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'short-phone', width: 390, height: 600, touch: true },
  { name: 'phone-landscape', width: 844, height: 390, touch: true },
  { name: 'narrow-landscape', width: 667, height: 375, touch: true },
];

async function geometry(page) {
  return page.evaluate(() => {
    const content = document.querySelector('.naval-content');
    const command = document.querySelector('.naval-command');
    const panel = document.querySelector('.naval-map-panel');
    const board = document.querySelector('.nb-board-scroll');
    const legend = document.querySelector('.nb-board-legend');
    const layout = document.querySelector('.naval-play-layout');
    const box = (node) => { const { x, y, width, height, top, bottom, right } = node.getBoundingClientRect(); return { x, y, width, height, top, bottom, right }; };
    return {
      content: box(content), command: box(command), panel: box(panel), board: box(board), legend: box(legend), layout: box(layout),
      contentTop: content.scrollTop, commandTop: command.scrollTop, boardTop: board.scrollTop, boardLeft: board.scrollLeft,
      commandOverflow: command.scrollHeight - command.clientHeight,
      verticalOverflow: board.scrollHeight - board.clientHeight, horizontalOverflow: board.scrollWidth - board.clientWidth,
      columnGap: Number.parseFloat(getComputedStyle(layout).columnGap) || 0,
      outerWidth: document.documentElement.scrollWidth, outerHeight: document.documentElement.scrollHeight,
      viewportWidth: innerWidth, viewportHeight: innerHeight, windowY: scrollY,
      dock: document.querySelector('.naval-fire-dock') ? box(document.querySelector('.naval-fire-dock')) : null,
      bank: document.querySelector('.naval-bank-footer') ? box(document.querySelector('.naval-bank-footer')) : null,
      cells: Array.from(document.querySelectorAll('.nb-cell'), box),
    };
  });
}

function assertLayout(value, context) {
  assert(value.command.height >= 44, `${context}: command scroll window must expose a complete touch target`);
  assert(value.board.height >= 44, `${context}: map scroll window must remain usable`);
  assert(value.commandOverflow > 2, `${context}: fixture must exercise an overflowing command pane`);
  assert(value.panel.top >= value.content.top && value.panel.bottom <= value.content.bottom + 1, `${context}: map stays inside the content viewport`);
  assert(value.legend.bottom <= value.panel.bottom + 1 && value.legend.top >= value.panel.top, `${context}: legend remains reachable outside the map scroll window`);
  const stacked = value.panel.top >= value.command.bottom - 1;
  const availableWidth = stacked ? value.layout.width : value.layout.width - value.command.width - value.columnGap;
  assert(Math.abs(value.panel.width - availableWidth) <= 2, `${context}: map fills the available column width`);
  assert(value.cells.every((cell) => cell.width >= 43.5 && cell.height >= 43.5), `${context}: map coordinates keep 44px touch targets`);
  assert(value.outerWidth <= value.viewportWidth && value.outerHeight <= value.viewportHeight, `${context}: no document overflow`);
  assert.equal(value.contentTop, 0, `${context}: outer content does not scroll`);
  assert.equal(value.windowY, 0, `${context}: page does not scroll`);
  if (value.dock) assert(value.panel.bottom <= value.dock.top + 1 && value.dock.bottom <= value.viewportHeight + 1, `${context}: fire dock remains on screen`);
  if (value.bank) assert(value.panel.bottom <= value.bank.top + 1 && value.bank.bottom <= value.content.bottom + 1, `${context}: question bank has its own reachable window`);
}

function assertFixedPanes(before, after, context) {
  assert.equal(after.contentTop, before.contentTop, `${context}: outer content is stationary`);
  assert.equal(after.windowY, before.windowY, `${context}: page is stationary`);
  assert.deepEqual(after.panel, before.panel, `${context}: map pane is stationary`);
  assert.deepEqual(after.command, before.command, `${context}: command pane is stationary`);
  assert.deepEqual(after.legend, before.legend, `${context}: legend is stationary`);
  assert.deepEqual(after.dock, before.dock, `${context}: fire dock is stationary`);
  assert.deepEqual(after.bank, before.bank, `${context}: question bank is stationary`);
}

async function wheelOver(page, selector, deltaX, deltaY) {
  const box = await page.locator(selector).boundingBox();
  assert(box, `${selector}: scroll pane is rendered`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(deltaX, deltaY);
}

async function verifyScroll(page, context) {
  let before = await geometry(page);
  assertLayout(before, context);
  await wheelOver(page, '.naval-command', 0, 300);
  await page.waitForFunction(() => document.querySelector('.naval-command').scrollTop > 2);
  let after = await geometry(page);
  assertFixedPanes(before, after, `${context}, command wheel`);
  assert.equal(after.boardTop, before.boardTop, `${context}: command scrolling does not pan the map`);
  assert.equal(after.boardLeft, before.boardLeft, `${context}: command scrolling does not pan map columns`);
  await page.locator('.naval-command').evaluate((node) => { node.scrollTop = node.scrollHeight; });
  before = await geometry(page);
  await wheelOver(page, '.naval-command', 0, 900);
  await page.waitForTimeout(100);
  after = await geometry(page);
  assertFixedPanes(before, after, `${context}, command boundary`);
  assert.equal(after.boardTop, before.boardTop, `${context}: excess command scroll does not reach the map`);
  await page.locator('.naval-command > .naval-button').last().click();
  assert.equal(await page.evaluate(() => window.__navalFixture.action), 'command-end', `${context}: command action is reachable`);

  for (const axis of ['vertical', 'horizontal']) {
    before = await geometry(page);
    if ((axis === 'vertical' ? before.verticalOverflow : before.horizontalOverflow) <= 2) continue;
    await wheelOver(page, '.nb-board-scroll', axis === 'horizontal' ? 250 : 0, axis === 'vertical' ? 250 : 0);
    await page.waitForFunction((axis) => { const board = document.querySelector('.nb-board-scroll'); return (axis === 'vertical' ? board.scrollTop : board.scrollLeft) > 2; }, axis);
    after = await geometry(page);
    assertFixedPanes(before, after, `${context}, ${axis} map wheel`);
    assert.equal(after.commandTop, before.commandTop, `${context}: map scrolling does not move command cards`);
  }
  await page.locator('.nb-cell').last().scrollIntoViewIfNeeded();
  after = await geometry(page);
  assertLayout(after, `${context}, last coordinate`);
  assert.equal(after.commandTop, before.commandTop, `${context}: reaching the last coordinate preserves the command position`);
  await wheelOver(page, '.nb-board-scroll', 900, 900);
  await page.waitForTimeout(100);
  assertFixedPanes(after, await geometry(page), `${context}, map boundary`);
  assert.equal((await geometry(page)).commandTop, after.commandTop, `${context}: excess map scroll does not reach command cards`);
  if (after.dock) {
    await page.locator('.naval-fire-dock .naval-button').click();
    assert.equal(await page.evaluate(() => window.__navalFixture.action), 'dock', `${context}: dock action remains reachable`);
  }
  if (after.bank) {
    await page.getByRole('button', { name: 'Revisar próximas preguntas', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__navalFixture.action), 'bank-review', `${context}: question bank action remains reachable`);
    if (await page.getByRole('button', { name: 'Reintentar generación', exact: true }).count()) {
      await page.getByRole('button', { name: 'Reintentar generación', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__navalFixture.action), 'bank-retry', `${context}: bank error action remains reachable`);
    }
    assertFixedPanes(after, await geometry(page), `${context}, question bank actions`);
  }
}

async function touchPan(page, selector, axis) {
  const box = await page.locator(selector).boundingBox();
  const horizontal = axis === 'horizontal';
  const start = { x: box.x + box.width * (horizontal ? .8 : .5), y: box.y + box.height * (horizontal ? .5 : .8) };
  const end = { x: box.x + box.width * (horizontal ? .2 : .5), y: box.y + box.height * (horizontal ? .5 : .2) };
  const session = await page.context().newCDPSession(page);
  const points = (point) => [{ ...point, id: 1, radiusX: 5, radiusY: 5, force: 1 }];
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(start) });
    for (let step = 1; step <= 12; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points({ x: start.x + (end.x - start.x) * step / 12, y: start.y + (end.y - start.y) * step / 12 }) });
      await page.waitForTimeout(16);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
}

async function verifyTouch(page, context) {
  await page.locator('.naval-command').evaluate((node) => { node.scrollTop = 0; });
  let before = await geometry(page);
  await touchPan(page, '.naval-command', 'vertical');
  await page.waitForFunction(() => document.querySelector('.naval-command').scrollTop > 2);
  let after = await geometry(page);
  assertFixedPanes(before, after, `${context}, real finger command scroll`);
  assert.equal(after.boardTop, before.boardTop, `${context}: finger scroll on command cards does not pan the map`);
  assert.equal(after.boardLeft, before.boardLeft, `${context}: finger scroll on command cards does not pan map columns`);
  // Let the command gesture's own momentum finish before testing a new pane.
  await page.locator('.naval-command').evaluate((node) => new Promise((done) => {
    let previous = node.scrollTop, stable = 0;
    const started = performance.now();
    const sample = () => {
      stable = node.scrollTop === previous ? stable + 1 : 0;
      previous = node.scrollTop;
      if (stable >= 6 || performance.now() - started > 2_500) done();
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));

  const axis = after.verticalOverflow > 20 ? 'vertical' : 'horizontal';
  if ((axis === 'vertical' ? after.verticalOverflow : after.horizontalOverflow) <= 20) return;
  await page.locator('.nb-board-scroll').evaluate((node) => { node.scrollTop = 0; node.scrollLeft = 0; });
  before = await geometry(page);
  await touchPan(page, '.nb-board-scroll', axis);
  await page.waitForFunction((axis) => { const board = document.querySelector('.nb-board-scroll'); return (axis === 'vertical' ? board.scrollTop : board.scrollLeft) > 2; }, axis);
  after = await geometry(page);
  assertFixedPanes(before, after, `${context}, real finger map pan`);
  assert.equal(after.commandTop, before.commandTop, `${context}: finger pan does not scroll command cards`);
}

let page;
let scenario = 'initialization';
let passed = 0;
try {
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, hasTouch: Boolean(profile.touch) });
    page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const size of [10, 14]) {
      for (const phase of ['placement', 'attack', 'attack_result']) {
        scenario = `${profile.name}, ${size}x${size}, ${phase}`;
        await page.goto(`${address}/?size=${size}&phase=${phase}${profile.height >= 600 ? '&error=1' : ''}${phase !== 'placement' ? '&bank=1' : ''}${phase === 'attack_result' ? '&bank-error=1' : ''}`);
        await page.waitForFunction(() => document.querySelector('.naval-map-panel')?.style.getPropertyValue('--naval-board-height'));
        await verifyScroll(page, scenario);
        if (profile.touch && size === 14 && phase === 'attack') await verifyTouch(page, scenario);
        assert.deepEqual(errors, [], `${scenario}: no browser errors`);
        passed++;
      }
    }
    // The same mounted panel must recompute its window as the viewport rotates.
    if (profile.name === 'phone') {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForFunction(() => document.querySelector('.naval-map-panel').getBoundingClientRect().width < 550);
      assertLayout(await geometry(page), 'phone rotation');
    }
    await context.close();
    console.log(`PASS ${profile.name}: independent panes, actions, map sizes 10/14, placement/attack/result`);
  }
  console.log(`PASS ${passed} browser layout scenarios. Generated fixture: ${directory}`);
} catch (error) {
  if (page && !page.isClosed()) {
    const { cells, ...layout } = await geometry(page);
    console.error(`FAIL ${scenario}:`, JSON.stringify({ ...layout, firstCell: cells[0], lastCell: cells.at(-1) }));
    await page.screenshot({ path: join(directory, 'failure.png') });
  }
  console.error(`Evidence: ${directory}`);
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
