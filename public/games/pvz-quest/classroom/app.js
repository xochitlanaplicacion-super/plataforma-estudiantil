import { getUnit } from './catalog.js';
import { createMatch, grantResources, beginPlanning, addOrder, removeOrder, commitPlan, continuePlanning, resolveRound, resolveCleanup, publicSnapshot, availableUnits } from './engine.js';
import { LIVE_RULES, LIVE_ZOMBIE_SPEED_PRESETS, createLiveMatch, awardLiveResources, buyLiveUnit, pauseLive, stepLive, liveSnapshot, availableLiveUnits, selectLiveSide, setLiveZombieSpeed, beginLiveInitialCoin, beginLiveTacticalShopping, confirmLiveTacticalTurn, resumeLiveTacticalWave } from './live-engine.js';
import { normalizeQuestions, createQuestionPool, takeQuestion, gradeQuestion, buildQuestionPrompt } from './questions.js';
import { BoardRenderer, renderCard } from './renderer.js';
import { EFFECT_NAMES, combatSoundNames } from './sound-events.js';
import { createIceSound } from './ice-audio.js';
import { compactCombatEvents } from './combat-events.js';
import { countdownView, renderCountdown } from './hud-countdown.js';
import { assetURL, platformMode, questionsAPI, statusAPI } from './runtime.js';
import { createWavePresentation } from './wave-presentation.js';

const $ = selector => document.querySelector(selector);
const sideName = side => side === 'plants' ? 'Plantas' : side === 'draw' ? 'Empate' : 'Zombis';
const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const questionKey = text => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,;:]+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const uid = () => crypto.randomUUID();
const query = new URLSearchParams(location.search);
const isPublic = query.get('display') === 'public';
const session = isPublic ? query.get('session') : uid();
const safeSession = /^[a-f\d-]{36}$/i.test(session || '');
const channel = safeSession && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`pvz-aula-${session}`) : null;
let match = null;
let settings = null;
let busy = false;
let runToken = 0;
let selection = null;
let selectedCell = null;
let bank = [];
let reviewed = [];
let approved = false;
let pool = null;
let usedPrompts = [];
let quiz = null;
let answered = { plants: false, zombies: false };
let clock = { end: 0, remaining: 0, kind: '', paused: false, expired: false };
let toastTimeout;
let projection = null;
let publicView = null;
let publicDebateClock = null;
let lastClockBroadcast = '';
let generating = false;
let rendererReady = false;
let soundEnabled = false;
let audioWarningAt = -Infinity;
let liveRAF = 0;
let livePrevious = 0;
let liveLastUpdate = 0;
let liveLastGroan = -10;
let pendingLiveEvents = [];
let boardFitRAF = 0;
let boardFocused = false;
let focusMarkup = '';
let livePreparedSides = { plants: false, zombies: false };
let liveInitialResources = { plants: 200, zombies: 200 };
let tacticalVisualKey = '';
const presentation = createWavePresentation($('#board-stage'));
const music = new Audio(assetURL('/assets/audio/theme.mp3'));
music.loop = true; music.volume = 0.3; music.preload = 'none';
const effects = new Map();
const unlockedEffects = new Set();
const lastSounds = new Map();
const iceSound = createIceSound({ onError: audioFailure });
const renderer = new BoardRenderer($('#board'), { onCell: ({ row, col }) => place(row, col) });
const continuous = () => settings?.tempo === 'continuous';
const snapshot = () => continuous() ? livePublicSnapshot() : publicSnapshot(match);
const quizElement = part => $(`${continuous() ? '#live-quiz-' : '#quiz-'}${part}`);
const controlsAllowed = () => match && (continuous() ? match.phase === 'live' : match.phase === 'resources');
const award = (state,side,amount) => continuous() ? awardLiveResources(state,side,amount) : grantResources(state,side,amount);

function livePublicSnapshot() {
  const view = liveSnapshot(match);
  view.config.planning = settings.planning;
  if (match.initialStaging && !match.tacticalPhase) {
    // The first two purchases appear together, never one captain's plan on
    // the projector. Do not leak hidden spending through budgets or stats.
    view.units = [];
    view.resources = { ...liveInitialResources };
    view.stats.resourcesSpent = { plants: 0, zombies: 0 };
    view.stats.unitsPlaced = { plants: 0, zombies: 0 };
    view.stats.resourcesAwarded = { plants: 0, zombies: 0 };
    view.purchasesBySideThisWave = { plants: 0, zombies: 0 };
    view.humanPurchasesThisWave = 0;
  }
  return view;
}

function liveQuestionButtons() {
  if (settings.questionMode !== 'bank') return '';
  return humanSides().map(side => `<button type="button" data-action="quiz" data-side="${side}" ${quiz || !pool?.remaining.length ? 'disabled' : ''}>Pregunta: ${sideName(side)}</button>`).join('');
}

function livePreparationButton() {
  if (match.tacticalPhase === 'briefing') return `<button class="primary" type="button" data-action="initial-coin" ${settings.questionMode === 'bank' && humanSides().some(side => !answered[side]) ? 'disabled' : ''}>Lanzar moneda y abrir tiendas 🪙</button>`;
  if (match.tacticalPhase === 'coin') return '<strong>La moneda decide quién compra primero…</strong>';
  if (match.tacticalPhase === 'shopping') return `<button class="primary" type="button" data-action="tactical-confirm" data-side="${match.activeSide}">Confirmar compras: ${sideName(match.activeSide)}${humanSides().includes(match.activeSide) ? '' : ' · computadora'} ✓</button>`;
  if (match.tacticalPhase === 'ready') return `<button id="live-deploy" class="primary" type="button" data-action="tactical-resume">${match.initialStaging ? 'Revelar ambos equipos y comenzar' : `Revelar compras y comenzar oleada ${match.pendingWave}`} ▶</button>`;
  if (!match.initialStaging) return '';
  if (humanSides().every(side => livePreparedSides[side])) return '<button id="live-deploy" class="primary" type="button" data-action="live-deploy">Revelar ambos equipos y comenzar ▶</button>';
  return `<button class="primary" type="button" data-action="live-lock" ${livePreparedSides[match.activeSide] ? 'disabled' : ''}>Confirmar primera compra: ${sideName(match.activeSide)} ✓</button>`;
}

function focusedLiveRewardsHTML() {
  return humanSides().map(side => `<span class="live-focus-rewards"><strong>${side === 'plants' ? '☀' : '🧠'}</strong>${[25,50,100].map(amount => `<button type="button" data-action="focus-award" data-side="${side}" data-amount="${amount}" aria-label="Premiar ${sideName(side)} con ${amount}">+${amount}</button>`).join('')}</span>`).join('');
}

// Size only the CSS presentation. Never reset the 960×540 bitmap, simulation
// or input handler when fullscreen, orientation or the available arena changes.
function requestBoardFit() {
  if (boardFitRAF) return;
  boardFitRAF = requestAnimationFrame(() => {
    boardFitRAF = 0;
    if ($('#game').hidden) return;
    const stage = $('#board-stage');
    const width = stage.clientWidth - 4, height = stage.clientHeight - 4;
    if (!width || !height) return;
    const fittedWidth = Math.floor(Math.min(width, height * 960 / 540));
    const fittedHeight = fittedWidth * 540 / 960;
    const canvas = $('#board');
    canvas.style.setProperty('--board-width', `${fittedWidth}px`);
    canvas.style.setProperty('--board-height', `${fittedHeight}px`);
  });
}
const boardObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(requestBoardFit) : null;
boardObserver?.observe($('#board-stage'));
boardObserver?.observe($('#game'));
window.addEventListener('resize',requestBoardFit);
document.addEventListener('fullscreenchange',requestBoardFit);
window.visualViewport?.addEventListener('resize',requestBoardFit);

function focusActionsHTML() {
  if (!match) return '';
  const open = '<button type="button" data-action="focus">Ver controles / tienda</button>';
  if (busy) return '<strong>Combate en curso</strong>';
  if (continuous() && match.phase === 'live') return `<span>${match.tacticalPhase ? 'Preparación táctica' : match.initialStaging ? 'Primera compra' : 'Compras directas'}: ${sideName(match.activeSide)}${selection ? ` · ${escape(getUnit(selection).name)}` : ''}${match.paused ? ' · en pausa' : ''}</span>${focusedLiveRewardsHTML()}${livePreparationButton()}${liveQuestionButtons()}${open}`;
  if (match.phase === 'planning') return `<span>${sideName(match.activeSide)} · ${match.plans[match.activeSide].length} compras${selection ? ` · ${escape(getUnit(selection).name)}` : ''}</span><button type="button" class="primary" data-action="commit">Confirmar compras ✓</button>${open}`;
  if (match.phase === 'resources') return `<span>Responder y ganar soles / cerebros</span><button type="button" data-action="focus">Abrir preguntas / premios</button><button class="primary" type="button" data-action="plan" ${settings.questionMode === 'bank' && humanSides().some(side => !answered[side]) ? 'disabled' : ''}>Comenzar compras →</button>`;
  if (match.phase === 'handover') return `<span>Cambio de equipo</span><button class="primary" type="button" data-action="handover">Abrir siguiente turno →</button>`;
  if (['ready','cleanup'].includes(match.phase)) return `<span>${match.phase === 'cleanup' ? 'Última horda' : 'Planes listos'}</span><button class="primary" type="button" data-action="resolve">${match.phase === 'cleanup' ? 'Resolver siguiente paso' : 'Revelar y resolver ronda'} →</button>`;
  return `<strong>${match.winner === 'draw' ? 'Empate' : `¡Ganan ${sideName(match.winner)}!`}</strong><button class="primary" type="button" data-action="confirm-exit">Preparar otra clase</button>`;
}

function updateBoardFocus() {
  $('#game').classList.toggle('focus-mode',boardFocused);
  $('#board-focus').setAttribute('aria-pressed',String(boardFocused));
  $('#board-focus').textContent = boardFocused ? 'Ver controles' : 'Ampliar tablero';
  $('#focus-actions').hidden = !boardFocused || isPublic;
  const markup = boardFocused ? focusActionsHTML() : '';
  if (markup !== focusMarkup) {
    $('#focus-actions').innerHTML = markup;
    focusMarkup = markup;
  }
  requestBoardFit();
}

function prepareSounds() {
  for (const name of EFFECT_NAMES) {
    if (effects.has(name)) continue;
    const audio = new Audio(assetURL(`/assets/audio/${name}.mp3`));
    audio.volume = 0.55; audio.preload = 'auto'; audio.load();
    effects.set(name,audio);
  }
  music.preload = 'auto';
}

function sound(name) {
  if (!soundEnabled || !(EFFECT_NAMES.includes(name) || name === 'freeze')) return;
  const now = performance.now();
  if (now - (lastSounds.get(name) ?? -Infinity) < 150) return;
  lastSounds.set(name,now);
  if (name === 'freeze') { iceSound.play(); return; }
  prepareSounds();
  const audio = effects.get(name);
  audio.muted = false; audio.questVoice = (audio.questVoice || 0) + 1;
  try { audio.currentTime = 0; audio.play().catch(audioFailure); } catch { audioFailure(); }
}

function audioFailure() {
  if (!soundEnabled || performance.now() - audioWarningAt < 15000) return;
  audioWarningAt = performance.now();
  notify('El navegador no pudo reproducir audio. Pulsa Probar sonido; revisa el volumen y que esta pestaña no esté silenciada.');
}

function enableSound() {
  soundEnabled = true; prepareSounds();
  iceSound.enable();
  $('#settings [name="audio"]').checked = true;
  $('#sound-toggle').textContent = 'Silenciar'; $('#sound-toggle').setAttribute('aria-pressed','true');
  // Called directly from the user's click: unlock media before any await.
  // Some touch browsers grant playback per media element, not per page.
  // Prime each existing effect silently in this same click, without pausing
  // a real effect if a later click has already started that element.
  for (const [name, audio] of effects) {
    if (name === 'points' || unlockedEffects.has(name)) continue;
    const voice = audio.questVoice || 0; audio.muted = true;
    audio.play().then(() => {
      if ((audio.questVoice || 0) === voice) { audio.pause(); audio.currentTime = 0; }
      audio.muted = false; unlockedEffects.add(name);
    }).catch(() => { audio.muted = false; });
  }
  sound('points');
  if (!match?.paused) music.play().catch(audioFailure);
  $('#audio-status').textContent = 'Sonido activado. Puedes silenciar desde Menú durante la partida.';
}

function disableSound() {
  soundEnabled = false;
  iceSound.disable();
  $('#settings [name="audio"]').checked = false;
  $('#sound-toggle').textContent = 'Activar sonido'; $('#sound-toggle').setAttribute('aria-pressed','false');
  music.pause(); for (const audio of effects.values()) audio.pause();
  $('#audio-status').textContent = 'Sonido desactivado. Pulsa Probar sonido o actívalo desde Menú.';
}

function combatSounds(events) {
  for (const name of combatSoundNames(events)) sound(name);
}

function notify(message) {
  clearTimeout(toastTimeout);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 5500);
}

function animateReward(side,amount,source,broadcast = true) {
  if (broadcast) channel?.postMessage({type:'reward',side,amount});
  const destination = $(side === 'plants' ? '.plant-chip' : '.zombie-chip');
  if (!destination || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const from = source?.getBoundingClientRect?.() || $('#board').getBoundingClientRect();
  const to = destination.getBoundingClientRect();
  const flight = document.createElement('span'); flight.className = `reward-flight ${side}`;
  flight.textContent = `${side === 'plants' ? '☀' : '🧠'} +${amount}`;
  flight.setAttribute('aria-hidden','true');
  flight.style.setProperty('--start-x',`${from.left+from.width/2}px`);
  flight.style.setProperty('--start-y',`${from.top+from.height/2}px`);
  flight.style.setProperty('--end-x',`${to.left+to.width/2}px`);
  flight.style.setProperty('--end-y',`${to.top+to.height/2}px`);
  // A round question is a native top-layer dialog: its prize must not be
  // hidden underneath that dialog's backdrop.
  ($('#quiz-dialog').open ? $('#quiz-dialog') : $('#game')).append(flight);
  flight.addEventListener('animationend',() => flight.remove(),{once:true});
  setTimeout(() => flight.remove(),1200);
  destination.classList.remove('resource-pop');
  void destination.offsetWidth;
  destination.classList.add('resource-pop');
  setTimeout(() => destination.classList.remove('resource-pop'),700);
}

function animateSunRewards(events) {
  for (const event of events.filter(event => event.type === 'sun' && event.amount > 0)) {
    const box = $('#board').getBoundingClientRect();
    const x = box.left + (48 + (event.col + 0.5) * 108) / 960 * box.width;
    // Finish the canvas sun's upward flight with a HUD reward flight. No
    // collection click is required and this animation never grants resources.
    const origin = { getBoundingClientRect: () => ({ left: x, top: box.top, width: 0, height: 0 }) };
    const token = runToken;
    setTimeout(() => { if (token === runToken && !$('#game').hidden) animateReward('plants',event.amount,origin,false); },650);
  }
}

function humanSides() {
  return settings.mode === 'duel' ? ['plants', 'zombies'] : [settings.mode === 'coop-plants' ? 'plants' : 'zombies'];
}

function publish(snapshot, notice = '', stage = null, liveEvents = null) {
  if (!channel) return;
  channel.postMessage({ type: 'view', snapshot, notice, ...(stage ? {stage} : {}), ...(liveEvents ? {liveEvents} : {}) });
}

function quizResultText(publicView = false) {
  // Before the joint reveal, even a clipped prize can disclose hidden spending.
  // Keep correctness/learning feedback, but not the actual credited amount or cap.
  const concealCredit = (match?.initialStaging || match?.tacticalPhase) && (publicView ||
    (settings.planning === 'secret' && quiz?.side !== match.activeSide));
  return concealCredit ? quiz?.publicResult || '' : quiz?.result || '';
}

function publishQuiz() {
  // Never send the bank, answer index or explanation before answering.
  const view = quiz ? { side: quiz.side, prompt: quiz.question.prompt, options: [...quiz.question.options], done: quiz.done, result: quiz.done ? quizResultText(true) : '', seconds: settings.timer && !quiz.done ? Math.ceil(Math.max(0,clock.end-Date.now())/1000) : null } : null;
  channel?.postMessage({type:'quiz',view});
}

function resetClock(kind = '', seconds = settings?.timer || 0) {
  clock = { end: seconds ? Date.now() + seconds * 1000 : 0, remaining: seconds * 1000, kind, paused: false, expired: false };
  updateClock();
}

function updateClock() {
  if (isPublic) return;
  const remaining = clock.paused ? clock.remaining : Math.max(0, clock.end - Date.now());
  const seconds = Math.ceil(remaining / 1000);
  const enabled = !!clock.kind && !!settings?.timer;
  const debate = { kind: clock.kind, seconds, paused: clock.paused, expired: clock.expired,
    active: enabled && (clock.kind === 'quiz' ? !!quiz && !quiz.done : match?.phase === 'planning') };
  renderCountdown($('#timer'), countdownView(match, debate));
  renderCountdown($('#quiz-countdown'), !continuous() && quiz && !quiz.done ? countdownView(match, debate) : null);
  const message = JSON.stringify(debate);
  if (message !== lastClockBroadcast) {
    lastClockBroadcast = message;
    channel?.postMessage({ type: 'countdown', view: debate });
  }
  $('#timer-toggle').hidden = !enabled || clock.expired || clock.kind === 'quiz';
  $('#timer-toggle').textContent = clock.paused ? 'Reanudar reloj' : 'Pausar reloj';
  if (quiz) quizElement('team').textContent = `Pregunta para ${sideName(quiz.side)}${enabled ? ` · ${seconds} s` : ''}`;
  if (quiz && !quiz.done) publishQuiz();
  if (enabled && !clock.paused && !clock.expired && remaining === 0) {
    clock.expired = true;
    if (clock.kind === 'quiz' && quiz && !quiz.done) answerQuiz(-1);
    else notify('Terminó el debate de compra. El profesor puede confirmar o permitir unos segundos más.');
  }
}

function transition(operation) {
  if (!match || busy || isPublic) return;
  try {
    match = operation(match);
    selection = null; selectedCell = null;
    render();
  } catch (error) { notify(error.message); }
}

function place(row, col) {
  if (!match || busy || (continuous() ? match.phase !== 'live' : match.phase !== 'planning') || !selection || isPublic) return;
  if (continuous() && !match.tacticalPhase && match.initialStaging && livePreparedSides[match.activeSide]) return notify('Este equipo ya confirmó su primera compra. Revela ambos planes para comenzar.');
  try {
    match = continuous() ? buyLiveUnit(match, match.activeSide, selection,row,col) : addOrder(match, match.activeSide, selection, row, col);
    sound('plantation');
    selectedCell = { row, col };
    if (!(continuous() ? availableLiveUnits : availableUnits)(match, match.activeSide).find(unit => unit.id === selection)?.affordable) selection = null;
    render();
  } catch (error) { notify(error.message); }
}

function renderCards(side) {
  const cards = (continuous() ? availableLiveUnits : availableUnits)(match, side);
  return `<div class="cards" aria-label="Tienda de ${sideName(side)}">${cards.map(unit => `<button type="button" class="unit-card ${side} ${selection === unit.id ? 'selected' : ''}" data-action="select" data-id="${unit.id}" ${unit.affordable ? '' : 'disabled'} title="${escape(unit.disabledReason || (continuous() ? liveDescription(unit) : unit.description))}"><canvas data-card="${unit.id}" width="100" height="80"></canvas><strong>${escape(unit.name)}</strong><small><span class="card-price">${side === 'plants' ? '☀' : '🧠'} ${unit.cost}</span><span class="card-hp">♥ ${unit.hp}</span></small></button>`).join('')}</div>`;
}

function cardInfoHTML(live = false) {
  const unit = selection ? getUnit(selection) : null;
  return `<details class="card-info"><summary>${unit ? `Habilidad: ${escape(unit.name)}` : 'Cómo comprar / habilidades'}</summary><p>${unit ? escape(live ? liveDescription(unit) : unit.description) : 'Escoge una tarjeta y toca la casilla. Plantas en 1–6; zombis en entrada 7. Los precios y la vida aparecen en cada tarjeta.'}</p></details>`;
}

function controlsHTML() {
  if (busy) return '<div class="phase-controls"><strong>Combate en curso</strong><span>Observen el jardín · cada paso se ejecuta una sola vez.</span></div>';
  if (continuous() && match.phase === 'live') return liveControlsHTML();
  if (match.phase === 'resources') {
    return `<div class="phase-controls"><strong>Responder y ganar recursos</strong>${humanSides().map(side => `<div class="reward-section"><strong>${sideName(side)}</strong><div class="button-row">${settings.questionMode === 'bank' ? `<button type="button" data-action="quiz" data-side="${side}" ${answered[side] ? 'disabled' : ''}>${answered[side] ? 'Pregunta resuelta ✓' : 'Responder pregunta'}</button>` : [25,50,100].map(amount => `<button type="button" data-action="award" data-side="${side}" data-amount="${amount}" ${match.bonusThisRound[side] + amount > 300 ? 'disabled' : ''}>+${amount}</button>`).join('')}</div></div>`).join('')}<button class="primary" type="button" data-action="plan" ${settings.questionMode === 'bank' && humanSides().some(side => !answered[side]) ? 'disabled' : ''}>Comenzar compras →</button>${settings.questionMode === 'bank' ? `<details class="shop-help"><summary>Banco: ${pool?.remaining.length || 0} preguntas</summary><div><button type="button" data-action="bank">Ampliar banco revisado</button><button type="button" data-action="manual">Pasar a premio manual</button></div></details>` : '<details class="shop-help"><summary>Ayuda</summary><p>Concede recursos por una respuesta o un buen debate. Para jugar sin preguntas, continúa sin premios.</p></details>'}</div>`;
  }
  if (match.phase === 'planning') {
    const side = match.activeSide;
    return `<div class="control-intro"><p class="eyebrow">TIENDA · ${sideName(side)}</p><p>${side === 'plants' ? 'Siembra en 1–6.' : 'Envía por entrada 7.'} Compra mientras haya saldo y espacio.</p></div><div class="shop-area">${renderCards(side)}${cardInfoHTML()}</div><div class="shop-footer"><h3>Compras: ${match.plans[side].length}</h3><ul class="orders">${match.plans[side].map(order => `<li><span>${escape(getUnit(order.typeId).name)} · ${'ABCDE'[order.row]}${order.col}</span><button data-action="undo" data-id="${escape(order.id)}" type="button" aria-label="Deshacer ${escape(getUnit(order.typeId).name)}">↶</button></li>`).join('')}</ul><button type="button" class="primary full-button" data-action="commit">Confirmar ${match.plans[side].length ? 'compras' : 'sin compras'} ✓</button></div>`;
  }
  if (match.phase === 'handover') return `<div class="phase-controls handover"><strong>Turno de ${sideName(match.activeSide === 'plants' ? 'zombies' : 'plants')}</strong><span>${settings.planning === 'secret' ? 'Mantén el proyector congelado durante la compra privada.' : 'El segundo equipo puede preparar su jugada.'}</span><button type="button" class="primary" data-action="handover">Abrir su turno →</button></div>`;
  if (match.phase === 'ready') return `<div class="phase-controls"><strong>Ambos planes están listos.</strong><span>${settings.planning === 'secret' ? 'Reactiva el proyector antes de revelar.' : 'Observen el despliegue y el combate.'}</span><button type="button" class="primary" data-action="resolve">Revelar y resolver ronda →</button></div>`;
  if (match.phase === 'cleanup') return '<div class="phase-controls"><strong>Última horda · sin nuevos ingresos ni compras</strong><button type="button" class="primary" data-action="resolve">Resolver siguiente paso →</button><details class="shop-help"><summary>Regla de cierre</summary><p>Los zombis supervivientes siguen avanzando. Las plantas ganan cuando no quede ninguno; máximo 30 pasos antes de empate.</p></details></div>';
  const result = match.winner === 'draw' ? 'Empate' : `¡Ganan ${sideName(match.winner)}!`;
  return `<div class="phase-controls"><h2 class="winner">${result}</h2><span>${match.stats.unitsPlaced.plants} plantas · ${match.stats.unitsPlaced.zombies} zombis desplegados.</span><button class="primary" type="button" data-action="confirm-exit">Preparar otra clase</button><details class="shop-help"><summary>Resultado</summary><p>${match.winner === 'plants' ? 'La casa resistió y no queda ningún zombi.' : match.winner === 'zombies' ? 'Un zombi entró por un carril sin podadora.' : 'El cierre llegó a su límite con unidades todavía en combate; no se asigna una victoria automática.'} Comenten qué mejorarían en la siguiente partida.</p></details></div>`;
}

function liveControlsHTML() {
  const side = match.activeSide;
  const locked = match.initialStaging && livePreparedSides[side];
  const rules = `Compra mientras haya saldo y espacio, sin cupo de compras por oleada. Recarga de 1 s por tarjeta durante el combate para evitar dobles clics; límite técnico de ${LIVE_RULES.maxZombies} zombis simultáneos. Hasta 4 girasoles producen 25 soles cada 12 s y se recogen solos; puedes plantar más, pero no aumentan la producción. La velocidad sube automáticamente: Muy lenta → Lenta → Tranquila → Normal → Rápida → Muy rápida (máximo desde la oleada 6). Un cambio manual dura hasta la próxima oleada. El hielo frena 30% durante 4 s renovables y los pinchos 40% mientras los cruzan; se usa el efecto mayor, no se multiplican. Globos y dragones evitan los pinchos. La carnívora mastica 20 s antes de devorar otra vez. El copiloto envía 5 zombis en la primera oleada, después uno adicional por oleada hasta 20: cono desde la 2, cubeta 3, jugador 4, globo 5 y dragón 6. Los premios siguen habilitados durante combate y pausas; saldo máximo 1,500. La moneda fija el orden de compra, incluida la preparación inicial después de las preguntas. Cada unidad descuenta su precio al colocarla; confirmar no cobra otra vez. No se mueve ni se retira ninguna planta.`;
  return `<div class="control-intro"><p class="eyebrow">TIENDA · ${sideName(side)}</p>${settings.mode === 'duel' ? `<div class="live-side-switch">${humanSides().map(team => `<button type="button" data-action="live-side" data-side="${team}" aria-pressed="${team === side}" ${match.tacticalPhase || (match.initialStaging && settings.planning === 'secret') ? 'disabled' : ''}>${sideName(team)}${match.initialStaging && livePreparedSides[team] ? ' ✓' : ''}</button>`).join('')}</div>` : ''}</div><div class="shop-area">${renderCards(side)}</div><div class="live-rewards">${humanSides().map(team => `<div class="reward-section"><strong>${team === 'plants' ? '☀' : '🧠'} ${sideName(team)}</strong><div class="button-row">${[25,50,100].map(amount => `<button data-action="award" data-side="${team}" data-amount="${amount}" type="button">+${amount}</button>`).join('')}</div></div>`).join('')}</div><div class="shop-footer"><p id="live-closing-note">${match.initialStaging ? locked ? 'Primera compra confirmada.' : 'Primero responder y lanzar la moneda; el combate no ha comenzado.' : match.closing ? 'Última horda: compras cerradas; premios disponibles.' : 'Compra al tocar el mapa. Sin confirmación fuera de la pausa táctica.'}</p>${livePreparationButton()}${settings.questionMode === 'bank' ? `<div class="live-question-actions">${liveQuestionButtons()}</div><details class="shop-help"><summary>Banco: <span id="live-bank-count">${pool?.remaining.length || 0}</span></summary><div class="button-row"><button type="button" data-action="bank">Ampliar banco</button><button type="button" data-action="manual">Premio manual</button></div></details>` : ''}${cardInfoHTML(true)}<details class="shop-help"><summary>Reglas / asistente</summary><p>${rules}</p></details></div>`;
}

function liveDescription(unit) {
  const timings = { sunflower: 'Produce 25 soles cada 12 segundos de combate, recogidos automáticamente; máximo 4 productores efectivos.', mine: 'Se arma en 5 segundos de combate. Elimina al primer zombi terrestre que la pisa; globo y dragón la evitan.', chomper: 'Devora un zombi terrestre cercano y mastica durante 20 segundos de combate antes de volver a comer. No devora globos ni dragones.', spikes: 'Causa 1 de daño cada 2 segundos de contacto y reduce el avance terrestre un 40% mientras la cruzan. No daña ni frena globos o dragones.', 'ice-shooter': 'Dispara cada 2.4 s; cada impacto causa 1 de daño y reduce el avance un 30% durante 4 segundos, renovables. No acumula porcentajes con otros impactos.', wall: 'Bloquea el avance de los zombis terrestres y absorbe sus mordidas; su aspecto se deteriora al perder vida.', flying: 'Avanza volando y evita minas, pinchos y bloqueadores; los tiradores pueden alcanzarlo.', 'flying-heavy': 'El dragón flota: evita minas, pinchos y ralentización terrestre; los tiradores pueden alcanzarlo.' };
  return `${unit.name}: ${timings[unit.ability] || (unit.side === 'plants' ? `Dispara cada 2.4 s. Daño por disparo: ${unit.damage}.` : `Avanza ${unit.move} casilla(s) cada 5 s y muerde con daño ${unit.damage} cada 1.5 s.`)} Vida: ${unit.hp}.`;
}

function titleFor(state) {
  if (state.config.tempo === 'continuous') return `${state.closing ? 'Última horda' : 'Oleada'} ${state.round} / ${state.maxRounds}`;
  return `${state.phase === 'cleanup' ? 'Última horda' : 'Ronda'} ${state.round} / ${state.maxRounds}`;
}

function updateLiveUI(events = []) {
  if (!match || !continuous()) return;
  $('#game').dataset.phase = match.phase;
  $('#game').dataset.tempo = settings.tempo;
  $('#game').dataset.tactical = match.tacticalPhase || '';
  $('#round-title').textContent = titleFor(match);
  for (const side of ['plants','zombies']) {
    const hidden = (match.initialStaging || match.tacticalPhase) && settings.planning === 'secret' && side !== match.activeSide;
    $(side === 'plants' ? '#plant-money' : '#zombie-money').textContent = hidden ? match.tacticalPublicResources?.[side] ?? liveInitialResources[side] : match.resources[side];
  }
  $('#live-pause').hidden = match.phase !== 'live' || match.initialStaging || !!match.tacticalPhase;
  $('#live-pause').textContent = match.paused ? 'Reanudar combate' : 'Pausar combate';
  $('#live-pause').setAttribute('aria-pressed', String(match.paused));
  const left = Math.max(0,Math.ceil(settings.waveSeconds - match.waveElapsed));
  const tacticalText = { briefing: 'Primero responder / premiar · después lanzar moneda y abrir tiendas', coin: 'Pausa táctica · sorteando el primer turno de compra', shopping: `Pausa táctica · compra ${sideName(match.activeSide)}${humanSides().includes(match.activeSide) ? '' : ' (computadora)'} · los premios siguen disponibles`, ready: 'Ambos equipos confirmaron · revelar y reanudar combate' };
  const caption = match.phase === 'finished' ? `Resultado: ${match.winner === 'draw' ? 'Empate' : sideName(match.winner)}` : match.tacticalPhase ? tacticalText[match.tacticalPhase] : match.initialStaging ? 'Preparen ambos equipos · una sola revelación inicial · premios disponibles' : `${match.paused ? 'Combate pausado · premios habilitados' : 'Combate en marcha'} · ${match.closing ? 'Resolviendo supervivientes' : `${left} s para siguiente oleada`}`;
  $('#status').textContent = caption;
  const assistCount = match.assistantWavePlan.length;
  $('#board-caption').textContent = `Asistente zombi: ${match.assistantSpawnedThisWave}/${assistCount} refuerzos · ${zombieSpeedDescription(match)} · Soles automáticos`;
  const side = match.activeSide;
  if ($('#live-bank-count')) $('#live-bank-count').textContent = pool?.remaining.length || 0;
  if (quiz?.done) quizElement('result').textContent = quizResultText();
  if ($('#live-closing-note')) $('#live-closing-note').textContent = match.tacticalPhase ? tacticalText[match.tacticalPhase] : match.initialStaging ? livePreparedSides[side] ? 'Primera compra confirmada.' : 'Prepara la primera compra; el combate no ha comenzado.' : match.closing ? 'Última horda: compras cerradas; premios disponibles.' : `Compra inmediata · copiloto ${match.assistantSpawnedThisWave}/${assistCount} · avance ${match.zombieSpeed.toFixed(2)}×`;
  for (const button of $('#controls').querySelectorAll('[data-action="live-side"]')) button.disabled = !!match.tacticalPhase || (match.initialStaging && settings.planning === 'secret');
  const coinButton = $('#controls [data-action="initial-coin"]');
  if (coinButton) coinButton.disabled = settings.questionMode === 'bank' && humanSides().some(team => !answered[team]);
  for (const button of $('#controls').querySelectorAll('[data-action="award"]')) button.disabled = match.phase !== 'live';
  for (const button of $('#controls').querySelectorAll('[data-action="quiz"]')) button.disabled = !!quiz || !pool?.remaining.length || match.phase !== 'live';
  const availability = new Map(availableLiveUnits(match,side).map(unit => [unit.id,unit]));
  for (const button of $('#controls').querySelectorAll('[data-action="select"]')) {
    const unit = availability.get(button.dataset.id);
    button.disabled = !unit?.affordable || !!(!match.tacticalPhase && match.initialStaging && livePreparedSides[side]);
    button.title = unit ? unit.disabledReason || liveDescription(unit) : 'Esta partida ya terminó.';
  }
  const baseline = match.tacticalPublicBaseline?.units || [];
  const baselineIds = new Set(baseline.map(unit => unit.id));
  const privateView = (match.initialStaging || match.tacticalPhase) && settings.planning === 'secret' ? { ...match, units: match.units.filter(unit => baselineIds.has(unit.id) || unit.side === side) } : match;
  renderer.setLiveView(privateView,{selected:selectedCell});
  renderer.showLiveEvents(events);
  animateSunRewards(events);
  updateSpeedUI();
  publish(livePublicSnapshot(),caption,null,events);
  updateBoardFocus();
  handleLivePresentation(match, events);
}

function showResultBanner(state) {
  if (state.phase !== 'finished') return false;
  // Native dialogs live above every z-index; a completed game must be visible.
  $('#quiz-dialog').close();
  $('#bank-dialog').close();
  $('#exit-dialog').close();
  presentation.showMatchResult({ winner: state.winner, isPublic });
  return true;
}

function handleLivePresentation(state, events = []) {
  if (showResultBanner(state)) return;
  if (state.tacticalPhase === 'coin') {
    const key = `${state.pendingWave}:coin`;
    if (tacticalVisualKey !== key) {
      tacticalVisualKey = key;
      const token = runToken;
      music.pause();
      presentation.showTacticalCoin({ side: state.tacticalOrder[0], wave: state.pendingWave, onComplete: isPublic ? undefined : () => {
        if (token !== runToken || match?.tacticalPhase !== 'coin' || match.pendingWave !== state.pendingWave) return;
        match = beginLiveTacticalShopping(match); selection = null; render();
      } });
    }
    return;
  }
  if (events.some(event => event.type === 'wave-ending')) presentation.showWaveAnnouncement({ title: `¡La oleada ${state.round} está por terminar!`, subtitle: state.round === state.maxRounds ? 'Última horda: resuelvan los supervivientes' : state.config.tacticalPauses ? 'Prepárense para la pausa táctica' : 'La próxima oleada llegará sin detener el combate', kind: 'end' });
  else if (events.some(event => event.type === 'closing')) presentation.showWaveAnnouncement({ title: '¡Última horda!', subtitle: 'El combate sigue hasta resolver las unidades restantes', kind: 'final' });
  else if (events.some(event => event.type === 'wave-start' || event.type === 'wave')) presentation.showWaveAnnouncement({ title: `¡Comienza la oleada ${state.round}!`, subtitle: `${zombieSpeedDescription(state)} · respondan y compren mientras avanza el combate`, kind: 'start' });
}

function zombieSpeedDescription(state) {
  const names = ['Muy lenta', 'Lenta', 'Tranquila', 'Normal', 'Rápida', 'Muy rápida'];
  const index = LIVE_ZOMBIE_SPEED_PRESETS.findIndex(value => Math.abs(value - state.zombieSpeed) < .001);
  const label = index < 0 ? 'Personalizada' : names[index];
  return `${state.zombieSpeedMode === 'manual' ? 'Manual hasta la próxima oleada' : 'Velocidad automática'}: ${label} · ${state.zombieSpeed.toFixed(2)}×`;
}

function updateSpeedUI() {
  $('#zombie-controls').hidden = !continuous() || !match || match.phase !== 'live';
  if (!continuous() || !match) return;
  const speed = match.zombieSpeed;
  $('#zombie-speed').value = speed;
  $('#zombie-speed-label').textContent = `${speed.toFixed(2)}×`;
  $('#zombie-speed-mode').textContent = zombieSpeedDescription(match);
  for (const button of document.querySelectorAll('[data-action="speed-preset"]')) {
    button.setAttribute('aria-pressed', String(Math.abs(Number(button.dataset.speed)-speed) < .001));
  }
}

function changeZombieSpeed(value) {
  if (!continuous() || match?.phase !== 'live') return;
  match = setLiveZombieSpeed(match,Number(value));
  updateLiveUI();
}

function liveSounds(events) {
  if (!match || match.paused) return;
  combatSounds(events);
  if (match.units.some(unit => unit.side === 'zombies') && match.elapsed - liveLastGroan >= 10) { liveLastGroan = match.elapsed; sound('zombie_groan'); }
}

function stopLiveLoop() {
  cancelAnimationFrame(liveRAF); liveRAF = 0; livePrevious = 0; pendingLiveEvents = [];
}

function startLiveLoop() {
  stopLiveLoop(); liveLastUpdate = 0; liveLastGroan = -10;
  const token = runToken;
  const frame = time => {
    if (token !== runToken || !match || !continuous() || match.phase !== 'live') { liveRAF = 0; return; }
    const dt = livePrevious ? Math.min(LIVE_RULES.maxExternalStep, Math.max(0,(time-livePrevious)/1000)) : 0;
    livePrevious = time;
    try {
      if (!match.paused && dt) {
        const result = stepLive(match,dt); match = result.state;
        // Movement already lives in fractional coordinates. Broadcast only
        // combat effects, not a separate movement event for every frame/unit.
        pendingLiveEvents.push(...result.events.filter(event => event.type !== 'move'));
        pendingLiveEvents = compactCombatEvents(pendingLiveEvents);
      }
      if (time-liveLastUpdate >= 100 || match.phase === 'finished') {
        liveSounds(pendingLiveEvents);
        if (pendingLiveEvents.some(event => event.type === 'tactical')) { selection = null; selectedCell = null; render(); }
        updateLiveUI(pendingLiveEvents);
        pendingLiveEvents = []; liveLastUpdate = time;
      }
      if (match.phase === 'finished') {
        quiz = null; $('#live-question').hidden = true; publishQuiz(); resetClock();
        music.pause(); render(); liveRAF = 0; return;
      }
      liveRAF = requestAnimationFrame(frame);
    } catch (error) {
      // Stop on a diagnosed simulation error; never retry a damaging tick.
      liveRAF = 0;
      if (match?.phase === 'live') { match = pauseLive(match,true); updateLiveUI(); }
      notify(`Combate detenido: ${error.message}`);
    }
  };
  liveRAF = requestAnimationFrame(frame);
}

function render() {
  if (!match) return;
  document.body.dataset.phase = match.phase;
  document.body.dataset.tempo = settings.tempo;
  $('#game').dataset.phase = match.phase;
  $('#game').dataset.tempo = settings.tempo;
  $('#round-title').textContent = titleFor(match);
  const secret = settings.planning === 'secret' && ['planning','handover','ready'].includes(match.phase);
  // Even on the teacher's device, the next captain must not infer the other
  // team's pending purchases by subtracting their remaining resources.
  for (const side of ['plants','zombies']) {
    const visible = !secret || (match.phase === 'planning' && match.activeSide === side);
    $(side === 'plants' ? '#plant-money' : '#zombie-money').textContent = visible ? match.resources[side] : match.publicResources[side];
  }
  const descriptions = { resources: 'Responder → comprar → revelar', planning: `Compra ${sideName(match.activeSide)} · ${settings.planning === 'secret' ? 'plan privado' : 'jugada abierta'}`, handover: 'Cambio de equipo · compras confirmadas', ready: 'Planes confirmados · listos para revelar', cleanup: 'Última horda · todavía puede ganar cualquiera', finished: `Resultado: ${match.winner === 'draw' ? 'Empate' : sideName(match.winner)}` };
  $('#status').textContent = busy ? 'Resolviendo la ronda…' : descriptions[match.phase];
  $('#controls').innerHTML = controlsHTML();
  showResultBanner(match);
  for (const canvas of document.querySelectorAll('[data-card]')) renderCard(canvas, canvas.dataset.card).catch(() => notify('No se pudo dibujar una tarjeta.'));
  updateBoardFocus();
  if (continuous()) {
    updateLiveUI(); updateClock(); return;
  }
  $('#live-pause').hidden = true;
  const plans = settings.planning === 'secret' ? (match.phase === 'planning' ? match.plans[match.activeSide] : []) : match.plans;
  renderer.setView(match, { plans, selected: selectedCell });
  if (settings.planning === 'secret' && match.phase === 'handover') $('#board-caption').textContent = 'Las compras del primer equipo siguen ocultas.';
  else $('#board-caption').textContent = `Casa · Plantas en columnas 1–6 · Entrada zombi en 7 · ${zombieSpeedDescription(match)}`;
  publish(publicSnapshot(match));
  updateClock();
}

function startGame(event) {
  event.preventDefault();
  if (!rendererReady || match) return;
  const form = new FormData($('#settings'));
  settings = { mode: form.get('mode'), tempo: form.get('tempo') || 'rounds', waveSeconds:Number(form.get('waveSeconds')), planning: form.get('planning') || 'open', rounds: Number(form.get('rounds')), questionMode: form.get('questionMode'), reward: Number(form.get('reward')), timer: Number(form.get('timer')) };
  if (continuous() && settings.mode !== 'duel') settings.planning = 'open';
  if (settings.planning === 'secret' && settings.mode === 'duel' && !form.has('privacy')) return notify('Confirma cómo vas a mantener privadas las compras de ambos equipos.');
  if (settings.questionMode === 'bank' && (!approved || !bank.length)) return notify('Primero importa o genera preguntas, revísalas y aprueba el banco.');
  try {
    match = continuous() ? createLiveMatch({mode:settings.mode,waves:settings.rounds,waveSeconds:settings.waveSeconds,seed:uid(),startPaused:settings.mode === 'duel', tacticalPauses: form.get('tacticalPauses') !== 'off'}) : createMatch({ mode: settings.mode, planning: settings.planning, rounds: settings.rounds, seed: uid() });
    livePreparedSides = { plants: false, zombies: false };
    liveInitialResources = { plants: 200, zombies: 200 };
    pool = approved && bank.length ? createQuestionPool(bank) : null;
    answered = { plants: false, zombies: false }; usedPrompts = [];
    $('#setup').hidden = true; $('#game').hidden = false;
    boardFocused = false; updateBoardFocus();
    $('#battle-log').replaceChildren();
    runToken++; tacticalVisualKey = ''; presentation.clear(); render(); window.scrollTo(0, 0);
    if (form.has('audio')) enableSound(); else disableSound();
    updateSpeedUI();
    if (soundEnabled && !match.paused) music.play().catch(audioFailure);
    if (continuous()) startLiveLoop();
  } catch (error) { match = null; notify(error.message); }
}

async function resolveBattle() {
  if (!match || !['ready','cleanup'].includes(match.phase) || busy || continuous()) return;
  const token = ++runToken;
  let result;
  try { result = match.phase === 'cleanup' ? resolveCleanup(match) : resolveRound(match); } catch (error) { return notify(error.message); }
  busy = true; resetClock(); render();
  const names = { deployment: 'Despliegue conjunto', shots: 'Disparos de las plantas', advance: 'Avance de los zombis', bites: 'Mordidas y trampas', mowers: 'Defensa de la casa', result: 'Resultado de la ronda' };
  await renderer.play(result.stages, stage => {
    $('#status').textContent = names[stage.name] || stage.name;
    const view = publicSnapshot(match);
    view.phase = 'battle'; view.plans = { plants: [], zombies: [] }; view.units = stage.units; view.mowers = stage.mowers;
    publish(view, names[stage.name], stage);
    combatSounds(stage.events);
  });
  if (token !== runToken) return;
  match = result.state; busy = false;
  answered = { plants: false, zombies: false }; selection = null; selectedCell = null;
  const attacks = result.events.filter(item => item.type === 'shot').length;
  const defeats = result.events.filter(item => item.type === 'defeat').length;
  const income = result.events.find(item => item.type === 'income');
  $('#battle-log').replaceChildren(...[`${attacks} disparos`, `${defeats} unidades derrotadas`, ...(income ? [`Ingresos: Plantas +${income.plants} · Zombis +${income.zombies}`] : [])].map(text => { const el = document.createElement('span'); el.textContent = text; return el; }));
  render();
}

function questionSettings() {
  const reserved = match && pool ? pool.questions.filter(question => pool.remaining.includes(question.id)).map(question => question.prompt) : [];
  return { topic: $('#topic').value.trim(), level: $('#level').value.trim(), type: $('#question-type').value, optionCount: Number($('#option-count').value), count: Number($('#question-count').value), exclude: match ? [...usedPrompts,...reserved] : [] };
}

function showReview(questions) {
  reviewed = questions.map(question => ({ ...question, id: uid() }));
  $('#question-review').replaceChildren();
  $('#review-title').textContent = `Revisar ${reviewed.length} preguntas`;
  for (const question of reviewed) {
    const card = document.createElement('article'); card.className = 'review-card';
    const heading = document.createElement('strong'); heading.textContent = question.prompt;
    const options = document.createElement('ol');
    question.options.forEach((text,index) => { const item = document.createElement('li'); item.textContent = text; if (index === question.answerIndex) { item.className = 'correct'; item.textContent += ' ✓'; } options.append(item); });
    const explanation = document.createElement('p'); explanation.className = 'explanation'; explanation.textContent = question.explanation;
    card.append(heading, options, explanation); $('#question-review').append(card);
  }
  $('#bank-error').textContent = ''; $('#approve-bank').disabled = false;
}

function openBank() {
  if (busy || quiz || (match && !controlsAllowed())) return notify('El banco se modifica antes de las compras o durante el modo continuo.');
  if (match && continuous() && !match.paused) return notify('Pulsa Pausar combate antes de revisar o ampliar el banco. No se pausará automáticamente.');
  if (!reviewed.length && bank.length) showReview(bank);
  $('#bank-dialog').showModal();
}

function approveBank() {
  if (!reviewed.length || generating) return;
  try {
    const used = new Set(usedPrompts.map(questionKey));
    const existing = match && pool ? pool.questions.filter(question => pool.remaining.includes(question.id)) : [];
    const merged = [...existing]; const seen = new Set(merged.map(question => questionKey(question.prompt)));
    for (const question of reviewed) {
      const key = questionKey(question.prompt);
      if (!used.has(key) && !seen.has(key)) { merged.push(question); seen.add(key); }
    }
    bank = normalizeQuestions(merged);
    approved = true;
    if (match) pool = createQuestionPool(bank);
    $('#bank-summary').textContent = `${bank.length} preguntas revisadas y aprobadas ✓`;
    $('#bank-dialog').close();
    if (match) render();
    notify('Banco aprobado. Las preguntas no se repiten dentro de la partida.');
  } catch (error) { $('#bank-error').textContent = error.message; }
}

async function generateBank() {
  if (generating) return;
  generating = true; $('#generate-ai').disabled = true; $('#approve-bank').disabled = true;
  $('#bank-error').textContent = ''; $('#ai-status').textContent = 'Generando preguntas para revisión. Esto no inicia una partida ni publica contenido.';
  const requestedSettings = questionSettings();
  try {
    const response = await fetch(questionsAPI, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...requestedSettings, exclude: platformMode ? requestedSettings.exclude.slice(-80) : requestedSettings.exclude }), signal: AbortSignal.timeout(platformMode ? 58000 : 35000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo generar el banco.');
    showReview(normalizeQuestions(result, requestedSettings));
    $('#bank-json').value = JSON.stringify(result, null, 2);
    $('#ai-status').textContent = 'Banco generado: revisa enunciados, respuestas y explicaciones antes de aprobar.';
  } catch (error) { $('#bank-error').textContent = error.name === 'TimeoutError' ? 'La IA tardó demasiado. Puedes reintentar o importar un banco JSON.' : error.message; }
  finally { generating = false; $('#generate-ai').disabled = false; $('#approve-bank').disabled = !reviewed.length; }
}

function openQuiz(side) {
  if (!controlsAllowed() || busy || (!continuous() && answered[side]) || quiz || !humanSides().includes(side)) return;
  try {
    const next = takeQuestion(pool);
    pool = next.pool;
    if (!next.question) { render(); return notify('Se agotó el banco. Amplíalo con preguntas revisadas o pasa a premio manual; no se repetirá ninguna pregunta.'); }
    quiz = { side, question: next.question, done: false };
    usedPrompts.push(quiz.question.prompt);
    quizElement('prompt').textContent = quiz.question.prompt;
    quizElement('options').replaceChildren(...quiz.question.options.map((text,index) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = `${String.fromCharCode(65+index)}. ${text}`; button.dataset.action = 'answer'; button.dataset.index = index; return button; }));
    quizElement('result').textContent = ''; quizElement('next').hidden = true;
    if (continuous()) { $('#live-question').hidden = false; updateLiveUI(); }
    else $('#quiz-dialog').showModal();
    resetClock('quiz'); publishQuiz();
  } catch (error) { notify(error.message); }
}

function answerQuiz(index) {
  if (!quiz || quiz.done) return;
  quiz.done = true; answered[quiz.side] = true;
  const grade = index < 0 ? { correct: false, explanation: quiz.question.explanation, correctAnswer: quiz.question.options[quiz.question.answerIndex] } : gradeQuestion(quiz.question, index);
  // Continuous questions/rewards never depend on wave transition or pause.
  // Keep the old 300 cap only for the explicitly selected round-based mode.
  const bonus = continuous() ? match.bonusThisWave[quiz.side] : match.bonusThisRound[quiz.side];
  const rewarded = grade.correct && match?.phase !== 'finished' && (continuous() || bonus + settings.reward <= 300);
  const received = rewarded ? Math.min(settings.reward,1500 - match.resources[quiz.side]) : 0;
  if (rewarded) {
    match = award(match, quiz.side, settings.reward);
    if (match.initialStaging) liveInitialResources[quiz.side] = Math.min(1500,liveInitialResources[quiz.side]+settings.reward);
    sound('points');
    if (received) animateReward(quiz.side,received,quizElement('options').children[Math.max(0,index)],!match.initialStaging && !match.tacticalPhase);
  }
  resetClock();
  [...quizElement('options').children].forEach((button,i) => { button.disabled = true; if (i === quiz.question.answerIndex) button.classList.add('correct'); else if (i === index) button.classList.add('wrong'); });
  quiz.result = `${grade.correct ? received ? `¡Correcto! +${received} ${quiz.side === 'plants' ? 'soles' : 'cerebros'}.` : '¡Correcto! Sin premio adicional: se alcanzó el límite de recursos.' : index < 0 ? 'Tiempo agotado. No se conceden recursos.' : 'Esta respuesta no es correcta.'} Respuesta: ${grade.correctAnswer}. ${grade.explanation}`;
  quiz.publicResult = `${grade.correct ? '¡Correcto!' : index < 0 ? 'Tiempo agotado.' : 'Esta respuesta no es correcta.'} Respuesta: ${grade.correctAnswer}. ${grade.explanation}`;
  quizElement('result').textContent = quizResultText();
  quizElement('next').hidden = false;
  if (continuous()) updateLiveUI();
  else { $('#plant-money').textContent = match.resources.plants; $('#zombie-money').textContent = match.resources.zombies; publish(publicSnapshot(match)); }
  publishQuiz();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($('#game').requestFullscreen) await $('#game').requestFullscreen();
    else notify('Este navegador no permite pantalla completa nativa. El tablero sigue ajustándose al espacio disponible.');
  } catch { notify('El navegador no autorizó la pantalla completa. Puedes seguir jugando sin perder el turno.'); }
}

function stopGame() {
  stopLiveLoop();
  presentation.clear(); tacticalVisualKey = ''; lastClockBroadcast = '';
  runToken++; busy = false; match = null; quiz = null; selection = null; resetClock();
  renderer.setView({units:[],mowers:[true,true,true,true,true]});
  music.pause();
  iceSound.stop();
  for (const audio of effects.values()) audio.pause();
  $('#live-question').hidden = true; $('#quiz-dialog').close();
  $('#zombie-controls').hidden = true;
  publish(null, 'El profesor terminó la partida.');
  publishQuiz();
  $('#exit-dialog').close(); $('#game').hidden = true; $('#setup').hidden = false;
  boardFocused = false; updateBoardFocus();
  delete document.body.dataset.phase; delete document.body.dataset.tempo;
  delete $('#game').dataset.phase; delete $('#game').dataset.tempo;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  window.scrollTo(0,0);
}

async function action(button) {
  const name = button.dataset.action;
  if (button.disabled) return;
  if (isPublic) { if (name === 'fullscreen') await toggleFullscreen(); return; }
  if (button.closest('.menu') && name !== 'speed-preset') button.closest('.menu').open = false;
  if (!['sound','award','focus-award','answer','live-pause'].includes(name)) sound('click');
  if (['select','award','undo','plan','commit','handover','quiz','resolve','manual'].includes(name) && busy) return;
  try {
    switch (name) {
      case 'focus': boardFocused = !boardFocused; updateBoardFocus(); break;
      case 'speed-preset': changeZombieSpeed(button.dataset.speed); break;
      case 'live-side':
        if (!continuous() || settings.mode !== 'duel' || match?.phase !== 'live') return;
        if (match.initialStaging && settings.planning === 'secret') return notify('La primera compra secreta pasa al siguiente equipo al confirmar.');
        match = selectLiveSide(match,button.dataset.side);
        selection = null; selectedCell = null; render(); break;
      case 'initial-coin':
        if (!continuous() || match?.tacticalPhase !== 'briefing' || (settings.questionMode === 'bank' && humanSides().some(team => !answered[team]))) return;
        match = beginLiveInitialCoin(match); selection = null; render(); break;
      case 'tactical-confirm':
        if (!continuous() || match?.tacticalPhase !== 'shopping') return;
        match = confirmLiveTacticalTurn(match,button.dataset.side); selection = null; selectedCell = null; render(); break;
      case 'tactical-resume': {
        if (!continuous() || match?.tacticalPhase !== 'ready') return;
        const previousIds = new Set(match.tacticalPublicBaseline?.units.map(unit => unit.id));
        match = resumeLiveTacticalWave(match); livePrevious = 0;
        tacticalVisualKey = ''; presentation.clear(); render();
        const events = [{type:'wave-start'}, ...match.units.filter(unit => !previousIds.has(unit.id)).map(unit => ({type:'deployment',unitId:unit.id,typeId:unit.typeId,side:unit.side,row:unit.row,col:unit.col}))];
        updateLiveUI(events);
        if (soundEnabled) { sound('plantation'); music.play().catch(audioFailure); }
        if (!liveRAF) startLiveLoop();
        break;
      }
      case 'live-lock': {
        if (!continuous() || !match?.initialStaging || livePreparedSides[match.activeSide]) return;
        livePreparedSides[match.activeSide] = true;
        const next = humanSides().find(side => !livePreparedSides[side]);
        if (next) match = selectLiveSide(match,next);
        selection = null; selectedCell = null; render(); break;
      }
      case 'live-deploy':
        if (!continuous() || !match?.initialStaging || humanSides().some(side => !livePreparedSides[side])) return;
        match = pauseLive(match,false); livePrevious = 0;
        updateLiveUI(match.units.map(unit => ({type:'deployment',unitId:unit.id,typeId:unit.typeId,side:unit.side,row:unit.row,col:unit.col})));
        render();
        if (soundEnabled) { sound('plantation'); music.play().catch(audioFailure); }
        if (!liveRAF) startLiveLoop();
        break;
      case 'select': selection = button.dataset.id; selectedCell = null; render(); break;
      case 'focus-award':
      case 'award': {
        if (!controlsAllowed()) return;
        const side = button.dataset.side, amount = Number(button.dataset.amount);
        const received = Math.min(amount,1500-match.resources[side]);
        match = award(match,side,amount);
        if (match.initialStaging) liveInitialResources[side] = Math.min(1500,liveInitialResources[side]+amount);
        if (received) { animateReward(side,received,button,!match.initialStaging && !match.tacticalPhase); sound('points'); }
        else notify('Saldo máximo de 1,500. Puedes gastar recursos y seguir concediendo premios.');
        render(); break;
      }
      case 'undo': transition(state => removeOrder(state,state.activeSide,button.dataset.id)); break;
      case 'plan': transition(beginPlanning); resetClock('planning'); break;
      case 'commit': transition(commitPlan); resetClock(); break;
      case 'handover': transition(continuePlanning); resetClock('planning'); break;
      case 'resolve': await resolveBattle(); break;
      case 'bank': openBank(); break;
      case 'close-bank': if (!generating) $('#bank-dialog').close(); else notify('Espera a que termine la solicitud de IA.'); break;
      case 'approve': approveBank(); break;
      case 'import': if (!generating) showReview(normalizeQuestions($('#bank-json').value, questionSettings())); break;
      case 'generate': await generateBank(); break;
      case 'prompt': {
        const prompt = buildQuestionPrompt(questionSettings());
        try { await navigator.clipboard.writeText(prompt); notify('Instrucciones JSON copiadas. Pega el resultado aquí para revisarlo.'); }
        catch { $('#bank-json').value = prompt; notify('No se pudo copiar. Las instrucciones están en el campo de texto para seleccionarlas.'); }
        break;
      }
      case 'quiz': openQuiz(button.dataset.side); break;
      case 'answer': answerQuiz(Number(button.dataset.index)); break;
      case 'quiz-next': if (quiz?.done) { quiz = null; $('#quiz-dialog').close(); $('#live-question').hidden = true; publishQuiz(); render(); } break;
      case 'manual': settings.questionMode = 'manual'; render(); notify('Esta partida continúa con premios decididos por el profesor.'); break;
      case 'timer':
        if (clock.paused) { clock.end = Date.now() + clock.remaining; clock.paused = false; }
        else { clock.remaining = Math.max(0,clock.end-Date.now()); clock.paused = true; }
        updateClock(); break;
      case 'project':
        if (!channel) return notify('La pantalla pública necesita un navegador que admita BroadcastChannel.');
        const publicURL = new URL(location.href); publicURL.searchParams.set('display','public'); publicURL.searchParams.set('session',session);
        projection = window.open(publicURL.href,'pvz-aula-public','popup,width=1200,height=800');
        if (!projection) notify('Permite esta ventana para llevar la vista pública al monitor extendido.');
        else notify('Mueve la ventana pública al monitor extendido. No dupliques la pantalla privada durante compras secretas.');
        break;
      case 'fullscreen': await toggleFullscreen(); break;
      case 'live-pause':
        if (match?.phase !== 'live' || !continuous() || match.initialStaging || match.tacticalPhase) return;
        match = pauseLive(match,!match.paused);
        livePrevious = 0;
        if (match.paused) { music.pause(); iceSound.stop(); for (const audio of effects.values()) audio.pause(); }
        else if (soundEnabled) music.play().catch(audioFailure);
        updateLiveUI();
        if (!liveRAF) startLiveLoop();
        break;
      case 'sound':
        if (!soundEnabled) enableSound();
        else disableSound();
        break;
      case 'test-sound': enableSound(); sound('points'); break;
      case 'repertoire':
        if (platformMode && window.parent !== window) window.parent.postMessage({type:'pvz-quest-close'},location.origin);
        break;
      case 'finish': $('#exit-dialog').showModal(); break;
      case 'cancel-exit': $('#exit-dialog').close(); break;
      case 'confirm-exit': stopGame(); break;
    }
  } catch (error) { if ($('#bank-dialog').open) $('#bank-error').textContent = error.message; else notify(error.message); }
}

function renderPublic(snapshot, notice, draw = true) {
  publicView = snapshot;
  if (!snapshot) { presentation.clear(); tacticalVisualKey = ''; publicDebateClock = null; renderCountdown($('#timer'), null); $('#status').textContent = notice || 'Esperando al profesor…'; renderer.setView({units:[],mowers:[true,true,true,true,true]}); return; }
  document.body.dataset.phase = snapshot.phase; document.body.dataset.tempo = snapshot.config.tempo || 'rounds';
  $('#game').dataset.phase = snapshot.phase; $('#game').dataset.tempo = snapshot.config.tempo || 'rounds';
  $('#round-title').textContent = titleFor(snapshot);
  $('#plant-money').textContent = snapshot.resources.plants;
  $('#zombie-money').textContent = snapshot.resources.zombies;
  const secret = snapshot.config.planning === 'secret' && ['planning','handover','ready'].includes(snapshot.phase);
  $('#status').textContent = notice || (secret ? 'Compras privadas · se revelarán ambos planes juntos' : snapshot.phase === 'finished' ? snapshot.winner === 'draw' ? 'Resultado: empate' : `¡Ganan ${sideName(snapshot.winner)}!` : snapshot.phase === 'planning' ? `Compra ${sideName(snapshot.activeSide)}` : 'La clase prepara su siguiente jugada');
  $('#board-caption').textContent = secret ? 'Vista pública: no muestra compras ni gasto privado de ningún equipo.' : `Casa · Plantas · Entrada zombi${Number.isFinite(snapshot.zombieSpeed) ? ` · ${zombieSpeedDescription(snapshot)}` : ''}`;
  renderCountdown($('#timer'), countdownView(snapshot, publicDebateClock));
  if (snapshot.phase === 'finished') {
    $('#public-question').hidden = true;
    showResultBanner(snapshot);
  }
  if (draw) {
    if (snapshot.config.tempo === 'continuous') renderer.setLiveView(snapshot);
    else renderer.setView(snapshot, {plans: snapshot.plans});
  }
  requestBoardFit();
}

function renderPublicQuiz(view) {
  $('#public-question').hidden = !view;
  requestBoardFit();
  if (!view) return;
  $('#public-question-team').textContent = `Pregunta para ${sideName(view.side)}${view.seconds != null && !view.done ? ` · ${view.seconds} s` : ''}`;
  $('#public-question-prompt').textContent = view.prompt;
  $('#public-question-options').replaceChildren(...view.options.map(text => { const item = document.createElement('li'); item.textContent = text; return item; }));
  $('#public-question-result').textContent = view.done ? view.result : '';
}

if (isPublic) {
  document.body.classList.add('public-display'); $('#setup').hidden = true; $('#game').hidden = false;
  $('#timer-toggle').hidden = true;
  if (!channel) $('#status').textContent = 'No se pudo conectar esta vista pública. Abre la ventana desde la partida del profesor.';
  else {
    channel.onmessage = event => {
      if (event.data?.type === 'view') {
        renderPublic(event.data.snapshot,event.data.notice,!event.data.stage);
        if (event.data.liveEvents) renderer.showLiveEvents(event.data.liveEvents);
        if (event.data.liveEvents) animateSunRewards(event.data.liveEvents);
        if (event.data.snapshot?.config.tempo === 'continuous') handleLivePresentation(event.data.snapshot,event.data.liveEvents || []);
        if (event.data.stage) renderer.play([event.data.stage]).catch(() => notify('No se pudo mostrar una animación; el tablero sigue disponible.'));
      } else if (event.data?.type === 'countdown') {
        publicDebateClock = event.data.view;
        renderCountdown($('#timer'), countdownView(publicView, publicDebateClock));
      } else if (event.data?.type === 'quiz') renderPublicQuiz(event.data.view);
      else if (event.data?.type === 'reward' && ['plants','zombies'].includes(event.data.side) && Number.isFinite(event.data.amount) && event.data.amount > 0 && event.data.amount <= 100) animateReward(event.data.side,event.data.amount,$('#public-question').hidden ? $('#board') : $('#public-question'),false);
    };
    channel.postMessage({type:'ready'});
  }
} else {
  $('#settings').addEventListener('submit',startGame);
  $('#settings [name="audio"]').addEventListener('change',event => { if (!event.target.checked) disableSound(); });
  const updatePrivacy = () => {
    const cooperative = $('#settings [name="mode"]').value !== 'duel';
    const live = $('#settings [name="tempo"]').value === 'continuous';
    $('#live-notice').hidden = !live;
    $('#settings [name="planning"]').disabled = live && cooperative;
    $('#rounds-label').textContent = live ? 'Oleadas' : 'Rondas';
    $('#secret-notice').hidden = $('#settings [name="planning"]').value !== 'secret' || cooperative;
  };
  $('#settings').addEventListener('change',updatePrivacy);
  updatePrivacy();
  $('#quiz-dialog').addEventListener('cancel',event => { event.preventDefault(); notify('Responde la pregunta o espera al temporizador antes de continuar.'); });
  $('#bank-dialog').addEventListener('cancel',event => { if (generating) event.preventDefault(); });
  $('#question-type').addEventListener('change',() => { $('#option-count').disabled = $('#question-type').value === 'truefalse'; });
  if (channel) channel.onmessage = event => { if (event.data?.type === 'ready') { publish(match ? snapshot() : null); publishQuiz(); lastClockBroadcast = ''; updateClock(); } };
  fetch(statusAPI).then(response => response.json()).then(status => { $('#ai-status').textContent = status.configured ? `IA disponible (${status.model}). No se genera nada sin tu solicitud.` : 'IA no habilitada o sin configurar. Puedes importar JSON o copiar el prompt; no pegues claves en este campo.'; }).catch(() => { $('#ai-status').textContent = 'Puedes importar un banco JSON; no se pudo comprobar la IA.'; });
  if (platformMode) { $('#question-count').max = '12'; $('[data-local-only]').hidden = true; $('[data-platform-only]').hidden = false; $('.platform-description').textContent = 'Partida presencial del profesor, sin cuentas de alumnos ni calificaciones. Los puntos sólo pertenecen a esta partida.'; }
  setInterval(updateClock,500);
}

document.addEventListener('click',event => { const button = event.target.closest('button[data-action]'); if (button) action(button); });
document.addEventListener('toggle',event => { if (event.target.closest?.('#game')) requestBoardFit(); },true);
document.addEventListener('click',event => {
  const menu = $('.menu');
  if (menu?.open && !menu.contains(event.target)) menu.open = false;
});
$('#start').disabled = true;
$('#zombie-speed').addEventListener('input',event => {
  try { changeZombieSpeed(event.target.value); } catch (error) { notify(error.message); }
});
for (const [index,button] of [...document.querySelectorAll('[data-action="speed-preset"]')].entries()) {
  button.dataset.speed = LIVE_ZOMBIE_SPEED_PRESETS[index];
}
renderer.load().then(() => {
  rendererReady = true; $('#start').disabled = false;
  if (isPublic && publicView) renderPublic(publicView);
  requestBoardFit();
}).catch(() => { notify('Faltó un recurso gráfico. Recarga la página para reintentar antes de empezar.'); });

window.addEventListener('pagehide',() => { stopLiveLoop(); cancelAnimationFrame(boardFitRAF); boardObserver?.disconnect(); presentation.destroy(); renderer.destroy(); music.pause(); iceSound.destroy(); for (const audio of effects.values()) audio.pause(); channel?.close(); }, {once:true});
