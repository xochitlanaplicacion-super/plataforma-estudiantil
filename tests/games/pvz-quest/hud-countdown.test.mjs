import test from 'node:test';
import assert from 'node:assert/strict';
import { countdownView, formatCountdown, renderCountdown } from '../../../public/games/pvz-quest/classroom/hud-countdown.js';

const live = extra => ({ phase: 'live', config: { tempo: 'continuous', waveSeconds: 600 }, round: 2, waveElapsed: 30, ...extra });
test('countdowns format ten-minute waves and round up partial seconds', () => {
  assert.equal(formatCountdown(600), '10:00');
  assert.equal(formatCountdown(61.1), '01:02');
  assert.equal(formatCountdown(-3), '00:00');
  assert.equal(formatCountdown(NaN), '00:00');
  assert.equal(countdownView(live()).seconds, 570);
});
test('wave urgency is visible only in the last ten running seconds', () => {
  assert.equal(countdownView(live({ waveElapsed: 590 })).urgent, true);
  assert.equal(countdownView(live({ waveElapsed: 589 })).urgent, false);
  assert.equal(countdownView(live({ waveElapsed: 597, paused: true })).urgent, false);
  assert.equal(countdownView(live({ closing: true })).urgent, false);
});
test('tactical shops display the next full wave duration without pretending combat is running', () => {
  const view = countdownView(live({ waveElapsed: 600, pendingWave: 3, tacticalPhase: 'shopping', paused: true }));
  assert.equal(view.label, 'Oleada 3');
  assert.equal(view.seconds, 600);
  assert.equal(view.paused, true);
  assert.equal(view.note, 'Comienza al revelar');
});
test('active question clock overrides the wave; finishing it restores the wave', () => {
  const debate = { active: true, kind: 'quiz', seconds: 8, paused: false };
  assert.equal(countdownView(live(), debate).label, 'Responder');
  assert.equal(countdownView(live(), debate).seconds, 8);
  assert.equal(countdownView(live(), { ...debate, active: false }).label, 'Oleada 2');
  assert.equal(countdownView(live({ paused: true }), debate).paused, false, 'Combat pause never pauses educational debate');
});
test('planning clocks respect pause/expiry and disappear between turns and at the result', () => {
  const planning = { phase: 'planning', config: { tempo: 'rounds' } };
  const clock = { active: true, kind: 'planning', seconds: 0, expired: true };
  assert.equal(countdownView(planning, clock).note, 'Tiempo de debate terminado');
  assert.equal(countdownView(planning, { ...clock, seconds: 23, paused: true, expired: false }).paused, true);
  assert.equal(countdownView({ ...planning, phase: 'handover' }, clock), null);
  assert.equal(countdownView(live({ phase: 'finished' }), { active: true, kind: 'quiz', seconds: 10 }), null);
  assert.equal(countdownView(null, clock), null);
});
test('HUD renderer reuses its nodes and clears warning states when hidden', () => {
  const parts = Object.fromEntries(['label', 'value', 'note'].map(key => [`.quest-countdown-${key}`, { textContent: '' }]));
  const states = new Map();
  const element = { hidden: true, classList: { toggle: (name, value) => states.set(name, value) },
    querySelector: key => parts[key], setAttribute: (key, value) => { element[key] = value; } };
  renderCountdown(element, { label: 'Oleada 1', seconds: 9, note: 'Hasta la siguiente oleada', urgent: true });
  assert.equal(element.hidden, false);
  assert.equal(parts['.quest-countdown-value'].textContent, '00:09');
  assert.match(element['aria-label'], /9 segundos/);
  assert.equal(states.get('urgent'), true);
  renderCountdown(element, null);
  assert.equal(element.hidden, true);
  assert.equal(states.get('urgent'), false);
});
