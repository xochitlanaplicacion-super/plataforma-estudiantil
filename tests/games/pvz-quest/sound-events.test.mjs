import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { EFFECT_NAMES, combatSoundNames } from '../../../public/games/pvz-quest/classroom/sound-events.js';

test('every classroom sound is an existing local asset, with no invented brains file', () => {
  assert.equal(new Set(EFFECT_NAMES).size,EFFECT_NAMES.length);
  for (const name of EFFECT_NAMES) assert(existsSync(new URL(`../../../public/games/pvz-quest/assets/audio/${name}.mp3`,import.meta.url)),name);
});
test('combat maps shooting, impact, eating, explosion and normal/armored defeats', () => {
  const sounds = combatSoundNames([
    {type:'shot'}, {type:'damage',side:'zombies'}, {type:'bite'}, {type:'chomp'},
    {type:'mine'}, {type:'deployment'}, {type:'finished'},
    {type:'defeat',side:'zombies',typeId:'bucket'},
    {type:'defeat',side:'zombies',typeId:'common'},
  ]);
  assert.deepEqual(new Set(sounds),new Set(['pea_shoot','pea_hit','chomp','puff','plantation','points','bucket_zombie_fall','zombie_fall']));
});
test('duplicate combat events do not create duplicate voices and mowers suppress multiple fall sounds', () => {
  const events = [{type:'shot'},{type:'shot'},{type:'mower'},{type:'defeat',side:'zombies',typeId:'bucket'}];
  const before = structuredClone(events);
  assert.deepEqual(combatSoundNames(events),['zombieFinalKill','pea_shoot']);
  assert.deepEqual(events,before);
  assert.deepEqual(combatSoundNames(),[]);
});

test('ice impacts request one local synthesized sound, not a missing recording', () => {
  assert.deepEqual(combatSoundNames([{ type: 'freeze' }, { type: 'freeze' }]), ['freeze']);
  assert.equal(EFFECT_NAMES.includes('freeze'), false);
});
