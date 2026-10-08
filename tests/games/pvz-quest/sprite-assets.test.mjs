import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';
import { UNITS } from '../../../public/games/pvz-quest/classroom/catalog.js';

const assets = new URL('../../../public/games/pvz-quest/assets/', import.meta.url);
const SHEET_COLS = 11;

function spriteURL(src) {
  assert.ok(src.startsWith('/assets/'), 'Catalogue sprites must come from the packaged assets');
  return new URL(src.slice('/assets/'.length), assets);
}

for (const definition of Object.values(UNITS)) {
  test(`${definition.id}: every catalogue frame is inside its sheet and contains visible pixels`, async () => {
    const sprite = definition.sprite;
    const encoded = await readFile(spriteURL(sprite.src));
    const { data, info } = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 4);

    for (const key of ['width', 'height']) {
      assert.ok(Number.isInteger(sprite[key]) && sprite[key] > 0, `${definition.id}: ${key} must be a positive integer`);
    }
    for (const key of ['startX', 'startY', 'endX', 'endY']) {
      assert.ok(Number.isInteger(sprite[key]) && sprite[key] >= 0, `${definition.id}: ${key} must be a nonnegative integer`);
    }
    assert.ok(sprite.startX < SHEET_COLS && sprite.endX < SHEET_COLS, `${definition.id}: frame columns must match the renderer`);

    const first = sprite.startY * SHEET_COLS + sprite.startX;
    const last = sprite.endY * SHEET_COLS + sprite.endX;
    assert.ok(last >= first, `${definition.id}: animation must have at least one frame`);

    for (let frame = first; frame <= last; frame += 1) {
      const column = frame % SHEET_COLS;
      const row = Math.floor(frame / SHEET_COLS);
      const sourceX = column * sprite.width;
      const sourceY = row * sprite.height;
      const label = `${definition.id}: frame (${column}, ${row})`;
      assert.ok(sourceX + sprite.width <= info.width, `${label} exceeds the sheet width`);
      assert.ok(sourceY + sprite.height <= info.height, `${label} exceeds the sheet height`);

      let visiblePixels = 0;
      for (let y = sourceY; y < sourceY + sprite.height; y += 1) {
        for (let x = sourceX; x < sourceX + sprite.width; x += 1) {
          if (data[(y * info.width + x) * info.channels + 3] >= 30) visiblePixels += 1;
        }
      }
      assert.ok(visiblePixels > 0, `${label} is transparent`);
    }
  });
}

test('football uses a smaller walking sheet with exactly the original RGBA pixels', async () => {
  const sprite = UNITS.football.sprite;
  assert.equal(sprite.src, '/assets/images/Zombies/FootballZombieWalk_300.png');
  const [optimized, original] = await Promise.all([
    readFile(spriteURL(sprite.src)),
    readFile(new URL('images/Zombies/FootballZombieSprite_300.png', assets)),
  ]);
  assert.ok(optimized.length < 1_600_000, `Walking sheet is too large: ${optimized.length} bytes`);

  const { data, info } = await sharp(optimized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 3300);
  assert.equal(info.height, 900);
  assert.equal(info.channels, 4);

  const originalPixels = await sharp(original)
    .extract({ left: 0, top: 0, width: 3300, height: 900 })
    .ensureAlpha().raw().toBuffer();
  assert.ok(data.equals(originalPixels), 'Walking frames must preserve every original RGBA byte');
});
