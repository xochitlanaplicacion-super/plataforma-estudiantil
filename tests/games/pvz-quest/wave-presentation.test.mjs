import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { WavePresentation } from '../../../public/games/pvz-quest/classroom/wave-presentation.js';

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.listeners = {}; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(' '); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  getContext() { return null; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  closest(selector) { if (selector === '#game') return this.game ?? null; return null; }
}
const originals = new Map();
const timers = new Map();
let nextTimer = 0;
before(() => {
  for (const key of ['document', 'setTimeout', 'clearTimeout']) originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  globalThis.document = { createElement: tag => new Node(tag) };
  globalThis.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
});
beforeEach(() => timers.clear());
after(() => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
const descendants = node => [node, ...node.children.flatMap(descendants)];
function fixture() {
  const game = new Node('main'), root = new Node('div'); root.game = game; game.append(root);
  return { game, root, presentation: new WavePresentation(root) };
}

for (const [winner, title, description] of [
  ['plants', '¡Ganan Plantas!', 'La casa resistió'],
  ['zombies', '¡Ganan Zombis!', 'Los zombis atravesaron'],
  ['draw', '¡Empate!', 'No se declara una victoria automática'],
]) {
  test(`persistent ${winner} result is centered at the game root, explicitly announces the winner and offers a replay`, () => {
    const { game, root, presentation } = fixture();
    assert.equal(root.children.length, 0, 'No result overlay exists during normal play');
    const node = presentation.showMatchResult({ winner });
    assert.equal(node.parent, game, 'A result is not clipped or centered only in the board stage');
    assert.equal(root.children.length, 0);
    assert.equal(node.attributes.role, 'status');
    assert.equal(node.attributes['aria-live'], 'polite');
    assert.equal(node.attributes['aria-atomic'], 'true');
    const elements = descendants(node);
    assert(elements.some(item => item.tag === 'h2' && item.textContent === title));
    assert(node.textContent.includes(description));
    assert.equal(elements.filter(item => item.tag === 'canvas').length, 2, 'Decorations reuse the packaged character portraits');
    const button = elements.find(item => item.tag === 'button');
    assert.equal(button.dataset.action, 'confirm-exit');
    assert.equal(button.textContent, 'Preparar otra clase');
    assert.equal(button.type, 'button');
    assert.equal(timers.size, 0, 'The outcome remains until the teacher dismisses or resets the match');
    assert.equal(presentation.showMatchResult({ winner }), node, 'Frequent snapshots cannot replay or re-announce the result');
    assert.equal(game.children.filter(item => item.className?.includes('quest-match-result')).length, 1);
    presentation.destroy();
    assert.equal(node.parent, null);
  });
}

test('the public projector displays the result but never exposes a teacher-only restart button', () => {
  const { presentation } = fixture();
  const node = presentation.showMatchResult({ winner: 'zombies', isPublic: true });
  assert.equal(descendants(node).some(item => item.tag === 'button'), false);
  const changed = presentation.showMatchResult({ winner: 'zombies', isPublic: false });
  assert.notEqual(changed, node);
  assert.equal(node.parent, null);
  assert(descendants(changed).some(item => item.tag === 'button'));
  presentation.destroy();
});

test('match result cancels an in-flight wave announcement and remains until explicitly cleared', async () => {
  const { presentation } = fixture();
  const announcement = presentation.showWaveAnnouncement({ title: 'Oleada final' });
  assert.equal(timers.size, 1);
  const node = presentation.showMatchResult({ winner: 'plants' });
  assert.equal(await announcement, false);
  assert.equal(timers.size, 0);
  assert.equal(presentation.node, node);
  presentation.clear();
  assert.equal(node.parent, null);
  assert.equal(presentation.resultKey, null);
  const next = presentation.showMatchResult({ winner: 'plants' });
  assert.notEqual(next, node, 'A later new match can show its own result');
  presentation.destroy();
});

test('an optional replay callback runs once and cannot also bubble into the delegated application action', () => {
  const { presentation } = fixture();
  let calls = 0, stopped = 0;
  const node = presentation.showMatchResult({ winner: 'plants', onReplay: () => { calls += 1; } });
  const button = descendants(node).find(item => item.tag === 'button');
  button.listeners.click({ stopPropagation: () => { stopped += 1; } });
  assert.equal(calls, 1); assert.equal(stopped, 1);
  presentation.destroy();
});

test('result and countdown styles handle viewport positioning, modal counters and reduced motion', async () => {
  const css = await readFile(new URL('../../../public/games/pvz-quest/classroom/quest-theme.css', import.meta.url), 'utf8');
  assert.match(css, /\.quest-match-result\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/);
  assert.match(css, /\.quest-match-result-card\s*\{[^}]*max-height:\s*100%;[^}]*overflow:\s*auto;/);
  assert.match(css, /(?:^|\n)\.quest-countdown\s*\{[^}]*display:\s*grid;/, 'Countdown also styles the teacher question dialog outside #game');
  for (const state of ['urgent', 'paused', 'expired']) assert(css.includes(`.quest-countdown.${state}`));
  for (const child of ['label', 'value', 'note']) assert(css.includes(`.quest-countdown-${child}`));
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)[^\n]*quest-match-result-card[^\n]*quest-countdown\.urgent[^\n]*animation:\s*none;/);
});
