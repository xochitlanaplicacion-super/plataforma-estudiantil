import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import sharp from 'sharp';

// Mechanical sprite-atlas packaging: retain all 30 original walking frames,
// pixel for pixel. Unused attack/death rows stay in the untouched source PNG.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const assets = resolve(project, '../CARPETA DE JUEGOS NUEVOS/pvz-aula-prueba-local/public/assets/images/Zombies');
const original = await readFile(resolve(assets, 'FootballZombieSprite_300.png'));
const extraction = { left: 0, top: 0, width: 3300, height: 900 };
const expected = await sharp(original).extract(extraction).raw().toBuffer();
const optimized = await sharp(original).extract(extraction)
  .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
assert.deepEqual(await sharp(optimized).raw().toBuffer(), expected);
assert(optimized.length < 1600000, 'The walking atlas must remain below 1.6 MB.');
await writeFile(resolve(assets, 'FootballZombieWalk_300.png'), optimized);
console.log(`Futbolista: ${original.length} → ${optimized.length} bytes; todos los píxeles utilizados son idénticos.`);
