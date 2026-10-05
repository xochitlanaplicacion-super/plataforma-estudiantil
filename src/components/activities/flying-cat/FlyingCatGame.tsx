'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeFlyingCatContent, validateFlyingCatContent, type FlyingCatDifficulty } from '@/lib/activities/flying-cat';
import {
  activateFlightBonus, createFlight, emptyFlightControls, flightDifficulty, flightResult, MAX_FLIGHT_OBSTACLES,
  pauseFlight, resizeFlight, resumeFlight, stepFlight, type FlightState,
  type FlyingCatResult,
} from '@/lib/activities/flying-cat-engine';
import { FallingPilotCat, PilotCat, PilotCatWreck } from './PilotCat';
import { FlyingCatCover } from './FlyingCatCover';
import { useFlyingCatMusic } from './useFlyingCatMusic';
import { FlyingCatParallax, type FlyingCatParallaxHandle } from './FlyingCatParallax';
import { useFlyingCatFullscreen } from './FlyingCatViewport';
import { FlyingCatJoystick, FlyingCatControlSettings, useFlyingCatControlPreferences } from './FlyingCatJoystick';
import { FLYING_CAT_BONUS_INFO, FlyingCatBonusIcon } from './FlyingCatBonuses';
import './flying-cat.css';

export type { FlyingCatResult } from '@/lib/activities/flying-cat-engine';
interface View {
  mode: FlightState['mode']; index: number; hits: number; lives: number; level: number;
  immunity: number; impact: boolean; prompt: string; feedback: FlightState['feedback']; explanation: string;
  bonuses: FlightState['bonuses']; slowSeconds: number; multiplier: number; lightningSeconds: number; lightningSerial: number;
}
const KEY_DIRECTION: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  w: 'up', a: 'left', s: 'down', d: 'right',
};
const DIFFICULTY_LABEL: Record<FlyingCatDifficulty, string> = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };

export default function FlyingCatGame({ exercise, onComplete, onClose, closeLabel = 'Cerrar juego' }: {
  exercise: any;
  onComplete?: (result: FlyingCatResult) => Promise<unknown> | unknown;
  onClose?: () => void;
  closeLabel?: string;
}) {
  const [content] = useState(() => {
    let source = exercise?.contenido;
    if (typeof source === 'string') { try { source = JSON.parse(source); } catch { source = {}; } }
    return normalizeFlyingCatContent(source);
  });
  const validation = validateFlyingCatContent(content);
  const [difficulty, setDifficulty] = useState<FlyingCatDifficulty>(content.settings.difficulty);
  const [touch, setTouch] = useState(false);
  const [compactPilot, setCompactPilot] = useState(false);
  const [rotateRequired, setRotateRequired] = useState(false);
  const [started, setStarted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [result, setResult] = useState<FlyingCatResult | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed' | 'practice'>('idle');
  const [practiceMessage, setPracticeMessage] = useState('Resultado de práctica: no se guardó una nueva calificación.');
  const flight = useRef<FlightState | null>(null);
  const controls = useRef(emptyFlightControls());
  const stage = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const obstacleNodes = useRef<(HTMLDivElement | null)[]>([]);
  const debrisNodes = useRef<(HTMLDivElement | null)[]>([]);
  const lightningNode = useRef<HTMLDivElement>(null);
  const lastCardText = useRef('');
  const finishSent = useRef(false);
  const saving = useRef(false);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const resumeButton = useRef<HTMLButtonElement>(null);
  const parallax = useRef<FlyingCatParallaxHandle>(null);
  // Survives the scene unmounting when a phone rotates to portrait.
  const landscapeClock = useRef(0);
  const reduceMotion = useRef(false);
  const music = useFlyingCatMusic();
  const fullscreen = useFlyingCatFullscreen();
  const previousFullscreen = useRef(false);
  const explicitFullscreenExit = useRef(false);
  const controlSettings = useFlyingCatControlPreferences();
  const gameRoot = useCallback((node: HTMLDivElement | null) => {
    // Fullscreen the entire portal, including HUD, overlays and bonus controls.
    // Keep the same owner when changing between cover, game and results.
    if (node) fullscreen.viewportRef(node.closest<HTMLDivElement>('.fc-viewport'));
  }, [fullscreen.viewportRef]);

  const clearControls = useCallback(() => {
    controls.current = emptyFlightControls();
  }, []);
  const refresh = useCallback(() => {
    const state = flight.current;
    if (!state) return;
    const question = state.questions[state.questionIndex];
    setView({
      mode: state.mode, index: state.questionIndex, hits: state.hits, lives: state.lives,
      level: flightDifficulty(state).level, immunity: Math.ceil(state.immunity), impact: state.impactSeconds > 0,
      prompt: question?.prompt || '', feedback: state.feedback, explanation: question?.feedback || '',
      bonuses: [...state.bonuses], slowSeconds: Math.ceil(state.slowSeconds), multiplier: state.scoreMultiplier,
      lightningSeconds: state.lightningSeconds, lightningSerial: state.lightningSerial,
    });
  }, []);
  const save = useCallback(async (completed: FlyingCatResult) => {
    if (saving.current) return;
    if (!callback.current) { setSaveState('saved'); return; }
    saving.current = true;
    setSaveState('saving');
    try {
      const outcome = await callback.current(completed);
      const practice = outcome && typeof outcome === 'object' && 'practice' in outcome && outcome.practice === true;
      if (practice && 'message' in outcome && typeof outcome.message === 'string') setPracticeMessage(outcome.message);
      setSaveState(practice ? 'practice' : 'saved');
    }
    catch { setSaveState('failed'); }
    finally { saving.current = false; }
  }, []);
  const resume = useCallback(() => {
    void fullscreen.requestFullscreen();
    setSettingsOpen(false);
    clearControls();
    if (flight.current) resumeFlight(flight.current);
    refresh();
    stage.current?.focus();
    if (flight.current?.mode !== 'finished') music.resume();
  }, [clearControls, refresh, music.resume, fullscreen.requestFullscreen]);
  const pause = useCallback(() => {
    clearControls();
    if (flight.current) pauseFlight(flight.current);
    refresh();
    music.pause();
  }, [clearControls, refresh, music.pause]);
  const close = useCallback(() => {
    pause();
    void fullscreen.exitFullscreen();
    onClose?.();
  }, [pause, onClose, fullscreen.exitFullscreen]);

  const useBonus = useCallback((slot: 0 | 1, expectedId?: number) => {
    const state = flight.current;
    if (!state) return;
    if (activateFlightBonus(state, slot, expectedId)) refresh();
    if (state.mode === 'flying') stage.current?.focus();
  }, [refresh]);

  useEffect(() => {
    if (previousFullscreen.current && !fullscreen.isFullscreen) {
      // Safari's exit gesture may not send Escape/blur. Freeze the flight when
      // browser chrome unexpectedly returns, but respect the explicit HUD exit.
      if (!explicitFullscreenExit.current) pause();
      explicitFullscreenExit.current = false;
    }
    if (fullscreen.isFullscreen) explicitFullscreenExit.current = false;
    previousFullscreen.current = fullscreen.isFullscreen;
  }, [fullscreen.isFullscreen, pause]);

  useEffect(() => { if (result) music.pause(); }, [result, music.pause]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reduceMotion.current = query.matches; };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => {
      const tactile = query.matches && navigator.maxTouchPoints > 0;
      setTouch(tactile);
      // Observe the real viewport; never CSS-rotate it or compete with the OS.
      // Tablets have enough room in portrait; compact phones must use landscape.
      const compact = tactile && Math.min(window.innerWidth, window.innerHeight) < 600;
      setCompactPilot(compact);
      const required = compact && window.innerHeight > window.innerWidth;
      // Pause synchronously before another animation frame can run after resize.
      if (required && flight.current) pause();
      setRotateRequired(required);
    };
    update();
    query.addEventListener('change', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      query.removeEventListener('change', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [pause]);

  useEffect(() => {
    if (!started || !stage.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!flight.current || !stage.current) return;
      const { width, height } = entry.contentRect;
      const pad = stage.current.querySelector('.fc-touch-controls')?.getBoundingClientRect();
      const bounds = stage.current.getBoundingClientRect();
      stage.current.dataset.shortScene = String(height < 170);
      const rail = stage.current.querySelector('.fc-bonus-rail')?.getBoundingClientRect();
      // Protect both UI rails in short landscapes. Mirroring the student's
      // joystick must never hide a card beneath the controls or bonus buttons.
      const leftPad = controlSettings.preferences.side === 'left';
      const maximumRail = Math.max(0, (width - 180) / 2);
      const left = touch && height < 240 && pad && leftPad
        ? Math.min(pad.right - bounds.left + 6, maximumRail) : 0;
      const right = height < 240
        ? Math.min(Math.max(rail ? bounds.right - rail.left + 6 : 0,
          touch && pad && !leftPad ? bounds.right - pad.left + 6 : 0), maximumRail) : 0;
      stage.current.style.setProperty('--fc-control-gutter', `${left}px`);
      stage.current.style.setProperty('--fc-right-gutter', `${right}px`);
      flight.current.compactPilot = compactPilot;
      resizeFlight(flight.current, width - left - right, height);
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [started, rotateRequired, touch, compactPilot, controlSettings.preferences.size, controlSettings.preferences.side]);

  useEffect(() => {
    if (!started) return;
    let frame = 0;
    let lastTime = performance.now();
    let lastHud = 0;
    let lastSignature = '';
    const animate = (now: number) => {
      const state = flight.current;
      if (state) {
        const previousTime = state.activeSeconds;
        const landscapeMoving = state.mode === 'flying' && state.impactSeconds <= 0 && !reduceMotion.current;
        const landscapeSpeed = flightDifficulty(state).landscapeSpeedFactor;
        stepFlight(state, (now - lastTime) / 1000, controls.current);
        if (landscapeMoving) {
          landscapeClock.current += (state.activeSeconds - previousTime) * landscapeSpeed;
        }
        // Reuse the simulation's capped delta: no extra RAF, timers or per-frame React renders.
        parallax.current?.advance(landscapeClock.current);
        if (plane.current) {
          plane.current.style.width = `${state.player.width}px`;
          plane.current.style.transform = `translate3d(${state.player.x - state.player.width / 2}px,${state.player.y - state.player.height / 2}px,0)`;
        }
        if (card.current) {
          card.current.hidden = !state.card;
          if (state.card) {
            const object = state.card;
            card.current.style.width = `${object.width}px`;
            card.current.style.transform = `translate3d(${object.x - object.width / 2}px,${object.y - object.height / 2}px,0)`;
            if (lastCardText.current !== object.text || card.current.textContent !== object.text) {
              card.current.textContent = object.text;
              lastCardText.current = object.text;
            }
            card.current.dataset.revealed = String(state.revealQuestionIndex === state.questionIndex
              && object.index === state.questions[state.questionIndex]?.correctIndex);
          }
        }
        obstacleNodes.current.forEach((node, index) => {
          if (!node) return;
          const object = state.obstacles[index];
          node.hidden = !object;
          if (object) {
            node.style.width = `${object.width}px`;
            node.style.height = `${object.height}px`;
            node.style.transform = `translate3d(${object.x - object.width / 2}px,${object.y - object.height / 2}px,0)`;
            node.dataset.kind = String(object.kind);
          }
        });
        debrisNodes.current.forEach((node, index) => {
          if (!node) return;
          const object = state.debris[index];
          node.hidden = !object;
          if (object) {
            node.style.width = `${object.width}px`; node.style.height = `${object.height}px`;
            node.style.transform = `translate3d(${object.x - object.width / 2}px,${object.y - object.height / 2}px,0) rotate(${object.rotation}deg)`;
            node.style.opacity = String(Math.max(0, 1 - object.elapsed / 0.9));
            node.dataset.kind = String(object.kind);
          }
        });
        if (lightningNode.current) lightningNode.current.style.opacity = String(Math.max(0, state.lightningSeconds / 0.9));
        const signature = `${state.mode}:${state.questionIndex}:${state.lives}:${state.hits}:${Math.ceil(state.immunity)}:${state.impactSeconds > 0}:${state.bonuses.map(b => b?.id ?? '-').join(',')}:${Math.ceil(state.slowSeconds)}:${state.scoreMultiplier}:${state.lightningSeconds > 0}`;
        if (state.mode !== 'flying') clearControls();
        if (signature !== lastSignature || now - lastHud > 600) {
          refresh(); lastSignature = signature; lastHud = now;
        }
        if (state.mode === 'finished' && !finishSent.current) {
          finishSent.current = true;
          clearControls();
          const completed = flightResult(state);
          setResult(completed);
          void save(completed);
        }
        if (state.mode === 'finished') return;
      }
      lastTime = now;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [started, clearControls, refresh, save]);

  useEffect(() => {
    if (!started) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === 'escape' || key === 'p') { if (!event.repeat) pause(); return; }
      if (!touch && (key === 'e' || key === 'r')) {
        event.preventDefault();
        if (!event.repeat) {
          const slot = key === 'e' ? 0 : 1;
          useBonus(slot, flight.current?.bonuses[slot]?.id);
        }
        return;
      }
      const direction = KEY_DIRECTION[key];
      if (!touch && direction && flight.current?.mode === 'flying') {
        event.preventDefault(); controls.current[direction] = true;
      }
    };
    const keyup = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTION[event.key.toLowerCase()];
      if (!touch && direction) controls.current[direction] = false;
    };
    const hidden = () => { if (document.hidden) pause(); };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', hidden);
      clearControls();
    };
  }, [started, touch, pause, clearControls, useBonus]);

  useEffect(() => {
    if (view && ['reading', 'feedback', 'paused'].includes(view.mode)) resumeButton.current?.focus();
  }, [view?.mode, view?.index, rotateRequired]);

  const start = () => {
    if (flight.current || validation) return;
    void fullscreen.requestFullscreen();
    clearControls();
    // The chosen challenge belongs to this run, not to the teacher's saved content.
    flight.current = createFlight({ ...content, settings: { ...content.settings, difficulty } }, 360, 380, undefined, compactPilot);
    music.resume();
    setStarted(true);
    refresh();
  };

  if (!validation && !result && rotateRequired) return <div ref={gameRoot} className="fc-game fc-rotate">
    <section aria-labelledby="fc-rotate-heading">
      <span className="fc-rotate-phone" aria-hidden="true">↻ ▯</span>
      <p className="fc-kicker">Flying Cat · vuelo horizontal</p>
      <h2 id="fc-rotate-heading">Gira tu teléfono para jugar</h2>
      <p>Colócalo en horizontal para tener espacio para pilotar y ver los conceptos y obstáculos.</p>
      <p className="fc-rotate-help">Si la pantalla no gira, activa el giro automático o desactiva el bloqueo de orientación de tu teléfono.</p>
      {started && <p role="status">Tu vuelo está en pausa. Conservamos tu avance; podrás continuar cuando gires la pantalla.</p>}
      {onClose && <button type="button" className="fc-button fc-secondary" onClick={close}>Volver a mis actividades</button>}
    </section>
  </div>;

  if (!started) return <div ref={gameRoot} className="fc-game fc-intro">
    {validation ? <section className="fc-invalid" role="alert">
      <h2>Esta actividad necesita una revisión</h2><p>{validation}</p>
      <button className="fc-button" onClick={close}>Volver</button>
    </section> : <FlyingCatCover title={exercise?.titulo || 'Flying Cat'} instructions={content.instructions}
      touch={touch} difficulty={difficulty} onDifficultyChange={setDifficulty} onStart={start} onClose={onClose ? close : undefined} />}
  </div>;

  if (result) return <div ref={gameRoot} className="fc-game fc-result" role="region" aria-label="Resumen del vuelo">
    <PilotCat className="fc-result-plane" />
    <p className="fc-kicker">Flying Cat · vuelo finalizado</p>
    <h2>{result.hits} de {result.total} respuestas correctas</h2>
    <p className="fc-result-grade">{(result.hits / Math.max(1, result.total) * 10).toFixed(1)} <small>/ 10</small></p>
    <p>{result.score} puntos de vuelo · {result.time} segundos</p>
    {flight.current?.crashed && <p>Se agotaron tus vidas. Las preguntas sin responder no cuentan como aciertos.</p>}
    <p role="status">{saveState === 'saving' ? 'Guardando tu resultado…' : saveState === 'failed'
      ? 'No se pudo guardar. Conservamos tu resultado aquí para reintentar.'
      : saveState === 'practice' ? practiceMessage
      : onComplete ? 'Resultado guardado en la plataforma.' : 'Vista previa: no se guardó una calificación.'}</p>
    <div className="fc-result-answers">{result.answers.map((answer) => <details key={answer.questionId}>
      <summary>{answer.isCorrect ? '✓' : '✕'} {answer.prompt}</summary>
      <p>Tu elección: {answer.selectedAnswer} · Correcta: {answer.correctAnswer}</p>
    </details>)}</div>
    {saveState === 'failed' && <button className="fc-button" onClick={() => void save(result)}>Reintentar guardar</button>}
    <button className="fc-button fc-secondary" disabled={saveState === 'saving'} onClick={close}>Volver a mis actividades</button>
  </div>;

  return <div ref={gameRoot} className="fc-game fc-play" role="region" aria-label={exercise?.titulo || 'Flying Cat'} data-compact-pilot={compactPilot}>
    <div className="fc-hud">
      <span className="fc-progress"><strong>{DIFFICULTY_LABEL[difficulty]} · Nivel {view?.level || 1}</strong> · {Math.min((view?.index || 0) + 1, content.items.length)}/{content.items.length}</span>
      <span aria-label={`${view?.lives || 0} vidas`} className="fc-hearts">{'♥'.repeat(view?.lives || 0)}</span>
      <div className="fc-hud-actions">
        <button type="button" className="fc-pause fc-icon-button" disabled={fullscreen.requesting} onClick={() => {
          if (fullscreen.isFullscreen) {
            explicitFullscreenExit.current = true;
            void fullscreen.exitFullscreen().then(exited => { if (!exited) explicitFullscreenExit.current = false; });
          }
          else void fullscreen.requestFullscreen();
          if (flight.current?.mode === 'flying') stage.current?.focus();
        }} aria-label={fullscreen.isFullscreen ? 'Salir de pantalla completa' : 'Entrar en pantalla completa'}
          title={fullscreen.isFullscreen ? 'Salir de pantalla completa' : 'Entrar en pantalla completa'}>⛶</button>
        {touch && <button type="button" className="fc-pause fc-icon-button" aria-label="Ajustar controles" title="Ajustar controles"
          disabled={!view || !['flying', 'paused', 'reading'].includes(view.mode)} onClick={() => { pause(); setSettingsOpen(true); }}>⚙</button>}
        <button type="button" className="fc-pause fc-music" onClick={() => {
          music.toggle();
          if (flight.current?.mode === 'flying') stage.current?.focus();
        }} aria-pressed={music.enabled}
          aria-label={music.enabled ? 'Silenciar música' : 'Activar música'} title={music.enabled ? 'Silenciar música' : 'Activar música'}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M11 4 5 9H2v6h3l6 5V4Z" />
            {music.enabled ? <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /> : <path d="m16 9 6 6m0-6-6 6" />}
          </svg>
        </button>
        <button type="button" className="fc-pause" onClick={pause} disabled={view?.mode !== 'flying'} aria-label="Pausar y releer definición">Ⅱ Pausa</button>
        {onClose && <button type="button" className="fc-pause fc-close" onClick={close} aria-label={closeLabel}>× Cerrar</button>}
      </div>
    </div>
    {fullscreen.message && <div className="fc-fullscreen-message" role="status"><span>{fullscreen.message}</span>
      <button type="button" onClick={fullscreen.clearMessage} aria-label="Ocultar aviso de pantalla completa">×</button></div>}
    <section className="fc-definition" aria-label="Definición de la pregunta actual" tabIndex={0}>
      <small>BUSCA EL CONCEPTO</small><p>{view?.prompt}</p>
    </section>
    <div ref={stage} className={`fc-stage${view?.impact && view.mode === 'flying' ? ' fc-stage--impact' : ''}`}
      data-mode={view?.mode} data-difficulty={difficulty} tabIndex={0}
      aria-label={`Zona de vuelo: pilota al concepto correcto ${touch ? 'con la palanca circular' : 'con WASD'}`}>
      <FlyingCatParallax ref={parallax} />
      <div className="fc-world">
      <div ref={plane} className="fc-plane" hidden={view?.mode === 'crashing'}>
        <div className={`fc-plane-reaction${view?.impact && view.mode === 'flying' ? ' fc-plane-reaction--impact' : ''}`}>
          <PilotCat flying={view?.mode === 'flying'} worried={Boolean(view?.impact)} protected={Boolean(view && !view.impact && view.immunity > 0)} />
        </div>
      </div>
      <div ref={card} className="fc-card" hidden />
      {Array.from({ length: MAX_FLIGHT_OBSTACLES }, (_, index) => <div key={index} className="fc-obstacle" hidden
        ref={(node) => { obstacleNodes.current[index] = node; }} aria-hidden="true">
        <svg viewBox="0 0 80 60"><g className="fc-ob-cloud"><path d="M10 39C-2 18 18 9 30 20C30 1 62 4 61 22C83 15 89 45 68 46H15Z" fill="#6d8594" stroke="#f7efdf" strokeWidth="3"/><path d="M29 44l-6 10m24-10-6 10" stroke="#36566b" strokeWidth="4"/></g>
          <g className="fc-ob-kite"><path d="M39 3L62 25 39 47 16 25Z" fill="#db754c" stroke="#fff5dd" strokeWidth="3"/><path d="M39 3v44M16 25h46M39 47q12 6 0 12" fill="none" stroke="#36566b" strokeWidth="2"/></g>
          <g className="fc-ob-balloon"><ellipse cx="40" cy="24" rx="20" ry="22" fill="#ddb757" stroke="#fff5dd" strokeWidth="3"/><path d="M31 44v11h18V44" fill="#9a5939" stroke="#fff5dd" strokeWidth="2"/></g>
        </svg></div>)}
      {view?.mode === 'crashing' && flight.current && <>
        <div className="fc-crash-scene" aria-hidden="true" style={{ left: flight.current.player.x, top: flight.current.player.y,
          '--fc-fall-distance': `${flight.current.height + 100}px`, '--fc-plane-size': `${flight.current.player.width}px`,
        } as React.CSSProperties}>
          <div className="fc-crash-wreck"><PilotCatWreck /></div>
          <div className="fc-crash-cat"><FallingPilotCat /></div>
          {[0, 1, 2, 3, 4].map((piece) => <i key={piece} className={`fc-crash-chip fc-crash-chip-${piece}`} />)}
        </div>
        <p className="fc-crash-caption" role="status">Se agotaron tus vidas. Preparando tu resumen…</p>
      </>}
      {Array.from({ length: MAX_FLIGHT_OBSTACLES }, (_, index) => <div key={`debris-${index}`} className="fc-obstacle fc-debris" hidden
        ref={(node) => { debrisNodes.current[index] = node; }} aria-hidden="true">
        <svg viewBox="0 0 80 60"><g className="fc-ob-cloud"><path d="M10 39C-2 18 18 9 30 20C30 1 62 4 61 22C83 15 89 45 68 46H15Z" fill="#6d8594" stroke="#f7efdf" strokeWidth="3"/><path d="M29 44l-6 10m24-10-6 10" stroke="#36566b" strokeWidth="4"/></g>
          <g className="fc-ob-kite"><path d="M39 3L62 25 39 47 16 25Z" fill="#db754c" stroke="#fff5dd" strokeWidth="3"/><path d="M39 3v44M16 25h46M39 47q12 6 0 12" fill="none" stroke="#36566b" strokeWidth="2"/></g>
          <g className="fc-ob-balloon"><ellipse cx="40" cy="24" rx="20" ry="22" fill="#ddb757" stroke="#fff5dd" strokeWidth="3"/><path d="M31 44v11h18V44" fill="#9a5939" stroke="#fff5dd" strokeWidth="2"/></g>
        </svg></div>)}
      </div>
      {Boolean(view?.lightningSeconds) && <div ref={lightningNode} key={view?.lightningSerial} className="fc-lightning-effect" aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="m54 0-12 30 18 4-27 30 18 3-18 33" fill="none" stroke="#d8f7ff" strokeWidth="3" /></svg>
      </div>}
      <div className="fc-bonus-rail" data-side="right" aria-label="Tus dos bonus">
        <small>Bonus</small>
        {([0, 1] as const).map(slot => {
          const bonus = view?.bonuses[slot];
          const info = bonus && FLYING_CAT_BONUS_INFO[bonus.kind];
          return <button type="button" key={slot} data-slot={slot} className={`fc-bonus-slot${bonus ? ' fc-bonus-slot--ready' : ''}`}
            disabled={!bonus || view?.mode !== 'flying' || view.impact || (bonus.kind === 'extra_life' && view.lives >= 5)}
            aria-label={info ? `Usar bonus ${slot + 1}: ${info.name}` : `Bonus ${slot + 1} vacío`}
            title={info?.description || 'Gana un premio al responder correctamente'}
            onClick={() => useBonus(slot, bonus?.id)}>
            {!touch && <kbd>{slot === 0 ? 'E' : 'R'}</kbd>}
            {bonus ? <><FlyingCatBonusIcon kind={bonus.kind} /><span>{info?.name}</span></> : <span className="fc-bonus-empty">+</span>}
          </button>;
        })}
      </div>
      {(Boolean(view?.slowSeconds) || (view?.multiplier || 1) > 1) && <div className="fc-active-bonuses" role="status">
        {Boolean(view?.slowSeconds) && <span>Cámara lenta · {view?.slowSeconds} s</span>}
        {(view?.multiplier || 1) > 1 && <span>Próximo acierto ×{view?.multiplier}</span>}
      </div>}
      {view?.impact && view.mode === 'flying' && <div className="fc-impact-note" role="status">¡Choque! · Quedan {view.lives} vidas</div>}
      {view && !view.impact && view.immunity > 0 && view.mode === 'flying' && <div className="fc-immunity" role="status">Escudo · {view.immunity} s</div>}
      {touch && <FlyingCatJoystick preferences={controlSettings.preferences}
        disabled={view?.mode !== 'flying' || view.impact}
        onMove={(x, y) => {
          if (flight.current?.mode !== 'flying' || flight.current.impactSeconds > 0) return;
          controls.current.axisX = x; controls.current.axisY = y;
        }} onRelease={() => { controls.current.axisX = 0; controls.current.axisY = 0; }} />}
      {view && ['reading', 'feedback', 'paused'].includes(view.mode) && <div className="fc-overlay">
        <section className="fc-dialog" role="dialog" aria-modal="true" aria-labelledby="fc-dialog-heading">
          <p className="fc-kicker">{view.mode === 'feedback' ? (view.explanation.trim() ? 'Explicación · vuelo en pausa' : 'Respuesta · vuelo en pausa') : 'Lee con calma · el cielo está en pausa'}</p>
          <h2 id="fc-dialog-heading">{settingsOpen ? 'Ajustes de controles' : view.mode === 'feedback' ? (view.feedback?.isCorrect ? '¡Concepto correcto!' : 'Vamos a aprenderlo')
            : view.mode === 'paused' ? 'Vuelo en pausa' : `Definición ${view.index + 1}`}</h2>
          <div className="fc-dialog-body">
            {settingsOpen ? <FlyingCatControlSettings preferences={controlSettings.preferences}
              onChange={controlSettings.updatePreferences} onReset={controlSettings.resetPreferences} /> : view.mode === 'feedback' ? <>
              <p>Tu elección: <strong>{view.feedback?.selectedAnswer}</strong></p>
              <p>Concepto correcto: <strong>{view.feedback?.correctAnswer}</strong></p>
              {view.explanation.trim() && <p className="fc-explanation">{view.explanation}</p>}
              {view.feedback?.isCorrect && <p className="fc-prize-note">Tienes {view.bonuses.filter(Boolean).length}/2 bonus guardados.
                {' '}{touch ? 'Tócalos a la derecha cuando estés volando.' : 'Úsalos con E o R cuando estés volando.'}</p>}
            </> : <><p>{view.prompt}</p><p className="fc-help">Pilota {touch ? 'con la palanca circular' : 'con WASD'} hacia el concepto correcto. Deja pasar los otros y esquiva los obstáculos. Si una tarjeta se va, volverá a aparecer.</p></>}
          </div>
          <p className="fc-shield-note">Al reanudar tendrás 3 segundos de protección contra obstáculos.</p>
          <button ref={resumeButton} className="fc-button" onClick={resume}>
            {view.mode === 'feedback' ? (view.index + 1 >= content.items.length ? 'Ver mi resultado' : 'Siguiente definición') : 'Continuar vuelo →'}
          </button>
        </section>
      </div>}
    </div>
    {!touch && <footer className="fc-keyboard-help">WASD para pilotar · E/R para bonus · P para pausar · Una tarjeta por vez</footer>}
  </div>;
}
