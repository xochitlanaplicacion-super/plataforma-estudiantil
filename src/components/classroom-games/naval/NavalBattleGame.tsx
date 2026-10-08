'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Anchor, Check, Clock3, Crosshair, Dices, Eye, Loader2, LockKeyhole, Maximize, Minimize, Pause, Play, RotateCw, Shield, Sparkles, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import {
  activateNavalFlare, activateNavalRadar, advanceNavalTurn, answerNavalTurn, attackNaval, autoPlaceNavalFleet,
  availableNavalSpecials, canPlaceNavalShip, clearNavalRadar, confirmNavalFleet, continueNavalAnswer,
  createNavalBattle, grantNavalTeacherXP, MAP_SIZES, NAVAL_SHIP_INFO, NAVAL_SHIP_KINDS, NAVAL_SPECIAL_INFO, NAVAL_SUPPLY_XP, NAVAL_XP_MAX,
  placeNavalShip, previewShipCells, removeNavalShip, repairNavalShip, selectNavalTarget, skipNavalAttack, skipNavalQuestion, startNavalTurn,
  type NavalCell, type NavalConfig, type NavalShip, type NavalShipKind, type NavalSpecial, type NavalState,
} from '@/lib/activities/naval-battle';
import type { NavalQuestion, NavalQuestionMode } from '@/lib/activities/naval-questions';
import { FlyingCatViewport, useFlyingCatFullscreen } from '@/components/activities/flying-cat/FlyingCatViewport';
import { NavalBoard } from './NavalBoard';
import { NavalMapPanel } from './NavalMapPanel';
import { NavalUnitIcon } from './NavalArt';
import { useNavalQuestionPool } from './useNavalQuestionPool';
import { useNavalTimer } from './useNavalTimer';
import { useNavalAudio } from './useNavalAudio';
import { NavalDefenseChallenge } from './NavalDefenseChallenge';
import './naval-game.css';

const coordinate = (cell: NavalCell) => `${String.fromCharCode(65 + cell.col)}${cell.row + 1}`;
const specialNames = Object.keys(NAVAL_SPECIAL_INFO) as NavalSpecial[];
const initialConfig: NavalConfig = { mapSize: 'small', turnOrder: 'sequential', targetOrder: 'sequential', questionMode: 'none' };
const usesAIQuestions = (mode: NavalConfig['questionMode']): mode is NavalQuestionMode => mode !== 'none' && mode !== 'teacher';
type NavalCinematic = { special: 'repair' } | { cell: NavalCell; special: Exclude<NavalSpecial, 'repair'>; reducedNuclear?: boolean };

export default function NavalBattleGame({ onClose }: { onClose: () => void }) {
  const fullscreen = useFlyingCatFullscreen();
  const pool = useNavalQuestionPool();
  const audio = useNavalAudio();
  const [config, setConfig] = useState<NavalConfig>(initialConfig);
  const [names, setNames] = useState(['Equipo 1', 'Equipo 2']);
  const [theme, setTheme] = useState('');
  const [schoolLevel, setSchoolLevel] = useState('');
  const [optionCount, setOptionCount] = useState(4);
  const [questionSeconds, setQuestionSeconds] = useState(45);
  const [attackSeconds, setAttackSeconds] = useState(30);
  const [defenseEnabled, setDefenseEnabled] = useState(true);
  const [approved, setApproved] = useState(false);
  const [battle, setBattle] = useState<NavalState | null>(null);
  const stateRef = useRef<NavalState | null>(null);
  const [privateReady, setPrivateReady] = useState(false);
  const [shipKind, setShipKind] = useState<NavalShipKind>('nuclear');
  const [rotation, setRotation] = useState(0);
  const [draftAnchor, setDraftAnchor] = useState<NavalCell | null>(null);
  const [hover, setHover] = useState<NavalCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<NavalCell | null>(null);
  const [special, setSpecial] = useState<NavalSpecial | undefined>();
  const [question, setQuestion] = useState<NavalQuestion | null>(null);
  const questionRef = useRef<NavalQuestion | null>(null);
  const [answerIndex, setAnswerIndex] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [review, setReview] = useState(false);
  const [error, setError] = useState('');
  const [expiredPhase, setExpiredPhase] = useState<'question' | 'attack' | null>(null);
  const [cinematic, setCinematic] = useState<NavalCinematic | null>(null);
  const cinematicRef = useRef<typeof cinematic>(null);
  const [powerFlash, setPowerFlash] = useState('');
  const [rolling, setRolling] = useState(false);
  const rollingRef = useRef(false);
  const [rouletteName, setRouletteName] = useState('');
  const [defenseOffer, setDefenseOffer] = useState<NavalCell | null>(null);
  const defenseOfferRef = useRef<NavalCell | null>(null);
  const [defenseQuestion, setDefenseQuestion] = useState<{ question: NavalQuestion; cell: NavalCell } | null>(null);
  const defenseQuestionRef = useRef<typeof defenseQuestion>(null);
  const [defenseResult, setDefenseResult] = useState('');
  const [repairNotice, setRepairNotice] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const bindDialog = useCallback((node: HTMLDivElement | null) => {
    dialog.current = node;
    if (node) node.focus({ preventScroll: true });
  }, []);
  const blocked = paused || confirmClose || review || !!cinematic || rolling || !!defenseOffer || !!defenseQuestion;
  pausedRef.current = paused || confirmClose || review;
  const runningBattle = !!battle && battle.phase !== 'finished';

  // Ref + phase guards make double taps and a timer firing together one transaction.
  const transact = useCallback((operation: (state: NavalState) => NavalState, allowPaused = false) => {
    const current = stateRef.current;
    if (!current || (pausedRef.current && !allowPaused)) return null;
    try {
      const next = operation(current); stateRef.current = next; setBattle(next); setError(''); return next;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo realizar esta acción.'); return null; }
  }, []);
  const expire = useCallback(() => {
    // A queued clock tick must not consume the turn after an explicit action
    // has already begun its cinematic or defense, before React commits it.
    if (pausedRef.current || cinematicRef.current || defenseOfferRef.current || defenseQuestionRef.current || rollingRef.current) return false;
    const phase = stateRef.current?.phase;
    if (phase === 'question') { setAnswerIndex(-1); setExpiredPhase('question'); transact((current) => answerNavalTurn(current, false)); }
    if (phase === 'attack') { setExpiredPhase('attack'); transact(skipNavalAttack); }
  }, [transact]);
  const turnClock = useNavalTimer(`${battle?.turnNumber ?? 0}:${battle?.phase ?? 'setup'}`,
    battle?.phase === 'question' ? questionSeconds : attackSeconds,
    !blocked && (battle?.phase === 'attack' && !battle.radar || battle?.phase === 'question' && (!!question || battle.config.questionMode === 'teacher')), expire);
  const radarClock = useNavalTimer(`${battle?.turnNumber ?? 0}:radar:${battle?.radar ? 'active' : 'off'}`, battle?.radar?.durationSeconds ?? 3,
    !!battle?.radar && !paused && !confirmClose && !review, () => transact(clearNavalRadar));
  function resolveShot(cell: NavalCell, chosen?: Exclude<NavalSpecial, 'repair'>, reducedNuclear = false) {
    const next = chosen === 'radar' ? transact((current) => activateNavalRadar(current, cell))
      : chosen === 'flare' ? transact((current) => activateNavalFlare(current, cell))
      : transact((current) => attackNaval(current, cell, chosen, undefined, { reducedNuclear }));
    if (next) { setSpecial(undefined); setSelectedCell(null); if (chosen !== 'radar' && chosen !== 'flare') audio.play(next.lastAttack?.cells.some((shot) => shot.hit) ? 'hit' : 'miss'); }
  }
  function resolveRepair() {
    if (transact(repairNavalShip)) {
      setSpecial(undefined); setSelectedCell(null);
      setRepairNotice('Una nave con un solo impacto fue reparada y reubicada en secreto. Su impacto anterior queda en blanco como disparo registrado; su nueva ubicación no se revela. El disparo normal sigue disponible.');
    }
  }
  useNavalTimer(`${battle?.turnNumber ?? 0}:${cinematic ? 'cinematic' : 'idle'}`, 1,
    !!cinematic && !paused && !confirmClose && !review, () => {
      const pending = cinematicRef.current; cinematicRef.current = null; setCinematic(null);
      if (pending?.special === 'repair') resolveRepair();
      else if (pending) resolveShot(pending.cell, pending.special, pending.reducedNuclear);
    });
  useNavalTimer(`${battle?.turnNumber ?? 0}:${rolling ? 'roulette' : 'idle'}`, 1,
    rolling && !paused && !confirmClose && !review, () => { rollingRef.current = false; setRolling(false); finishStartTurn(); });
  useEffect(() => {
    if (!rolling || paused || confirmClose || review) return;
    let index = 0;
    const teams = battle?.players.filter((player) => !player.eliminated) ?? [];
    const interval = setInterval(() => { setRouletteName(teams[index++ % teams.length]?.name ?? ''); }, 85);
    return () => clearInterval(interval);
  }, [rolling, paused, confirmClose, review, battle]);
  const previousXP = useRef(new Map<string, number>());
  useEffect(() => {
    for (const player of battle?.players ?? []) {
      if (player.xp === NAVAL_XP_MAX && (previousXP.current.get(player.id) ?? 0) < NAVAL_XP_MAX) {
        setPowerFlash(player.name);
      }
      previousXP.current.set(player.id, player.xp);
    }
  }, [battle]);
  useEffect(() => {
    if (!powerFlash) return;
    const timer = setTimeout(() => setPowerFlash(''), 1400); return () => clearTimeout(timer);
  }, [powerFlash]);
  useEffect(() => { if (paused || confirmClose || review) audio.stop(); }, [paused, confirmClose, review, audio.stop]);
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (blocked) Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('.naval-overlay button:not(:disabled)') ?? []).find((button) => !button.closest('[inert]'))?.focus();
    return () => { if (active?.isConnected) active.focus({ preventScroll: true }); };
  }, [blocked, confirmClose, review, paused, defenseQuestion?.question.id, !!defenseOffer]);

  useEffect(() => {
    if (battle?.phase !== 'attack') { setSelectedCell(null); setSpecial(undefined); }
    setHover(null);
  }, [battle?.phase, battle?.turnNumber]);
  useEffect(() => {
    // Never loop automatically after an error. The teacher explicitly retries.
    if (battle && battle.phase !== 'finished' && usesAIQuestions(battle.config.questionMode) && !paused && !review
      && pool.items.length <= 3 && !pool.loading && !pool.error) void pool.replenish();
  }, [battle, paused, review, pool.items.length, pool.loading, pool.error, pool.replenish]);
  // Touch panning and browser chrome/fullscreen transitions can emit blur or
  // visibility events on tablets. Only explicit game controls pause or close
  // this shared-screen activity; native gestures must never open our overlays.
  useEffect(() => {
    if (!runningBattle) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [runningBattle]);

  function invalidateBank() { setApproved(false); pool.reset(); }
  function changeConfig(next: Partial<NavalConfig>) { setConfig((current) => ({ ...current, ...next })); if (next.questionMode) invalidateBank(); }
  function prepareQuestions() {
    if (!theme.trim() || !schoolLevel.trim()) return setError('Indica el tema y el grado o nivel escolar antes de generar el banco.');
    const mode = config.questionMode;
    if (!usesAIQuestions(mode)) return;
    setApproved(false); setError('');
    void pool.prepare({ prompt: `Nivel escolar y dificultad: ${schoolLevel.trim()}\nTema e instrucciones del profesor: ${theme.trim()}\nAdapta todos los enunciados al nivel indicado, sin elevar la dificultad entre lotes.`, mode, optionCount });
  }
  function begin() {
    if (stateRef.current) return;
    if (usesAIQuestions(config.questionMode) && (!approved || !pool.items.length || pool.loading)) return setError('Revisa y aprueba un banco de preguntas antes de comenzar.');
    try {
      const next = createNavalBattle(config, names);
      void fullscreen.requestFullscreen();
      stateRef.current = next; setBattle(next); setPrivateReady(false); setDraftAnchor(null); setShipKind('nuclear'); setRotation(0); setHover(null); setError(''); setPaused(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Revisa la configuración.'); }
  }
  function startTurn() {
    if (stateRef.current?.phase !== 'handoff' || pausedRef.current || rollingRef.current) return;
    if (usesAIQuestions(stateRef.current.config.questionMode) && !pool.items.length) return setError('Se está preparando el siguiente banco. Espera o pulsa Reintentar; no repetiremos preguntas anteriores.');
    if (stateRef.current.config.turnOrder === 'random') { rollingRef.current = true; setRolling(true); setRouletteName('Preparando sorteo…'); return; }
    finishStartTurn();
  }
  function finishStartTurn() {
    const next = transact(startNavalTurn);
    if (!next) return;
    const nextQuestion = next.phase === 'question' && usesAIQuestions(next.config.questionMode) ? pool.take() : null;
    questionRef.current = nextQuestion; setQuestion(nextQuestion); setAnswerIndex(null); setExpiredPhase(null);
    setSelectedCell(null); setSpecial(undefined); setDefenseResult(''); setRepairNotice('');
  }
  function answer(index: number) {
    if (stateRef.current?.phase !== 'question' || !questionRef.current || pausedRef.current) return;
    if (transact((current) => answerNavalTurn(current, index === questionRef.current!.correctIndex))) setAnswerIndex(index);
  }
  function teacherAnswer(correct: boolean) {
    if (stateRef.current?.phase !== 'question' || stateRef.current.config.questionMode !== 'teacher' || pausedRef.current) return;
    transact((current) => answerNavalTurn(current, correct));
  }
  function skipQuestion() {
    if (stateRef.current?.phase !== 'question' || pausedRef.current) return;
    if (transact(skipNavalQuestion)) {
      questionRef.current = null; setQuestion(null); setAnswerIndex(null); setExpiredPhase(null);
    }
  }
  function grantTeacherBonus(amount: 10 | 30 | 50) {
    const current = stateRef.current;
    if (!current || current.phase !== 'answer_result' || !current.answerCorrect || current.teacherBonusXP !== null || pausedRef.current) return;
    const active = current.players.find((player) => player.id === current.actorId);
    if (!active || active.xp >= NAVAL_XP_MAX) return;
    transact((state) => grantNavalTeacherXP(state, amount));
  }
  function chooseShip(kind: NavalShipKind) {
    const current = stateRef.current;
    const placed = current?.players[current.placementIndex]?.ships.find((ship) => ship.kind === kind);
    setShipKind(kind); setRotation(placed?.rotation ?? 0); setDraftAnchor(placed?.anchor ?? null); setHover(null); setError('');
  }
  function confirmPlacement() {
    const current = stateRef.current;
    if (!current || current.phase !== 'placement' || !privateReady || !draftAnchor || pausedRef.current) return;
    const player = current.players[current.placementIndex];
    const placed = player.ships.find((ship) => ship.kind === shipKind);
    // A repeated confirmation cannot replace the just-confirmed unit twice.
    if (placed && placed.rotation === rotation && placed.anchor.row === draftAnchor.row && placed.anchor.col === draftAnchor.col) return;
    if (transact((state) => placeNavalShip(state, player.id, shipKind, draftAnchor, rotation))) chooseShip(shipKind);
  }
  function autoPlaceFleet() {
    const current = stateRef.current;
    if (!current || current.phase !== 'placement') return;
    if (transact((state) => autoPlaceNavalFleet(state, current.players[current.placementIndex].id))) chooseShip(shipKind);
  }
  function removeSelectedShip() {
    const current = stateRef.current;
    if (!current || current.phase !== 'placement') return;
    if (transact((state) => removeNavalShip(state, current.players[current.placementIndex].id, shipKind))) chooseShip(shipKind);
  }
  function rotateShip() {
    const values = NAVAL_SHIP_INFO[shipKind].rotations;
    setRotation(values[(values.indexOf(rotation) + 1) % values.length]);
  }
  function close() { pool.reset(); void fullscreen.exitFullscreen(); onClose(); }
  function fire() {
    const current = stateRef.current;
    if (!selectedCell || !current || current.phase !== 'attack' || cinematicRef.current || defenseOfferRef.current || defenseQuestionRef.current || pausedRef.current) return;
    if (special === 'repair') return setError('Activa Reparar y reubicar en secreto: no necesitas elegir coordenadas.');
    const victim = current.players.find((player) => player.id === current.targetId);
    if (special !== 'radar' && special !== 'flare' && victim?.shots.some((shot) => shot.row === selectedCell.row && shot.col === selectedCell.col)) return setError('Esa coordenada ya recibió un disparo. Elige otra.');
    if (special === 'nuclear' && defenseEnabled && usesAIQuestions(current.config.questionMode)) {
      defenseOfferRef.current = selectedCell; setDefenseOffer(selectedCell); audio.play('alarm'); return;
    }
    if (special) {
      const cut = { cell: selectedCell, special }; cinematicRef.current = cut; setCinematic(cut); audio.play('alarm');
    } else resolveShot(selectedCell);
  }
  function launchNuclear(cell: NavalCell, reducedNuclear: boolean) {
    const cut = { cell, special: 'nuclear' as const, reducedNuclear }; cinematicRef.current = cut; setCinematic(cut); audio.play('alarm');
  }
  function chooseRepair() {
    if (cinematicRef.current || pausedRef.current || stateRef.current?.phase !== 'attack') return;
    if (!availableNavalSpecials(stateRef.current).includes('repair')) return;
    const cut = { special: 'repair' as const }; cinematicRef.current = cut; setCinematic(cut); audio.play('alarm');
  }
  function beginDefense() {
    const cell = defenseOfferRef.current;
    if (!cell || pausedRef.current) return;
    const nextQuestion = pool.take();
    if (!nextQuestion) return setError('Todavía no hay otra pregunta en reserva. Espera la reposición o continúa sin reto defensor.');
    defenseOfferRef.current = null; setDefenseOffer(null);
    const challenge = { question: nextQuestion, cell }; defenseQuestionRef.current = challenge; setDefenseQuestion(challenge);
  }
  function bypassDefense() {
    const cell = defenseOfferRef.current; if (!cell || pausedRef.current) return;
    defenseOfferRef.current = null; setDefenseOffer(null); launchNuclear(cell, false);
  }
  function resolveDefense(correct: boolean) {
    const challenge = defenseQuestionRef.current; if (!challenge || pausedRef.current) return;
    defenseQuestionRef.current = null; setDefenseQuestion(null);
    setDefenseResult(correct ? 'Humo táctico: el defensor acertó y redujo la bomba a una cruz de cinco casillas.' : 'El reto defensor no se superó. La bomba conserva su área de nueve casillas.');
    launchNuclear(challenge.cell, correct);
  }
  const actor = battle?.players.find((player) => player.id === battle.actorId);
  const target = battle?.players.find((player) => player.id === battle.targetId);
  const placer = battle?.players[battle.placementIndex];
  // Legal relocation checks depend on fleet state, not each 100ms clock tick.
  const specials = useMemo(() => battle ? availableNavalSpecials(battle) : [], [battle]);
  const candidateAnchor = draftAnchor ?? hover;
  const preview = battle?.phase === 'placement' && candidateAnchor ? previewShipCells(shipKind, candidateAnchor, rotation) : [];
  const previewValid = battle?.phase === 'placement' && !!placer && !!candidateAnchor && canPlaceNavalShip(battle, placer.id, shipKind, candidateAnchor, rotation);
  const placedSelection = placer?.ships.find((ship) => ship.kind === shipKind);
  const pendingPlacement = !!draftAnchor && (!placedSelection || placedSelection.rotation !== rotation
    || placedSelection.anchor.row !== draftAnchor.row || placedSelection.anchor.col !== draftAnchor.col);
  const draftShip: NavalShip | null = candidateAnchor && preview.length ? {
    id: placedSelection?.id ?? 'placement-preview', kind: shipKind, anchor: candidateAnchor, rotation, cells: preview, hits: [], sunk: false,
  } : null;
  // Replace the selected illustration with its live preview, never the saved
  // engine unit. Only Confirmar posición commits coordinates/orientation.
  const placementShips = draftShip ? [...(placer?.ships.filter((ship) => ship.kind !== shipKind) ?? []), draftShip] : placer?.ships ?? [];
  const shotCount = battle?.lastAttack?.cells.filter((shot) => shot.hit).length ?? 0;
  const showClock = battle?.phase === 'question' || battle?.phase === 'attack';
  const questionModeLabel = config.questionMode === 'none' ? 'Sin preguntas' : config.questionMode === 'teacher' ? 'Preguntas orales del profesor · sin IA' : 'Preguntas con IA';
  const playLayout = battle?.phase === 'attack' || battle?.phase === 'attack_result' || battle?.phase === 'placement' && privateReady;

  return <FlyingCatViewport ref={fullscreen.viewportRef}><div ref={bindDialog} tabIndex={-1} className={`naval-game ${powerFlash ? 'naval-game--super' : ''} ${paused || confirmClose || review ? 'naval-game--paused' : ''}`} role="dialog" aria-modal="true" aria-label="Batalla Naval en clase" onKeyDown={(event) => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]') ?? []).filter((element) => !element.closest('[inert]') && element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    {powerFlash && <div className="naval-power-flash" role="status">¡SÚPER LISTO! · {powerFlash}</div>}
    <header className="naval-hud" inert={blocked}>
      <div className="naval-brand"><Anchor aria-hidden="true"/><div><strong>BATALLA NAVAL</strong><span>{battle ? `Ronda ${battle.turnNumber || 1} · ${battle.size} × ${battle.size}` : 'Un aula · una pantalla · toda la tripulación'}</span></div></div>
      <div className="naval-hud-actions">
        {showClock && <div className={`naval-clock ${turnClock <= 10 ? 'naval-clock--urgent' : ''}`} role="timer" aria-label={`Tiempo para ${battle?.phase === 'question' ? 'responder' : 'disparar'}`}><Clock3 size={18}/><strong>{turnClock}s</strong><span>{battle?.phase === 'question' ? 'Debate' : 'Disparo'}</span></div>}
        <button className="naval-icon-button" onClick={() => void (fullscreen.isFullscreen ? fullscreen.exitFullscreen() : fullscreen.requestFullscreen())} aria-label={fullscreen.isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} title={fullscreen.isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}>{fullscreen.isFullscreen ? <Minimize size={19}/> : <Maximize size={19}/>}</button>
        <button className="naval-icon-button" onClick={audio.toggle} aria-label={audio.enabled ? 'Silenciar sonido' : 'Activar sonido'} title={audio.enabled ? 'Silenciar sonido' : 'Activar sonido'}>{audio.enabled ? <Volume2 size={19}/> : <VolumeX size={19}/>}</button>
        {battle && <button className="naval-button naval-button--quiet" onClick={() => setPaused((current) => !current)}><Pause size={17}/> Pausa</button>}
        <button className="naval-icon-button" onClick={() => runningBattle ? setConfirmClose(true) : close()} aria-label="Cerrar Batalla Naval" title="Cerrar juego"><X size={20}/></button>
      </div>
    </header>
    {fullscreen.message && <div className="naval-notice" inert={blocked}><span>{fullscreen.message}</span><button onClick={fullscreen.clearMessage} aria-label="Ocultar aviso de pantalla completa">×</button></div>}
    <div className={`naval-content ${playLayout ? 'naval-content--play' : ''}`} inert={blocked}>
      {error && <p role="alert" className="naval-error">{error}</p>}
      {!battle ? <>
        <section className="naval-intro"><span className="naval-eyebrow">REPERTORIO DE JUEGOS · LOCAL, SIN CALIFICACIÓN</span><h1>Prepara tu batalla.</h1><p>Organiza de 2 a 10 equipos o participantes. La clase debate y el profesor registra las decisiones desde este dispositivo. No se necesita una sala ni cuentas de alumnos.</p></section>
        <div className="naval-setup-grid">
          <section className="naval-panel"><h2><Shield size={22}/> Tripulaciones</h2><label>Participantes o equipos<select aria-label="Número de equipos" value={names.length} onChange={(event) => { const count = Number(event.target.value); setNames((current) => Array.from({ length: count }, (_, index) => current[index] ?? `Equipo ${index + 1}`)); }}>{Array.from({ length: 9 }, (_, index) => <option key={index} value={index + 2}>{index + 2}</option>)}</select></label><div className="naval-name-grid">{names.map((name, index) => <label key={index}>Equipo {index + 1}<input aria-label={`Nombre del equipo ${index + 1}`} value={name} maxLength={60} onChange={(event) => setNames((current) => current.map((item, position) => position === index ? event.target.value : item))}/></label>)}</div></section>
          <section className="naval-panel"><h2><Dices size={22}/> Reglas y tiempos</h2><div className="naval-field-grid">
            <label>Mapa<select aria-label="Mapa" value={config.mapSize} onChange={(event) => changeConfig({ mapSize: event.target.value as NavalConfig['mapSize'] })}>{Object.entries(MAP_SIZES).map(([key, size]) => <option key={key} value={key}>{key === 'small' ? 'Pequeño' : key === 'medium' ? 'Mediano' : 'Grande'} · {size} × {size}</option>)}</select></label>
            <label>Orden de turnos<select value={config.turnOrder} onChange={(event) => changeConfig({ turnOrder: event.target.value as NavalConfig['turnOrder'] })}><option value="sequential">Secuencial</option><option value="random">Ruleta aleatoria (puede repetirse)</option></select></label>
            <label>Contrincante<select value={config.targetOrder} onChange={(event) => changeConfig({ targetOrder: event.target.value as NavalConfig['targetOrder'] })}><option value="sequential">Siguiente equipo con vida</option><option value="random">Rival aleatorio independiente</option><option value="choice">Todos contra todos: elegir rival</option></select></label>
            <label>Modalidad<select aria-label="Modalidad de preguntas" value={config.questionMode} onChange={(event) => changeConfig({ questionMode: event.target.value as NavalConfig['questionMode'] })}><option value="none">Sin preguntas ni IA</option><option value="teacher">Preguntas orales del profesor · sin IA</option><option value="multiple_choice">Opción múltiple con IA</option><option value="true_false">Verdadero / falso con IA</option><option value="mixed">Ambas modalidades con IA</option></select></label>
            <label>Tiempo para responder<select value={questionSeconds} disabled={config.questionMode === 'none'} onChange={(event) => setQuestionSeconds(Number(event.target.value))}><option value={30}>30 segundos</option><option value={45}>45 segundos</option></select></label>
            <label>Tiempo para disparar<select value={attackSeconds} onChange={(event) => setAttackSeconds(Number(event.target.value))}><option value={30}>30 segundos</option><option value={45}>45 segundos</option></select></label>
          </div><label className="naval-checkbox"><input type="checkbox" checked={defenseEnabled} disabled={!usesAIQuestions(config.questionMode)} onChange={(event) => setDefenseEnabled(event.target.checked)}/> Permitir reto defensor de 10 segundos antes de una Bomba nuclear (sólo con preguntas de IA).</label><p className="naval-help">Los dos sorteos son independientes (Fisher–Yates). Un turno aleatorio puede tocar otra vez al mismo equipo. Si se agota el reloj, pasa el turno; Pausa permite extender el debate.</p></section>
        </div>
        {usesAIQuestions(config.questionMode) && <section className="naval-panel"><h2><Sparkles size={22}/> Banco de preguntas previo</h2><div className="naval-field-grid"><label>Grado, nivel y dificultad<input value={schoolLevel} placeholder="Ej. segundo de secundaria, dificultad básica" maxLength={300} onChange={(event) => { setSchoolLevel(event.target.value); invalidateBank(); }}/></label>{config.questionMode !== 'true_false' && <label>Opciones por pregunta<select value={optionCount} onChange={(event) => { setOptionCount(Number(event.target.value)); invalidateBank(); }}>{[2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} opciones</option>)}</select></label>}</div><label>Tema e instrucciones<textarea value={theme} rows={3} maxLength={11000} placeholder="Indica el contenido que repasará la clase y los idiomas que deseas utilizar." onChange={(event) => { setTheme(event.target.value); invalidateBank(); }}/></label><div className="naval-toolbar"><button className="naval-button" disabled={pool.loading || !theme.trim() || !schoolLevel.trim()} onClick={prepareQuestions}>{pool.loading ? <Loader2 className="animate-spin" size={18}/> : <Sparkles size={18}/>} {pool.loading ? 'Preparando banco…' : 'Generar banco para revisar'}</button><span>{pool.items.length} preguntas en reserva</span></div>
          {pool.error && <p role="alert" className="naval-error">{pool.error}</p>}
          {!!pool.items.length && <><QuestionReview items={pool.items} onDiscard={(id) => { pool.discard(id); setApproved(false); }}/><label className="naval-checkbox"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)}/> Revisé el banco y apruebo este tema, nivel y respuestas.</label></>}
          <p className="naval-help">La IA requiere conexión y consume el saldo habitual de la escuela. Preparamos 10 preguntas por lote; durante la partida se reponen en segundo plano con el mismo tema y nivel. No se reciclan preguntas anteriores. Puedes pausar para revisar o descartar las siguientes.</p>
        </section>}
        <section className="naval-panel naval-rules"><h2>Cómo jugar</h2><ol><li>Oculta la proyección mientras cada equipo acomoda sus seis naves y sus tropas. Al guardar, la pantalla de relevo oculta la flota.</li><li>Con preguntas de IA: responder bien habilita un disparo y suma 25 XP (50 XP en Fiebre). Con preguntas orales: el profesor marca el acierto y puede elegir un premio de +10, +30 o +50 XP. Responder mal, saltar o quedarse sin tiempo pierde el disparo, sin quitar la XP de suministros. Sin preguntas: acertar a una unidad suma 25 XP.</li><li>Selecciona una coordenada y confirma el disparo. Rojo significa impacto activo; blanco, agua o un impacto reparado tras el traslado. Las naves hundidas dejan restos con fuego. Gana la última flota con unidades en pie.</li><li>La base de suministros intacta aporta {NAVAL_SUPPLY_XP} XP al inicio de cada turno propio. Big Boy y Bengala costera cuestan 35 XP; Night of Fire y Fat Boy, 70 XP; Nuclear, Radar y Reparación, 100 XP. Puedes usar un solo bonus por turno y su nave debe estar intacta. Se descuenta su costo; los poderes máximos vacían la barra.</li></ol><div className="naval-rules-bonuses">{specialNames.map((name) => <div key={name}><strong>{NAVAL_SPECIAL_INFO[name].name}</strong><p>{NAVAL_SPECIAL_INFO[name].description}</p><small>Costo: {NAVAL_SPECIAL_INFO[name].cost} XP · Requiere: {NAVAL_SHIP_INFO[NAVAL_SPECIAL_INFO[name].requiredShip].name} intacto.</small></div>)}</div><p className="naval-help">Todas las unidades se pueden rotar para coincidir con la cuadrícula; las tropas de una casilla sólo van en islas. Una casilla dañada sella el poder de esa unidad. Una vez por partida, el Buque Hospital repara y reubica en secreto una nave al azar con exactamente una casilla dañada. Sin una candidata y un destino válido, se bloquea. La barra tiene un tope de 100 XP: el exceso no se guarda y sólo se elige un premio docente por acierto. Las tropas protegen su isla y lanzan bengalas. Tres respuestas correctas de IA consecutivas activan Fiebre: 50 XP por acierto hasta fallar. Cerca del borde, los ataques sólo afectan coordenadas dentro del mapa.</p></section>
        <div className="naval-start"><p>{questionModeLabel} · La partida se borra al cerrar o recargar.</p><button className="naval-button naval-button--primary" disabled={usesAIQuestions(config.questionMode) && (pool.loading || !approved || !pool.items.length)} onClick={begin}><Play size={20}/> Comenzar colocación de flotas</button></div>
      </> : <>
        {battle.phase === 'placement' && placer && (!privateReady ? <section className="naval-curtain naval-panel"><Eye size={54}/><span className="naval-eyebrow">COLOCACIÓN PRIVADA · {battle.placementIndex + 1} DE {battle.players.length}</span><h1>Entrega el dispositivo a {placer.name}</h1><p>Apaga u oculta la proyección antes de continuar. Nadie más debe ver las posiciones. Esta pantalla no contiene la flota del equipo anterior.</p><button className="naval-button naval-button--primary" onClick={() => setPrivateReady(true)}>Estoy listo para colocar mi flota</button></section> : <div className="naval-play-layout">
          <aside className="naval-panel naval-command" aria-label="Controles de la flota y poderes" tabIndex={0}><span className="naval-eyebrow">COLOCACIÓN PRIVADA</span><h2>{placer.name}</h2><p>Elige una unidad y toca la coordenada de inicio. Gira su imagen en la vista previa y pulsa Confirmar posición para guardarla.</p><div className="naval-fleet-picker">{NAVAL_SHIP_KINDS.map((kind) => <button key={kind} className={shipKind === kind ? 'selected' : ''} onClick={() => chooseShip(kind)}><NavalUnitIcon kind={kind}/><span>{NAVAL_SHIP_INFO[kind].name}<small>{NAVAL_SHIP_INFO[kind].cells} casillas · {kind === 'troops' ? 'isla' : 'mar'}</small></span>{placer.ships.some((ship) => ship.kind === kind) && <Check size={18}/>}</button>)}</div><div className="naval-toolbar"><button className="naval-button" disabled={shipKind === 'troops'} onClick={rotateShip}><RotateCw size={18}/> Girar · {rotation}°</button><button className="naval-button naval-button--quiet" disabled={!placer.ships.some((ship) => ship.kind === shipKind)} onClick={removeSelectedShip}>Quitar unidad</button></div>{draftAnchor && <p className="naval-help" role="status">{pendingPlacement ? previewValid ? 'Vista previa pendiente de confirmar.' : 'Posición no válida: revisa los límites, el terreno y otras unidades.' : 'Posición guardada.'}</p>}{pendingPlacement && <button className="naval-button naval-button--quiet" onClick={() => chooseShip(shipKind)}>Cancelar cambio</button>}<button className="naval-button" onClick={autoPlaceFleet}><Dices size={18}/> Acomodar flota automáticamente</button><button className="naval-button naval-button--primary" disabled={placer.ships.length !== NAVAL_SHIP_KINDS.length || pendingPlacement} onClick={() => { if (transact((current) => confirmNavalFleet(current, placer.id))) { setPrivateReady(false); chooseShip('nuclear'); } }}><Shield size={18}/> Guardar flota y ocultar</button></aside>
          <NavalMapPanel><NavalBoard size={battle.size} islands={battle.islands} ships={placementShips} showFleet onSelect={(cell) => { setDraftAnchor(cell); setHover(null); setError(''); }} onHover={setHover} previewCells={preview} previewValid={previewValid} paused={blocked} playerName={placer.name}/></NavalMapPanel>
        </div>)}
        {battle.phase !== 'placement' && <div className="naval-team-strip" aria-label="Estado de los equipos">{battle.players.map((player) => <div key={player.id} className={`${player.id === actor?.id ? 'active' : ''} ${player.eliminated ? 'eliminated' : ''}`} style={{ borderColor: player.color }}><strong>{player.name}</strong><span>{player.eliminated ? 'Flota eliminada' : `${player.ships.filter((ship) => !ship.sunk).length} unidades · ${player.xp} XP`}</span></div>)}</div>}
        {battle.phase === 'handoff' && <section className="naval-curtain naval-panel"><Dices size={54}/><span className="naval-eyebrow">{battle.turnNumber ? 'SIGUIENTE TURNO' : 'TODAS LAS FLOTAS ESTÁN LISTAS'}</span><h1>{battle.config.turnOrder === 'random' ? 'Gira la ruleta de equipos' : 'Continúa la batalla'}</h1><p>{battle.config.turnOrder === 'random' ? 'Cada tirada sortea de nuevo a todos los equipos con vida. Puede repetirse el anterior.' : 'Los equipos con unidades en pie participan en orden.'}</p>{usesAIQuestions(battle.config.questionMode) && <PoolStatus loading={pool.loading} error={pool.error} count={pool.items.length} retry={() => void pool.replenish()}/>}<button className="naval-button naval-button--primary" disabled={usesAIQuestions(battle.config.questionMode) && !pool.items.length} onClick={startTurn}><Dices size={20}/>{battle.config.turnOrder === 'random' ? 'Sortear equipo y comenzar turno' : 'Comenzar siguiente turno'}</button></section>}
        {battle.phase === 'question' && (question || battle.config.questionMode === 'teacher') && <section className="naval-panel naval-question">
          <span className="naval-eyebrow">TURNO DE {actor?.name} · {battle.config.questionMode === 'teacher' ? 'PREGUNTA ORAL DEL PROFESOR' : question?.type === 'true_false' ? 'VERDADERO / FALSO' : 'OPCIÓN MÚLTIPLE'}</span>
          <h1>{question?.prompt ?? 'El profesor plantea la pregunta al equipo.'}</h1>
          <p>Debatan en equipo. {battle.config.questionMode === 'teacher' ? 'El profesor registra si la respuesta fue correcta antes de que termine el reloj. No se utiliza IA.' : 'El profesor toca la respuesta acordada antes de que termine el reloj.'}</p>
          {question ? <div className="naval-answer-grid">{question.options.map((option, index) => <button key={index} className="naval-answer" onClick={() => answer(index)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div>
            : <div className="naval-toolbar"><button className="naval-button naval-button--primary" onClick={() => teacherAnswer(true)}><Check size={18}/> Respuesta correcta</button><button className="naval-button" onClick={() => teacherAnswer(false)}><X size={18}/> Respuesta incorrecta</button></div>}
          <div className="naval-toolbar"><button className="naval-button naval-button--quiet" onClick={skipQuestion}>Saltar pregunta y pasar al siguiente equipo</button></div>
          <p className="naval-help">Saltar detiene el reloj, pierde el disparo y no otorga XP de respuesta ni premio docente. La experiencia normal de suministros se conserva.</p>
        </section>}
        {battle.phase === 'answer_result' && (question || battle.config.questionMode === 'teacher') && <section className="naval-panel naval-feedback">
          <span className="naval-eyebrow">{expiredPhase === 'question' ? 'SE AGOTÓ EL TIEMPO' : battle.answerCorrect ? battle.config.questionMode === 'teacher' ? 'RESPUESTA CORRECTA · PREMIO A ELECCIÓN DEL PROFESOR' : actor && actor.correctStreak >= 3 ? 'FIEBRE · RESPUESTA CORRECTA · +50 XP' : 'RESPUESTA CORRECTA · +25 XP' : 'RESPUESTA INCORRECTA'}</span>
          <h1>{battle.answerCorrect ? '¡Preparen el disparo!' : 'Aprendamos antes del siguiente turno.'}</h1>
          {question && <>{answerIndex !== null && answerIndex >= 0 && <p>Respuesta elegida: <strong>{question.options[answerIndex]}</strong></p>}<p>Respuesta correcta: <strong>{question.options[question.correctIndex]}</strong></p><blockquote>{question.explanation}</blockquote></>}
          {battle.answerCorrect ? <NavalTeacherReward xp={actor?.xp ?? 0} chosen={battle.teacherBonusXP} onAward={grantTeacherBonus}/>
            : <p className="naval-help">Sin premio de respuesta ni XP extra del profesor. La experiencia normal de suministros se mantiene.</p>}
          <button className="naval-button naval-button--primary" onClick={() => transact(continueNavalAnswer)}>{battle.answerCorrect ? 'Elegir coordenada de disparo' : 'Pasar al siguiente equipo'}</button>
        </section>}
        {(battle.phase === 'attack' || battle.phase === 'attack_result') && <div className="naval-play-layout"><aside className="naval-panel naval-command" aria-label="Controles de la flota y poderes" tabIndex={0}><span className="naval-eyebrow">TURNO DE</span><h2>{actor?.name}</h2><div className={`naval-xp ${actor?.xp === NAVAL_XP_MAX ? 'naval-xp--full' : ''}`}><div><span>Barra de poder</span><strong>{actor?.xp ?? 0}/100 XP</strong></div><div className="naval-xp-meter"><progress value={actor?.xp ?? 0} max={100} aria-label="Barra de poder"/><i/><i/></div><div className="naval-xp-levels"><span>35 · Nivel 1</span><span>70 · Nivel 2</span><span>100 · Súper</span></div></div>
          {actor && usesAIQuestions(battle.config.questionMode) && actor.correctStreak >= 3 && <p className="naval-fever">🔥 Fiebre / Overdrive · {actor.correctStreak} aciertos seguidos · XP doble por respuesta correcta.</p>}<div className="naval-own-status">{actor?.ships.map((ship) => <span key={ship.id} title={`${NAVAL_SHIP_INFO[ship.kind].name}: ${ship.sunk ? 'hundido' : ship.hits.length ? 'dañado, bonus desactivado' : 'intacto'}`} className={ship.hits.length ? 'damaged' : ''}><NavalUnitIcon kind={ship.kind} sunk={ship.sunk}/></span>)}</div>
          {battle.config.targetOrder === 'choice' && battle.phase === 'attack' ? <label>Contrincante<select aria-label="Contrincante a atacar" value={battle.targetId ?? ''} disabled={battle.bonusUsedThisTurn && !!battle.targetId} onChange={(event) => { if (event.target.value) { transact((current) => selectNavalTarget(current, event.target.value)); setSelectedCell(null); } }}><option value="">Elige una flota rival</option>{battle.players.filter((player) => player.id !== actor?.id && !player.eliminated).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label> : <p>Contrincante: <strong>{target?.name ?? 'Sin seleccionar'}</strong></p>}
          {battle.phase === 'attack' ? <><p>Toca una coordenada del mapa y confirma. Las posiciones enemigas permanecen ocultas.</p><div className="naval-specials" aria-label="Ataques especiales"><button className={!special ? 'selected' : ''} onClick={() => setSpecial(undefined)}><Crosshair size={17}/> Disparo normal</button>{specialNames.map((name) => <button key={name} title={`${NAVAL_SPECIAL_INFO[name].description} Costo: ${NAVAL_SPECIAL_INFO[name].cost} XP. Requiere ${NAVAL_SHIP_INFO[NAVAL_SPECIAL_INFO[name].requiredShip].name} intacto.`} disabled={!specials.includes(name)} className={`${special === name ? 'selected' : ''} ${actor?.ships.find((ship) => ship.kind === NAVAL_SPECIAL_INFO[name].requiredShip)?.hits.length ? 'naval-special--sealed' : ''}`} onClick={() => { setSpecial(name); if (name === 'repair') setSelectedCell(null); audio.play('alarm'); }}><span>{actor?.ships.find((ship) => ship.kind === NAVAL_SPECIAL_INFO[name].requiredShip)?.hits.length ? <LockKeyhole size={18}/> : name === 'radar' ? '⌖' : '✦'}</span><span>{NAVAL_SPECIAL_INFO[name].name}<small>{NAVAL_SPECIAL_INFO[name].once ? 'Un uso por partida' : 'Reutilizable'} · {NAVAL_SPECIAL_INFO[name].cost} XP{actor?.ships.find((ship) => ship.kind === NAVAL_SPECIAL_INFO[name].requiredShip)?.hits.length ? ' · Sellado por daño' : actor?.usedSpecials.includes(name) && NAVAL_SPECIAL_INFO[name].once ? ' · Ya usado' : ''}</small></span></button>)}</div>{special && <p className="naval-help">{NAVAL_SPECIAL_INFO[special].description}</p>}{special === 'repair' && <div className="naval-repair-picker"><p>Se elige al azar una nave propia con exactamente una casilla dañada y se traslada a un nuevo lugar válido. El impacto anterior cambia a blanco y sigue registrado. Su nueva ubicación no se muestra. Un uso por partida.</p><button className="naval-button" disabled={!specials.includes('repair')} onClick={chooseRepair}><Shield size={17}/> Reparar y reubicar en secreto</button></div>}{repairNotice && <p className="naval-tactical-notice">{repairNotice}</p>}{battle.radar && <p className="naval-radar-notice">{battle.radar.kind === 'flare' ? 'Bengala costera' : 'Radar Vision'} · {radarClock}s · {battle.radar.interference ? 'Flak enemigo: señal interferida, posiciones ocultas.' : 'El disparo normal sigue disponible.'}</p>}<button className="naval-button naval-button--primary" disabled={!selectedCell || !target || !!battle.radar || special === 'repair'} onClick={fire}><Crosshair size={19}/>{special === 'radar' || special === 'flare' ? 'Revelar' : 'Disparar'}{selectedCell ? ` en ${coordinate(selectedCell)}` : ': elige una coordenada'}</button></> : <><span className="naval-eyebrow">RESULTADO DEL TURNO</span><h3>{expiredPhase === 'attack' ? 'Tiempo agotado. No hubo disparo.' : shotCount ? `¡${shotCount} ${shotCount === 1 ? 'impacto' : 'impactos'}!` : 'Agua. El disparo no tocó una unidad.'}</h3>{!!battle.lastAttack?.sunkShipIds.length && <p>{battle.lastAttack.sunkShipIds.length} unidad(es) destruida(s). Los restos permanecen en el mapa.</p>}{defenseResult && <p className="naval-tactical-notice">{defenseResult}</p>}{battle.lastAttack?.deflectedFrom && <p className="naval-tactical-notice">Flak costero: las tropas desviaron el ataque una casilla desde {coordinate(battle.lastAttack.deflectedFrom)}.</p>}{battle.lastAttack?.eliminated && <p>La flota de {target?.name} fue eliminada.</p>}<button className="naval-button naval-button--primary" onClick={() => transact(advanceNavalTurn)}>Continuar al siguiente turno</button></>}
        </aside><NavalMapPanel>{target ? <NavalBoard size={battle.size} islands={battle.islands} ships={target.ships} shots={target.shots} playerName={target.name} onSelect={battle.phase === 'attack' && special !== 'repair' ? setSelectedCell : undefined} disabled={battle.phase !== 'attack' || !!battle.radar || special === 'repair'} selectedCell={selectedCell} radarCells={battle.radar?.targetId === target.id ? battle.radar.cells : []} radarInterference={battle.radar?.interference} effects={battle.lastAttack?.targetId === target.id ? battle.lastAttack.cells : []} effectId={battle.turnNumber} paused={blocked}/> : <section className="naval-panel naval-curtain"><Crosshair size={52}/><h2>Elige un contrincante</h2><p>Después podrás seleccionar una coordenada en su mapa.</p></section>}</NavalMapPanel></div>}
        {battle.phase === 'finished' && <section className="naval-curtain naval-panel"><Trophy size={72}/><span className="naval-eyebrow">BATALLA TERMINADA</span><h1>¡Victoria de {battle.players.find((player) => player.id === battle.winnerId)?.name}!</h1><p>{battle.turnNumber} turnos jugados. Gracias a todas las tripulaciones por debatir y colaborar.</p><button className="naval-button naval-button--primary" onClick={() => { stateRef.current = null; setBattle(null); setQuestion(null); questionRef.current = null; setApproved(false); pool.reset(); setPaused(false); setExpiredPhase(null); }}>Preparar otra batalla</button></section>}
        {usesAIQuestions(battle.config.questionMode) && battle.phase !== 'placement' && battle.phase !== 'finished' && <div className="naval-bank-footer"><PoolStatus loading={pool.loading} error={pool.error} count={pool.items.length} retry={() => void pool.replenish()}/><button className="naval-button naval-button--quiet" onClick={() => { setPaused(true); setReview(true); }}>Revisar próximas preguntas</button></div>}
      </>}
    </div>
    {battle?.phase === 'placement' && privateReady && <footer className="naval-fire-dock" inert={blocked}><span>{NAVAL_SHIP_INFO[shipKind].name}<strong>{draftAnchor ? `${coordinate(draftAnchor)} · ${rotation}° · ${pendingPlacement ? 'Vista previa' : 'Guardada'}` : 'Toca una coordenada del mapa'}</strong></span><button className="naval-button naval-button--primary" disabled={!draftAnchor || !pendingPlacement || !previewValid} onClick={confirmPlacement}><Check size={18}/> Confirmar posición</button></footer>}
    {battle?.phase === 'attack' && <footer className="naval-fire-dock" inert={blocked}><span>{actor?.name} → {target?.name ?? 'Elige rival'}<strong>{selectedCell ? `Coordenada ${coordinate(selectedCell)}` : 'Selecciona una coordenada del mapa'}</strong></span><button className="naval-button naval-button--primary" disabled={!selectedCell || !target || !!battle.radar || special === 'repair'} aria-label={selectedCell ? `Confirmar coordenada ${coordinate(selectedCell)}` : 'Confirmar coordenada'} onClick={fire}><Crosshair size={18}/>{special === 'radar' || special === 'flare' ? 'Revelar zona' : 'Confirmar disparo'}</button></footer>}
    {defenseOffer && <div className="naval-overlay" inert={paused || confirmClose}><section className="naval-panel naval-curtain"><Shield size={58}/><span className="naval-eyebrow">ÚLTIMA OPORTUNIDAD DEL DEFENSOR</span><h1>¿Reto relámpago para {target?.name}?</h1><p>El profesor puede activar una pregunta de 10 segundos. Un acierto despliega Humo táctico: la bomba se reduce del área 3×3 a una cruz de cinco casillas. No cambia los XP del equipo defensor.</p><button className="naval-button naval-button--primary" disabled={!pool.items.length} onClick={beginDefense}>Activar reto defensor</button><PoolStatus loading={pool.loading} error={pool.error} count={pool.items.length} retry={() => void pool.replenish()}/><button className="naval-button" onClick={bypassDefense}>Lanzar bomba sin reto</button><button className="naval-button naval-button--quiet" onClick={() => setPaused(true)}>Pausar debate</button></section></div>}
    {defenseQuestion && <div inert={paused || confirmClose || review}><NavalDefenseChallenge question={defenseQuestion.question} defenderName={target?.name ?? 'Equipo defensor'} paused={paused || confirmClose || review} onResolve={resolveDefense} onCancel={() => resolveDefense(false)} onPause={() => setPaused(true)}/></div>}
    {rolling && <div className="naval-overlay naval-roulette" role="status"><section className="naval-curtain naval-panel"><Dices size={70}/><span className="naval-eyebrow">RULETA DE EQUIPOS</span><h1>{rouletteName}</h1><p>El sorteo real es independiente del orden de contrincantes.</p></section></div>}
    {cinematic && <div className="naval-overlay naval-cinematic" aria-label={`Activando ${NAVAL_SPECIAL_INFO[cinematic.special].name}`}><section className="naval-cinematic-card"><span className="naval-eyebrow">{actor?.name} · ATAQUE ESPECIAL</span><h1>{NAVAL_SPECIAL_INFO[cinematic.special].name}</h1><div className="naval-cinematic-ocean"><NavalUnitIcon kind={NAVAL_SPECIAL_INFO[cinematic.special].requiredShip}/><div className={`naval-missile ${cinematic.special === 'radar' ? 'naval-missile--jet' : ''}`}>➤</div></div><p>{cinematic.special === 'repair' ? 'Reparación y traslado secretos · sin mostrar coordenadas' : `Coordenada ${coordinate(cinematic.cell)}`} · {NAVAL_SPECIAL_INFO[cinematic.special].cost} XP</p></section></div>}
    {paused && !confirmClose && !review && battle && <div className="naval-overlay"><section className="naval-panel naval-curtain"><Pause size={48}/><h1>Partida en pausa</h1><p>El debate puede continuar. Los relojes, el radar y las animaciones esperan aquí.</p><button className="naval-button naval-button--primary" onClick={() => setPaused(false)}><Play size={19}/> Reanudar</button><button className="naval-button naval-button--quiet" onClick={() => setConfirmClose(true)}>Terminar partida</button></section></div>}
    {review && <div className="naval-overlay"><section className="naval-panel naval-review-dialog"><h2>Banco siguiente · partida en pausa</h2><p>La respuesta actual no se cambia. Oculta la proyección para no anticipar respuestas al grupo.</p><QuestionReview items={pool.items} onDiscard={pool.discard}/><PoolStatus loading={pool.loading} error={pool.error} count={pool.items.length} retry={() => void pool.replenish()}/><button className="naval-button naval-button--primary" onClick={() => { setReview(false); setPaused(false); }}>Cerrar revisión y continuar</button></section></div>}
    {confirmClose && <div className="naval-overlay"><section className="naval-panel naval-curtain"><h2>¿Cerrar Batalla Naval?</h2><p>La partida es local y no se guarda. Al cerrar se perderán las flotas, turnos y preguntas preparados.</p><button className="naval-button naval-button--primary" onClick={() => setConfirmClose(false)}>Seguir jugando</button><button className="naval-button naval-button--danger" onClick={close}>Sí, cerrar la partida</button></section></div>}
  </div></FlyingCatViewport>;
}

function NavalTeacherReward({ xp, chosen, onAward }: { xp: number; chosen: number | null; onAward: (amount: 10 | 30 | 50) => void }) {
  return <section className="naval-teacher-xp" aria-label="XP extra del profesor">
    <h2>Premio extra del profesor</h2>
    <p>Elige un solo premio por respuesta correcta. Se suma a la XP normal de la partida y, con IA, al premio automático del acierto.</p>
    <progress value={xp} max={NAVAL_XP_MAX} aria-label="Barra de poder tras la respuesta"/>
    <p><strong>{xp}/{NAVAL_XP_MAX} XP</strong> · El exceso no se guarda.</p>
    <div className="naval-toolbar" role="group" aria-label="Elegir premio extra">{([10, 30, 50] as const).map((amount) => <button key={amount} className="naval-button" disabled={chosen !== null || xp >= NAVAL_XP_MAX} onClick={() => onAward(amount)}>+{amount} XP extra</button>)}</div>
    {chosen !== null ? <p role="status">Premio docente elegido: +{chosen} XP, limitado al tope de {NAVAL_XP_MAX}.</p> : xp >= NAVAL_XP_MAX ? <p role="status">Barra llena: no se acumulan ni reservan premios extra.</p> : <p className="naval-help">Puedes continuar sin asignar un premio adicional.</p>}
  </section>;
}

function QuestionReview({ items, onDiscard }: { items: NavalQuestion[]; onDiscard: (id: string) => void }) {
  return <div className="naval-question-review">{items.map((item, index) => <details key={item.id}><summary>{index + 1}. {item.prompt}</summary><ol>{item.options.map((option, position) => <li key={position} className={position === item.correctIndex ? 'naval-correct' : ''}>{option}{position === item.correctIndex && ' ✓'}</li>)}</ol><p>{item.explanation}</p><button className="naval-button naval-button--quiet" onClick={() => onDiscard(item.id)}>Descartar esta pregunta</button></details>)}</div>;
}
function PoolStatus({ count, loading, error, retry }: { count: number; loading: boolean; error: string; retry: () => void }) {
  return <div className="naval-pool-status"><span>{loading && <Loader2 size={16} className="animate-spin"/>} {count} preguntas listas{loading ? ' · preparando más en segundo plano…' : ''}</span>{error && <><p role="alert">{error}</p><button className="naval-button" disabled={loading} onClick={retry}>Reintentar generación</button></>}</div>;
}
