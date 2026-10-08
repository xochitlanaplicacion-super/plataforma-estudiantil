import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageLoader } from '../../../public/games/pvz-quest/classroom/image-loader.js';

function harness() {
  let clock = 0;
  let nextId = 0;
  const timers = new Map();
  const images = [];
  const loader = createImageLoader({
    resolveURL: src => `/game${src}`,
    createImage() {
      const image = { naturalWidth: 0, naturalHeight: 0 };
      images.push(image);
      return image;
    },
    setTimer(callback, delay) { const id = ++nextId; timers.set(id, { callback, at: clock + delay }); return id; },
    clearTimer(id) { timers.delete(id); },
  });
  const advance = duration => {
    const end = clock + duration;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      clock = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    clock = end;
  };
  const ready = image => { image.naturalWidth = 3300; image.naturalHeight = 900; image.onload(); };
  return { loader, images, timers, advance, ready };
}

test('cards and boards share one request and a successfully cached image', async () => {
  const { loader, images, timers, ready } = harness();
  const updates = [];
  const card = loader.load('/football.png', image => updates.push(['card', image]));
  const board = loader.load('/football.png', image => updates.push(['board', image]));
  assert.equal(card, board);
  assert.equal(images.length, 1);
  assert.equal(images[0].src, '/game/football.png');
  ready(images[0]);
  assert.equal(await card, images[0]);
  assert.equal(await loader.load('/football.png'), images[0]);
  assert.deepEqual(updates.map(([name]) => name), ['card', 'board']);
  assert.equal(timers.size, 0);
});

test('a sprite that loads after eight seconds replaces every placeholder and repairs the cache', async () => {
  const { loader, images, timers, advance, ready } = harness();
  const updates = [];
  const first = loader.load('/football.png', image => updates.push(['first', image]));
  advance(8001);
  assert.equal(await first, null);
  assert.equal(typeof images[0].onload, 'function');
  assert.deepEqual(updates, []);
  const second = loader.load('/football.png', image => updates.push(['second', image]));
  assert.equal(await second, null);
  advance(3000);
  ready(images[0]);
  assert.deepEqual(updates.map(([name]) => name), ['first', 'second']);
  assert.equal(await loader.load('/football.png'), images[0]);
  assert.equal(images.length, 1);
  assert.equal(timers.size, 0);
});

test('a transient network error retries once without duplicate requests or lost listeners', async () => {
  const { loader, images, ready, advance } = harness();
  const updates = [];
  const result = loader.load('/football.png', image => updates.push(image));
  images[0].onerror();
  assert.equal(images[0].onload, null);
  advance(749);
  assert.equal(images.length, 1);
  advance(1);
  assert.equal(images.length, 2);
  ready(images[1]);
  assert.equal(await result, images[1]);
  assert.deepEqual(updates, [images[1]]);
});

test('failed retries do not poison the cache and a later request can recover', async () => {
  const { loader, images, timers, ready, advance } = harness();
  const result = loader.load('/missing.png');
  images[0].onerror();
  advance(750);
  images[1].onerror();
  assert.equal(await result, null);
  assert.equal(timers.size, 0);
  const retry = loader.load('/missing.png');
  assert.equal(images.length, 3);
  ready(images[2]);
  assert.equal(await retry, images[2]);
});

test('requests have a finite deadline, clear callbacks and allow later retries', async () => {
  const { loader, images, timers, advance, ready } = harness();
  const updates = [];
  const result = loader.load('/stuck.png', image => updates.push(image));
  advance(45000);
  assert.equal(await result, null);
  assert.equal(timers.size, 0);
  assert.equal(images[0].onload, null);
  assert.deepEqual(updates, []);
  const retry = loader.load('/stuck.png');
  ready(images[1]);
  assert.equal(await retry, images[1]);
});

test('a broken consumer cannot prevent other cards and boards from updating', async () => {
  const { loader, images, ready } = harness();
  let updated = false;
  const result = loader.load('/football.png', () => { throw new Error('Detached canvas'); });
  loader.load('/football.png', () => { updated = true; });
  ready(images[0]);
  assert.equal(await result, images[0]);
  assert.equal(updated, true);
});
