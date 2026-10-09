import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getUnit, getUnits, UNITS } from '../../../public/games/pvz-quest/classroom/catalog.js';
import { BALANCE_PROFILES, DEFAULT_BALANCE_PROFILE, getBalanceProfile, profileRules } from '../../../public/games/pvz-quest/classroom/balance-profiles.js';

test('new UI sessions default to Classic; the former balance has an obvious named selector', async () => {
  assert.equal(DEFAULT_BALANCE_PROFILE, 'classic');
  const html = await readFile('src/lib/games/pvz-quest/template.html', 'utf8');
  assert.match(html, /id="balance-profile" name="balanceProfile"/);
  assert.match(html, /value="classic" selected>Clásico/);
  assert.match(html, /value="aula">Aula — balance anterior/);
  assert.match(html, /aria-describedby="balance-summary"/);
  assert.match(html, /id="balance-label" for="balance-profile"/);
});

test('Aula retains every previously approved stat and cannot be mutated by Classic', () => {
  assert.equal(getUnit('common').hp, 5);
  assert.equal(getUnit('cone', 'aula').hp, 8);
  assert.equal(getUnit('bucket', 'aula').hp, 12);
  assert.equal(getUnit('football', 'aula').hp, 12);
  assert.equal(getUnit('dragon', 'aula').hp, 19);
  assert.equal(getUnit('dragon', 'aula').cost, 500);
  assert.equal(getUnit('dragon', 'aula').move, 1);
  assert.equal(getUnit('wallnut', 'aula').hp, 10);
  for (const [id, previous] of Object.entries(UNITS)) assert.equal(getUnit(id, 'aula'), previous);
  assert.throws(() => { getUnit('dragon', 'classic').hp = 1; }, TypeError);
  assert.equal(getUnit('dragon', 'aula').hp, 19);
  assert(Object.isFrozen(getUnits('classic')));
  assert(Object.isFrozen(getBalanceProfile('classic').rules));
});

test('Classic uses coordinated PvZ-style resistance, projectile damage and bite cadence', () => {
  const lives = { common:270, cone:640, bucket:1370, football:1670, balloon:290, dragon:2000 };
  for (const [id, hp] of Object.entries(lives)) assert.equal(getUnit(id, 'classic').hp, hp);
  for (const unit of getUnits('classic').filter(unit => unit.side === 'plants')) assert.equal(unit.hp, unit.id === 'wallnut' ? 4000 : 300);
  assert.equal(getUnit('peashooter', 'classic').damage, 20);
  assert.equal(getUnit('repeater', 'classic').damage, 40);
  assert.equal(profileRules('classic').shotSeconds, 1.5);
  assert.equal(getUnit('common', 'classic').damage / profileRules('classic').biteSeconds, 100);
  assert.equal(profileRules('aula').shotSeconds, 2.4);
  assert.equal(profileRules('aula').chompRestSeconds, 20);
});

test('only Classic dragon changes price/speed; existing sprites and all other prices are preserved', () => {
  for (const unit of getUnits('classic')) {
    const previous = getUnit(unit.id, 'aula');
    assert.equal(unit.sprite, previous.sprite);
    if (unit.id !== 'dragon') assert.equal(unit.cost, previous.cost);
  }
  const dragon = getUnit('dragon', 'classic');
  assert.equal(dragon.cost, 750);
  assert.equal(dragon.move / getUnit('common', 'classic').move, .55);
  assert.equal(dragon.ability, 'flying-heavy');
  assert.match(dragon.description, /2,000.*750/);
  assert.match(BALANCE_PROFILES.classic.description, /55%/);
});

test('invalid profiles are rejected rather than silently selecting the other balance', () => {
  for (const id of ['other','constructor','__proto__','toString',null,{},['classic'],1]) {
    assert.throws(() => getBalanceProfile(id), /perfil/);
    assert.throws(() => getUnits(id), /perfil/);
  }
  assert.equal(getBalanceProfile().id, 'aula', 'Legacy missing fields stay in their original scale');
  assert.equal(getUnit('not-a-unit','classic'), undefined);
});
