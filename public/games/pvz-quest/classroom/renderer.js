import { UNITS, getUnit } from './catalog.js';
import { assetURL } from './runtime.js';
import { createImageLoader } from './image-loader.js';

const WIDTH = 960;
const HEIGHT = 540;
const GRID = Object.freeze({ x: 48, y: 44, width: 864, height: 450, cols: 8, rows: 5 });
const CELL_W = GRID.width / GRID.cols;
const CELL_H = GRID.height / GRID.rows;
const SHEET_COLS = 11;
const FRAME_INTERVAL = 1000 / 30;
const LIVE_EFFECT_LIMIT = 128;
const LIVE_TWEEN_MS = 120;
const SUN_EFFECT_MS = 800;
const SUN_FRAME_SIZE = 79;
const ASSETS = {
  garden: '/assets/images/Interface/background1.jpg',
  mower: '/assets/images/Interface/Lawn_mower.png',
  sun: '/assets/images/Interface/SunSprite_79x79.png',
};
const imageLoader = createImageLoader({ resolveURL: assetURL });
const cropCache = new Map();
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const centre = (row, col) => ({ x: GRID.x + (col + 0.5) * CELL_W, y: GRID.y + (row + 0.5) * CELL_H });
const ease = value => value * value * (3 - 2 * value);
const now = () => performance.now();
const plansArray = plans => Array.isArray(plans) ? plans : [...(plans?.plants || []), ...(plans?.zombies || [])];

function frameFor(sprite, clock, phase = 0) {
  const start = sprite.startY * SHEET_COLS + sprite.startX;
  const end = sprite.endY * SHEET_COLS + sprite.endX;
  const count = Math.max(1, end - start + 1);
  const frame = start + Math.floor(clock / 135 + phase) % count;
  return { x: frame % SHEET_COLS, y: Math.floor(frame / SHEET_COLS) };
}

function hash(value) {
  let result = 0;
  for (const char of String(value)) result = (result * 31 + char.charCodeAt(0)) >>> 0;
  return result;
}

// The zombie sheets contain considerably more transparent padding than the
// plant sheets. Trim only drawing bounds, with generous motion margins, so the
// characters remain legible without changing their board positions/hitboxes.
function cropFor(definition, image) {
  if (cropCache.has(definition.id)) return cropCache.get(definition.id);
  const sprite = definition.sprite;
  let crop = { x: 0, y: 0, width: sprite.width, height: sprite.height };
  try {
    const scratch = document.createElement('canvas');
    scratch.width = sprite.width; scratch.height = sprite.height;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (context) {
      context.drawImage(image, sprite.startX * sprite.width, sprite.startY * sprite.height, sprite.width, sprite.height, 0, 0, sprite.width, sprite.height);
      const pixels = context.getImageData(0, 0, sprite.width, sprite.height).data;
      let left = sprite.width, top = sprite.height, right = -1, bottom = -1;
      for (let y = 0; y < sprite.height; y += 1) {
        for (let x = 0; x < sprite.width; x += 1) {
          if (pixels[(y * sprite.width + x) * 4 + 3] < 30) continue;
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
      }
      if (right >= left && bottom >= top) {
        const marginX = Math.ceil(sprite.width * 0.09), marginY = Math.ceil(sprite.height * 0.06);
        left = Math.max(0, left - marginX); top = Math.max(0, top - marginY);
        right = Math.min(sprite.width - 1, right + marginX); bottom = Math.min(sprite.height - 1, bottom + marginY);
        crop = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
      }
    }
  } catch { /* A tainted/unavailable canvas falls back to the full frame. */ }
  cropCache.set(definition.id, crop);
  return crop;
}

function drawSprite(context, image, definition, x, y, maxWidth, maxHeight, clock, phase = 0) {
  if (!image) {
    context.fillStyle = definition.side === 'plants' ? '#396e25' : '#6d536b';
    context.beginPath(); context.arc(x, y, Math.min(maxWidth, maxHeight) * 0.3, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#fff'; context.font = 'bold 12px sans-serif'; context.textAlign = 'center';
    context.fillText(definition.name.slice(0, 10), x, y + 4);
    return;
  }
  const sprite = definition.sprite;
  const crop = cropFor(definition, image);
  const frame = frameFor(sprite, clock, phase);
  const scale = Math.min(maxWidth / crop.width, maxHeight / crop.height);
  const width = crop.width * scale, height = crop.height * scale;
  context.drawImage(image, frame.x * sprite.width + crop.x, frame.y * sprite.height + crop.y,
    crop.width, crop.height, x - width / 2, y - height / 2, width, height);
}

/** Draw one catalogue portrait, not an inherited card with incorrect prices. */
export async function renderCard(canvas, typeId) {
  const definition = getUnit(typeId);
  const context = canvas?.getContext?.('2d');
  if (!definition || !context) return false;
  const width = canvas.width || 112, height = canvas.height || 90;
  const paint = image => {
    context.clearRect(0, 0, width, height);
    drawSprite(context, image, definition, width / 2, height / 2, width * 0.9, height * 0.9, 0);
  };
  const image = await imageLoader.load(definition.sprite.src, paint);
  paint(image);
  return !!image;
}

/**
 * Purely visual board: it never purchases, damages, advances or resolves a
 * round. onCell receives ({ row, col }, browserEvent), using zero-based cells.
 */
export class BoardRenderer {
  constructor(canvas, { onCell } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    if (!this.context) throw new Error('Este navegador no puede dibujar el tablero.');
    canvas.width = WIDTH; canvas.height = HEIGHT;
    canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = 'auto';
    canvas.style.touchAction = 'pan-y';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Jardín: cinco carriles A a E, casa y columnas 1 a 7. Selecciona una casilla para preparar tu unidad.');
    this.onCell = onCell;
    this.images = new Map();
    this.view = { units: [], mowers: Array(5).fill(true) };
    this.plans = [];
    this.selected = null;
    this.stage = null;
    this.live = false;
    this.liveEffects = [];
    this.livePositions = new Map();
    this.liveRetired = new Map();
    this.lastDraw = -Infinity;
    this.destroyed = false;
    this.playVersion = 0;
    this.waiter = null;
    this.reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    this.click = event => {
      if (this.destroyed || this.stage || (event.button != null && event.button !== 0)) return;
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = (event.clientX - bounds.left) * WIDTH / bounds.width;
      const y = (event.clientY - bounds.top) * HEIGHT / bounds.height;
      const col = Math.floor((x - GRID.x) / CELL_W), row = Math.floor((y - GRID.y) / CELL_H);
      if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return;
      this.onCell?.({ row, col }, event);
    };
    canvas.addEventListener('click', this.click);
    this.tick = timestamp => {
      if (this.destroyed) return;
      // Keep one visual loop, capped at 30 fps even on a 120 Hz iPad display.
      const elapsed = timestamp - this.lastDraw;
      if (elapsed >= FRAME_INTERVAL) {
        this.draw(timestamp);
        this.lastDraw = Number.isFinite(elapsed) ? timestamp - elapsed % FRAME_INTERVAL : timestamp;
      }
      this.raf = requestAnimationFrame(this.tick);
    };
    // Exactly one animation loop for this board's whole lifetime.
    this.raf = requestAnimationFrame(this.tick);
  }

  async load() {
    const sources = [...new Set([...Object.values(UNITS).map(unit => unit.sprite.src), ...Object.values(ASSETS)])];
    const entries = await Promise.all(sources.map(async src => [src, await imageLoader.load(src, image => {
      if (this.destroyed) return;
      this.images.set(src, image);
      this.draw(now());
    })]));
    if (this.destroyed) return false;
    // Do not overwrite an image that finished late while another sprite was
    // still loading: its original promise may have returned the placeholder.
    for (const [src, image] of entries) {
      if (image || !this.images.get(src)) this.images.set(src, image);
    }
    this.draw(now());
    return true;
  }

  setView(snapshot, { plans, selected } = {}) {
    // Also safe for the public display, which may call the same entry point
    // for both game modes. Live updates must never cancel every visual effect.
    if (snapshot?.config?.tempo === 'continuous') {
      this.setLiveView(snapshot, { selected });
      return;
    }
    this.cancelPlay();
    this.live = false;
    this.liveEffects = [];
    this.livePositions.clear();
    this.liveRetired.clear();
    this.view = {
      ...snapshot,
      units: (snapshot?.units || []).map(unit => ({ ...unit })),
      mowers: [...(snapshot?.mowers || Array(5).fill(false))],
    };
    this.plans = plansArray(plans).map(order => ({ ...order }));
    this.selected = selected ? { ...selected } : null;
    if (!this.destroyed) this.draw(now());
  }

  /** Replace a real-time snapshot without creating/restarting a visual loop. */
  setLiveView(snapshot, { selected } = {}) {
    if (this.destroyed) return;
    const clock = now();
    const first = !this.live;
    if (first) this.cancelPlay();
    const previous = new Map(this.view.units.map(unit => [unit.id, unit]));
    const incoming = (snapshot?.units || []).map(unit => ({ ...unit }));
    const present = new Set(incoming.map(unit => unit.id));
    for (const oldUnit of previous.values()) {
      if (!present.has(oldUnit.id)) this.liveRetired.set(oldUnit.id, { unit: { ...oldUnit }, expires: clock + 1000 });
    }
    this.live = true;
    for (const unit of incoming) {
      const oldUnit = previous.get(unit.id);
      const oldPosition = this.livePositions.get(unit.id);
      const from = first || !oldUnit || snapshot?.paused ? unit.col : this.liveColumn(oldUnit, clock);
      this.livePositions.set(unit.id, {
        from, to: unit.col, started: clock,
        // The previous path is sampled before replacing it; frequent snapshots
        // cannot snap a moving zombie back to the prior server position.
        duration: snapshot?.paused || first || !oldPosition ? 0 : LIVE_TWEEN_MS,
      });
    }
    for (const id of this.livePositions.keys()) if (!present.has(id)) this.livePositions.delete(id);
    for (const [id, entry] of this.liveRetired) if (entry.expires < clock) this.liveRetired.delete(id);
    while (this.liveRetired.size > LIVE_EFFECT_LIMIT) this.liveRetired.delete(this.liveRetired.keys().next().value);
    this.view = { ...snapshot, units: incoming, mowers: [...(snapshot?.mowers || Array(5).fill(false))] };
    this.plans = [];
    this.selected = selected ? { ...selected } : null;
    if (first) this.draw(clock);
  }

  liveColumn(unit, clock) {
    const position = this.livePositions.get(unit.id);
    if (!position || !position.duration || this.view.paused) return unit.col;
    const progress = clamp((clock - position.started) / position.duration, 0, 1);
    return position.from + (position.to - position.from) * progress;
  }

  /** Combat and automatic income effects never change the game snapshot. */
  showLiveEvents(events) {
    if (this.destroyed || !this.live || !Array.isArray(events)) return;
    const clock = now();
    this.liveEffects = this.liveEffects.filter(effect => clock < effect.started + effect.duration);
    const drawable = new Set(['shot', 'damage', 'defeat', 'death', 'mine', 'chomp', 'bite', 'mower', 'invasion', 'sun']);
    for (const event of events) {
      if (!event || !drawable.has(event.type) || !Number.isFinite(event.row) || event.row < 0 || event.row >= GRID.rows) continue;
      const definition = getUnit(event.typeId);
      const former = this.view.units.find(unit => unit.id === event.unitId) || this.liveRetired.get(event.unitId)?.unit
        || (definition && Number.isFinite(event.col) ? { id: event.unitId, typeId: event.typeId, row: event.row, col: event.col, side: definition.side, hp: 0, maxHp: definition.hp } : null);
      this.liveEffects.push({
        event: { ...event }, started: clock,
        duration: this.reducedMotion ? 400 : event.type === 'sun' ? SUN_EFFECT_MS : event.type === 'mower' ? 700 : event.type === 'shot' ? 650 : 550,
        unit: former ? { ...former } : null,
      });
    }
    if (this.liveEffects.length > LIVE_EFFECT_LIMIT) this.liveEffects.splice(0, this.liveEffects.length - LIVE_EFFECT_LIMIT);
  }

  cancelPlay() {
    this.playVersion += 1;
    if (this.waiter) {
      clearTimeout(this.waiter.timer);
      this.waiter.resolve(false);
      this.waiter = null;
    }
    this.stage = null;
    this.live = false;
    this.liveEffects = [];
    this.livePositions.clear();
    this.liveRetired.clear();
  }

  /** Resolves true when finished, false when replaced, setView'd or destroyed. */
  async play(stages, onStage) {
    this.cancelPlay();
    if (this.destroyed) return false;
    const version = this.playVersion;
    this.plans = []; this.selected = null;
    for (const [index, stage] of (stages || []).entries()) {
      if (version !== this.playVersion || this.destroyed) return false;
      const previous = this.view.units.map(unit => ({ ...unit }));
      const hasSun = stage.events?.some(event => event.type === 'sun');
      const duration = this.reducedMotion ? hasSun ? 400 : 240 : hasSun ? SUN_EFFECT_MS : 650;
      this.view = { ...this.view, units: (stage.units || []).map(unit => ({ ...unit })), mowers: [...(stage.mowers || this.view.mowers)] };
      this.stage = { ...stage, events: stage.events || [], previous, started: now(), duration };
      try { onStage?.(stage, index); } catch (error) { this.cancelPlay(); throw error; }
      if (version !== this.playVersion || this.destroyed) return false;
      this.draw(now());
      const completed = await new Promise(resolve => {
        const timer = setTimeout(() => { this.waiter = null; resolve(true); }, duration);
        this.waiter = { timer, resolve };
      });
      if (!completed || version !== this.playVersion || this.destroyed) return false;
    }
    this.stage = null;
    if (!this.destroyed) this.draw(now());
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelPlay();
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('click', this.click);
    this.onCell = null;
    this.images.clear();
  }

  draw(clock) {
    const context = this.context;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = '#233f25'; context.fillRect(0, 0, WIDTH, HEIGHT);
    this.drawGarden();
    this.drawGrid();
    this.liveEffects = this.liveEffects.filter(effect => clock < effect.started + effect.duration);
    const progress = this.stage ? clamp((clock - this.stage.started) / this.stage.duration, 0, 1) : 1;
    const events = this.stage?.events || [];
    const visible = [...this.view.units, ...this.plans.map(order => ({ ...order, planned: true }))];
    const stacks = new Map();
    for (const unit of visible) {
      const key = `${unit.row}:${unit.col}:${unit.side}`;
      const index = stacks.get(key) || 0;
      stacks.set(key, index + 1);
      const movements = events.filter(event => event.type === 'move' && event.unitId === unit.id);
      const col = this.live ? this.liveColumn(unit, clock) : movements.length ? movements[0].fromCol + (movements.at(-1).toCol - movements[0].fromCol) * ease(progress) : unit.col;
      const flashed = this.live
        ? this.liveEffects.some(effect => effect.event.type === 'damage' && effect.event.unitId === unit.id && clock - effect.started < 180)
        : events.some(event => event.type === 'damage' && event.unitId === unit.id) && progress > 0.55 && progress < 0.9;
      this.drawUnit(unit, clock, col, index, flashed ? 0.5 : 1);
    }
    for (const event of events.filter(event => ['defeat', 'death'].includes(event.type))) {
      const lost = this.stage.previous.find(unit => unit.id === event.unitId);
      if (lost) this.drawUnit(lost, clock, lost.col, 0, 1 - progress, true);
    }
    for (const effect of this.liveEffects.filter(effect => ['defeat', 'death'].includes(effect.event.type))) {
      const local = clamp((clock - effect.started) / effect.duration, 0, 1);
      if (effect.unit) this.drawUnit(effect.unit, clock, effect.unit.col, 0, 1 - local, true);
    }
    this.drawMowers(events, progress, clock, this.liveEffects);
    this.drawEffects(events, progress);
    for (const effect of this.liveEffects) this.drawEffects([effect.event], clamp((clock - effect.started) / effect.duration, 0, 1));
    // Income flies above the garden toward the resource bar, so it must not
    // inherit the clipping used by combat particles inside the lawn.
    for (const event of events) if (event.type === 'sun') this.drawSun(event, progress);
    for (const effect of this.liveEffects) if (effect.event.type === 'sun') this.drawSun(effect.event, clamp((clock - effect.started) / effect.duration, 0, 1));
    this.drawFooter();
  }

  drawGarden() {
    const context = this.context, image = this.images.get(ASSETS.garden);
    if (image) {
      // Align the old garden art to the classroom's house/6 lawn/entry columns.
      context.drawImage(image, 0, 75, 235, 490, GRID.x, GRID.y, CELL_W, GRID.height);
      context.drawImage(image, 235, 75, 750, 490, GRID.x + CELL_W, GRID.y, CELL_W * 6, GRID.height);
      context.drawImage(image, 1000, 75, 220, 490, GRID.x + CELL_W * 7, GRID.y, CELL_W, GRID.height);
    } else {
      context.fillStyle = '#b29368'; context.fillRect(GRID.x, GRID.y, CELL_W, GRID.height);
      context.fillStyle = '#62a83d'; context.fillRect(GRID.x + CELL_W, GRID.y, CELL_W * 6, GRID.height);
      context.fillStyle = '#b6af9d'; context.fillRect(GRID.x + CELL_W * 7, GRID.y, CELL_W, GRID.height);
    }
    context.fillStyle = 'rgba(15,40,18,.17)'; context.fillRect(GRID.x, GRID.y, GRID.width, GRID.height);
  }

  drawGrid() {
    const context = this.context;
    context.font = 'bold 18px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    for (let col = 0; col < GRID.cols; col += 1) {
      const point = centre(0, col);
      context.fillStyle = col === 0 ? '#ffe4a0' : col === 7 ? '#ffc3b6' : '#f1ffe4';
      context.fillText(col === 0 ? 'Casa' : String(col), point.x, 23);
    }
    for (let row = 0; row < GRID.rows; row += 1) {
      const point = centre(row, 0);
      context.fillStyle = '#f1ffe4'; context.fillText(String.fromCharCode(65 + row), 23, point.y);
      for (let col = 0; col < GRID.cols; col += 1) {
        const x = GRID.x + col * CELL_W, y = GRID.y + row * CELL_H;
        if ((row + col) % 2 === 0) { context.fillStyle = 'rgba(255,255,225,.045)'; context.fillRect(x, y, CELL_W, CELL_H); }
        context.strokeStyle = 'rgba(255,255,232,.42)'; context.lineWidth = 1;
        context.strokeRect(x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1);
        if (this.selected?.row === row && this.selected?.col === col) {
          context.fillStyle = 'rgba(255,220,73,.18)'; context.fillRect(x, y, CELL_W, CELL_H);
          context.strokeStyle = '#ffdd53'; context.lineWidth = 4; context.strokeRect(x + 3, y + 3, CELL_W - 6, CELL_H - 6);
        }
      }
    }
  }

  drawUnit(unit, clock, col = unit.col, stack = 0, alpha = 1, defeated = false) {
    const definition = getUnit(unit.typeId);
    if (!definition || !Number.isFinite(unit.row) || !Number.isFinite(col)) return;
    const context = this.context;
    const point = centre(unit.row, col);
    const floor = ['spikeweed', 'potato-mine'].includes(unit.typeId);
    point.x += stack ? ((stack % 3) - 1) * 10 : 0;
    point.y += floor ? CELL_H * 0.23 : stack ? -(stack % 3) * 5 : 0;
    const height = floor ? CELL_H * (unit.typeId === 'spikeweed' ? 0.34 : 0.46) : CELL_H * 0.8;
    context.save();
    context.globalAlpha = alpha * (unit.planned ? 0.55 : 1);
    if (defeated) {
      context.translate(point.x, point.y); context.rotate((1 - alpha) * -0.6); context.translate(-point.x, -point.y);
    }
    context.fillStyle = 'rgba(15,35,14,.25)'; context.beginPath();
    context.ellipse(point.x, centre(unit.row, col).y + CELL_H * 0.32, CELL_W * 0.25, 6, 0, 0, Math.PI * 2); context.fill();
    drawSprite(context, this.images.get(definition.sprite.src), definition, point.x, point.y, CELL_W * 0.84, height,
      this.reducedMotion ? 0 : clock, hash(unit.id || unit.typeId) % 16);
    if (!defeated && !unit.planned) {
      const maxHp = unit.maxHp ?? definition.hp, hp = unit.hp ?? maxHp;
      const barWidth = 42, barY = GRID.y + unit.row * CELL_H + CELL_H - 13;
      context.fillStyle = '#162a1a'; context.fillRect(point.x - barWidth / 2 - 1, barY - 1, barWidth + 2, 7);
      context.fillStyle = hp / maxHp > 0.5 ? '#a7eb60' : hp / maxHp > 0.25 ? '#ffd662' : '#fc8568';
      context.fillRect(point.x - barWidth / 2, barY, barWidth * clamp(hp / maxHp, 0, 1), 5);
      context.fillStyle = '#fff'; context.strokeStyle = '#213822'; context.lineWidth = 3;
      context.font = 'bold 11px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.strokeText(`${Math.max(0, hp)}/${maxHp}`, point.x, barY + 12); context.fillText(`${Math.max(0, hp)}/${maxHp}`, point.x, barY + 12);
    }
    context.restore();
  }

  drawMowers(events, progress, clock, liveEffects = []) {
    const context = this.context, image = this.images.get(ASSETS.mower);
    for (let row = 0; row < GRID.rows; row += 1) {
      const liveMower = liveEffects.find(effect => effect.event.type === 'mower' && effect.event.row === row);
      const moving = !!liveMower || events.some(event => event.type === 'mower' && event.row === row);
      const local = liveMower ? clamp((clock - liveMower.started) / liveMower.duration, 0, 1) : progress;
      if (!this.view.mowers[row] && !moving) {
        const warning = centre(row, 0);
        context.save();
        context.globalAlpha = this.reducedMotion ? 1 : 0.85 + Math.sin(clock / 450) * 0.15;
        context.fillStyle = '#ac2f2a'; context.strokeStyle = '#ffe5c5'; context.lineWidth = 2;
        context.beginPath(); context.arc(warning.x, warning.y, 17, 0, Math.PI * 2); context.fill(); context.stroke();
        context.fillStyle = '#fff3e0'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = 'bold 25px system-ui, sans-serif';
        context.fillText('!', warning.x, warning.y + 1);
        context.restore();
        continue;
      }
      // This is one last interception at the house, not a sweep that wipes
      // distant hordes. The visual must agree with the actual balance rule.
      const point = centre(row, moving ? ease(local) * 0.8 : 0);
      context.save(); context.globalAlpha = moving ? 1 - Math.max(0, local - 0.65) / 0.35 : 1;
      if (image) context.drawImage(image, point.x - 27, point.y - 28, 54, 55);
      else { context.fillStyle = '#cb403e'; context.fillRect(point.x - 20, point.y - 15, 40, 30); }
      context.restore();
    }
  }

  drawEffects(events, progress) {
    if (progress >= 1 || !events.length) return;
    const context = this.context;
    context.save();
    context.beginPath(); context.rect(GRID.x, GRID.y, GRID.width, GRID.height); context.clip();
    for (const event of events) {
      if (event.type === 'shot') {
        if (!Number.isFinite(event.fromCol) || !Number.isFinite(event.toCol)) continue;
        const from = centre(event.row, event.fromCol), to = centre(event.row, event.toCol);
        const travel = clamp(progress / 0.75, 0, 1);
        const x = from.x + (to.x - from.x) * travel;
        const y = from.y - (event.lob ? Math.sin(travel * Math.PI) * 70 : 0);
        context.globalAlpha = progress > 0.78 ? Math.max(0, (1 - progress) / 0.22) : 1;
        context.fillStyle = event.lob ? '#f8db4f' : '#a6f15e'; context.strokeStyle = event.lob ? '#a26d22' : '#3c731f';
        context.lineWidth = 2; context.beginPath();
        // An actual yellow corn kernel: never the old watermelon image.
        context.ellipse(x, y, event.lob ? 8 : 7, event.lob ? 5 : 7, event.lob ? travel * 4 : 0, 0, Math.PI * 2); context.fill(); context.stroke();
      }
      if (['damage', 'defeat', 'death', 'mine', 'chomp', 'bite'].includes(event.type)) {
        const point = centre(event.row, event.col ?? 0);
        const start = event.type === 'mine' ? 0.05 : 0.45;
        const local = clamp((progress - start) / (1 - start), 0, 1);
        if (progress < start) continue;
        context.globalAlpha = 1 - local;
        const colour = event.type === 'mine' ? '#ffde5a' : event.type === 'damage' ? '#ffad6b' : '#f4efc6';
        context.fillStyle = colour;
        const seed = hash(event.unitId || event.sourceId || `${event.row}:${event.col}`);
        for (let index = 0; index < (this.reducedMotion ? 4 : 11); index += 1) {
          const angle = index * Math.PI * 2 / 11 + seed % 9;
          const distance = local * (23 + index % 4 * 8);
          context.beginPath(); context.arc(point.x + Math.cos(angle) * distance, point.y + Math.sin(angle) * distance + local * local * 15, 3 + index % 3, 0, Math.PI * 2); context.fill();
        }
        if (event.type === 'damage') {
          context.font = 'bold 24px system-ui, sans-serif'; context.textAlign = 'center';
          context.strokeStyle = '#582a1b'; context.lineWidth = 4;
          context.strokeText(`−${event.amount}`, point.x, point.y - local * 38); context.fillText(`−${event.amount}`, point.x, point.y - local * 38);
        }
      }
      if (event.type === 'invasion') {
        context.globalAlpha = Math.sin(progress * Math.PI) * 0.4;
        context.fillStyle = '#f34337'; context.fillRect(GRID.x, GRID.y + event.row * CELL_H, GRID.width, CELL_H);
      }
      if (event.type === 'mower') {
        const point = centre(event.row, 0.45);
        const local = clamp((progress - 0.25) / 0.75, 0, 1);
        if (progress < 0.25) continue;
        context.globalAlpha = 1 - local;
        context.strokeStyle = '#ffe484'; context.lineWidth = this.reducedMotion ? 2 : 4;
        context.beginPath(); context.arc(point.x, point.y, 9 + local * 33, 0, Math.PI * 2); context.stroke();
      }
    }
    context.restore();
  }

  drawSun(event, progress) {
    if (progress >= 1 || !Number.isFinite(event.row) || event.row < 0 || event.row >= GRID.rows
      || !Number.isFinite(event.col) || event.col < 0 || event.col >= GRID.cols
      || !Number.isFinite(event.amount) || event.amount <= 0) return;
    const context = this.context;
    const source = centre(event.row, event.col);
    let x = source.x, y = source.y - 40;
    let size = 36;
    if (!this.reducedMotion) {
      const pop = ease(clamp(progress / 0.25, 0, 1));
      const travel = ease(clamp((progress - 0.25) / 0.75, 0, 1));
      // The chip lives outside this canvas in both teacher and public views.
      // Project its centre to canvas coordinates and let the orb leave at the
      // upper edge; the application's resource bar shows the credited amount.
      const bounds = this.canvas.getBoundingClientRect();
      const chip = this.canvas.ownerDocument?.querySelector('.plant-chip')?.getBoundingClientRect();
      const target = bounds.width && bounds.height && chip
        ? { x: clamp((chip.left + chip.width / 2 - bounds.left) * WIDTH / bounds.width, -48, WIDTH + 48),
          y: Math.min(-30, (chip.top + chip.height / 2 - bounds.top) * HEIGHT / bounds.height) }
        : { x: GRID.x + CELL_W / 2, y: -30 };
      x = source.x + 14 * pop + (target.x - source.x - 14) * travel;
      y = source.y - 18 - 30 * pop + (target.y - source.y + 48) * travel - Math.sin(travel * Math.PI) * 32;
      size = (18 + 20 * pop) * (1 - travel * 0.25);
    }
    context.save();
    context.globalAlpha = this.reducedMotion ? 1 - progress : clamp((1 - progress) / 0.22, 0, 1);
    context.shadowColor = '#ffe66b'; context.shadowBlur = this.reducedMotion ? 8 : 15;
    const image = this.images.get(ASSETS.sun);
    if (image) {
      const count = Math.max(1, Math.floor(image.naturalWidth / SUN_FRAME_SIZE));
      const frame = this.reducedMotion ? 0 : Math.min(count - 1, Math.floor(progress * count));
      context.drawImage(image, frame * SUN_FRAME_SIZE, 0, SUN_FRAME_SIZE, SUN_FRAME_SIZE, x - size / 2, y - size / 2, size, size);
    } else {
      // An unavailable sprite still gives the same automatic-income feedback.
      context.strokeStyle = '#ffe66b'; context.lineWidth = 3;
      for (let ray = 0; ray < 8; ray += 1) {
        const angle = ray * Math.PI / 4;
        context.beginPath();
        context.moveTo(x + Math.cos(angle) * size * 0.3, y + Math.sin(angle) * size * 0.3);
        context.lineTo(x + Math.cos(angle) * size * 0.47, y + Math.sin(angle) * size * 0.47);
        context.stroke();
      }
      context.fillStyle = '#ffda44'; context.strokeStyle = '#fff0a0'; context.lineWidth = 2;
      context.beginPath(); context.arc(x, y, size * 0.27, 0, Math.PI * 2); context.fill(); context.stroke();
    }
    context.shadowBlur = 0;
    context.font = 'bold 18px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.strokeStyle = '#5a3b10'; context.lineWidth = 3; context.fillStyle = '#fff4ac';
    context.strokeText(`+${event.amount}`, x, y + size / 2 + 11); context.fillText(`+${event.amount}`, x, y + size / 2 + 11);
    context.restore();
  }

  drawFooter() {
    const context = this.context;
    const labels = { deployment: '¡Ambos planes se revelan!', shots: 'Disparos', advance: 'Avance de los zombis', bites: 'Mordidas y contacto', mowers: 'Última defensa de la casa', result: 'Ronda resuelta' };
    context.textAlign = 'left'; context.textBaseline = 'middle'; context.font = '14px system-ui, sans-serif'; context.fillStyle = '#e1f6d5';
    const label = this.live
      ? this.view.phase === 'finished' ? 'Combate terminado.' : this.view.paused ? 'Combate en pausa · Pueden seguir respondiendo y ganando recursos.' : 'Combate continuo · Responde y compra mientras el jardín sigue avanzando.'
      : this.stage ? labels[this.stage.name] || 'Resolviendo la ronda…' : this.plans.length ? 'Las unidades transparentes son compras preparadas, todavía no desplegadas.' : 'Plantas: columnas 1–6  ·  Zombis: entrada 7  ·  Una última defensa por carril.';
    context.fillText(label, GRID.x, 523);
  }
}
