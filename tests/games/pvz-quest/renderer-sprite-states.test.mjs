import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';
import { getUnit } from '../../../public/games/pvz-quest/classroom/catalog.js';
import { UNIT_VISUAL_STATES } from '../../../public/games/pvz-quest/classroom/renderer.js';

const assetRoot = new URL('../../../public/games/pvz-quest/assets/', import.meta.url);

for (const [typeId, states] of Object.entries(UNIT_VISUAL_STATES)) {
  test(`${typeId}: every chewing or damage frame is real, within the original sprite sheet and nontransparent`, async () => {
    const sprite = getUnit(typeId).sprite;
    const encoded = await readFile(new URL(sprite.src.slice('/assets/'.length), assetRoot));
    const { data, info } = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 4);
    for (const [name, range] of Object.entries(states)) {
      const first = range.startY * 11 + range.startX;
      const last = range.endY * 11 + range.endX;
      for (let index = first; index <= last; index += 1) {
        const left = index % 11 * sprite.width;
        const top = Math.floor(index / 11) * sprite.height;
        assert(left + sprite.width <= info.width && top + sprite.height <= info.height, `${name} frame ${index} must fit its sheet`);
        let visible = 0;
        for (let y = top; y < top + sprite.height; y += 1) {
          for (let x = left; x < left + sprite.width; x += 1) {
            if (data[(y * info.width + x) * 4 + 3] >= 30) visible += 1;
          }
        }
        assert(visible > 100, `${typeId} ${name} frame ${index} must contain a visible character, not a blank trailing cell`);
      }
    }
  });
}
