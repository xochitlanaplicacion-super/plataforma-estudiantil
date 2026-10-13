import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveMatch, buyLiveUnit } from '../../../public/games/pvz-quest/classroom/live-engine.js';
import { createMatch, beginPlanning } from '../../../public/games/pvz-quest/classroom/engine.js';
import { checkUprootPlant, uprootPlant } from '../../../public/games/pvz-quest/classroom/shovel.js';

function purchasedLivePlant() {
  const start = createLiveMatch({ mode: 'coop-plants', startPaused: true, tacticalPauses: false });
  const bought = buyLiveUnit(start, 'plants', 'peashooter', 1, 2);
  // The buying engine attaches these fields; keep the fixture independent of
  // whether that integration is built before or after this module's tests.
  bought.units[0].paidCost = 100;
  bought.units[0].purchasedBy = 'plants';
  return bought;
}

test('shovel returns the complete original price exactly once and permits replanting', () => {
  const bought = purchasedLivePlant();
  const before = structuredClone(bought);
  const removed = uprootPlant(bought, bought.units[0].id);
  assert.deepEqual(bought, before);
  assert.equal(removed.units.length, 0);
  assert.equal(removed.resources.plants, 200);
  assert.equal(removed.stats.resourcesSpent.plants, 0);
  assert.equal(removed.stats.unitsPlaced.plants, 1); // Historical placement count.
  assert.throws(() => uprootPlant(removed, bought.units[0].id), /planta viva/);
  const replanted = buyLiveUnit(removed, 'plants', 'peashooter', 3, 4);
  assert.equal(replanted.resources.plants, 100);
  assert.equal(replanted.units[0].row, 3);
  assert.equal(replanted.units[0].col, 4);
});

test('any prior damage permanently seals the shovel for that plant', () => {
  const bought = purchasedLivePlant();
  bought.units[0].hp -= 1;
  assert.match(checkUprootPlant(bought, bought.units[0].id).reason, /recibió daño/);
  assert.throws(() => uprootPlant(bought, bought.units[0].id), /recibió daño/);
  bought.units[0].hp = bought.units[0].maxHp;
  bought.units[0].everDamaged = true;
  assert.throws(() => uprootPlant(bought, bought.units[0].id), /recibió daño/);
});

test('free and CPU-owned plants cannot be converted into soles', () => {
  const bought = purchasedLivePlant();
  delete bought.units[0].paidCost;
  assert.throws(() => uprootPlant(bought, bought.units[0].id), /no fue comprada/);
  bought.units[0].paidCost = 100;
  bought.units[0].purchasedBy = 'cpu';
  assert.throws(() => uprootPlant(bought, bought.units[0].id), /no fue comprada/);
  bought.units[0].purchasedBy = 'plants';
  bought.units[0].paidCost = 10000;
  assert.throws(() => uprootPlant(bought, bought.units[0].id), /verificar el pago/);
});

test('full refund is refused, never truncated, when the 1500-sun wallet is too full', () => {
  const bought = purchasedLivePlant();
  bought.resources.plants = 1450;
  const before = structuredClone(bought);
  assert.throws(() => uprootPlant(bought, bought.units[0].id), /reembolso completo.*1500/);
  assert.deepEqual(bought, before);
  bought.resources.plants = 1400;
  assert.equal(uprootPlant(bought, bought.units[0].id).resources.plants, 1500);
});

test('only the human Plants placement turn can use the shovel', () => {
  const bought = purchasedLivePlant();
  const zombieTurn = { ...bought, activeSide: 'zombies' };
  assert.throws(() => uprootPlant(zombieTurn, bought.units[0].id), /turno/);
  const coin = { ...bought, tacticalPhase: 'coin' };
  assert.throws(() => uprootPlant(coin, bought.units[0].id), /moneda/);
  const ended = { ...bought, closing: true };
  assert.throws(() => uprootPlant(ended, bought.units[0].id), /terminó/);

  const round = beginPlanning(createMatch({ mode: 'duel' }));
  round.units.push({ ...bought.units[0] });
  round.resources.plants = 100;
  round.stats.resourcesSpent.plants = 100;
  const removed = uprootPlant(round, round.units[0].id);
  assert.equal(removed.resources.plants, 200);
  assert.equal(removed.units.length, 0);
  assert.throws(() => uprootPlant({ ...round, phase: 'resources' }, round.units[0].id), /turno de colocación/);
});
