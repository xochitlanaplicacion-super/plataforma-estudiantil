'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeFlyingCatContent, validateFlyingCatContent, type FlyingCatDifficulty } from '@/lib/activities/flying-cat';
import {
  createFlight, emptyFlightControls, flightDifficulty, flightResult, MAX_FLIGHT_OBSTACLES,
  pauseFlight, resizeFlight, resumeFlight, stepFlight, type FlightControls, type FlightState,
  type FlyingCatResult,
} from '@/lib/activities/flying-cat-engine';
import { FallingPilotCat, PilotCat, PilotCatWreck } from './PilotCat';
import { FlyingCatCover } from './FlyingCatCover';
import { useFlyingCatMusic } from './useFlyingCatMusic';
import './flying-cat.css';

export type { FlyingCatResult } from '@/lib/activities/flying-cat-engine';
interface View {
  mode: FlightState['mode']; index: number; hits: number; lives: number; level: number;
  immunity: number; impact: boolean; prompt: string; feedback: FlightState['feedback']; explanation: string;
}
const DIRECTIONS: { key: keyof FlightControls; label: string; arrow: string }[] = [
  { key: 'up', label: 'Volar hacia arriba', arrow: '↑' },
  { key: 'left', label: 'Volar hacia la izquierda', arrow: '←' },
  { key: 'down', label: 'Volar hacia abajo', arrow: '↓' },
  { key: 'right', label: 'Volar hacia la derecha', arrow: '→' },
];
const KEY_DIRECTION: Record<string, keyof FlightControls> = {
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
  const lastCardText = useRef('');
  const finishSent = useRef(false);
  const saving = useRef(false);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const heldPointers = useRef(new Map<number, keyof FlightControls>());
  const resumeButton = useRef<HTMLButtonElement>(null);
  const music = useFlyingCatMusic();

  const clearControls = useCallback(() => {
    controls.current = emptyFlightControls();
    heldPointers.current.clear();
  }, []);
  const refresh = useCallback(() => {
    const state = flight.current;
    if (!state) return;
    const question = state.questions[state.questionIndex];
    setView({
      mode: state.mode, index: state.questionIndex, hits: state.hits, lives: state.lives,
      level: flightDifficulty(state).level, immunity: Math.ceil(state.immunity), impact: state.impactSeconds > 0,
      prompt: question?.prompt || '', feedback: state.feedback, explanation: question?.feedback || '',
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
    clearControls();
    if (flight.current) resumeFlight(flight.current);
    refresh();
    stage.current?.focus();
    if (flight.current?.mode !== 'finished') music.resume();
  }, [clearControls, refresh, music.resume]);
  const pause = useCallback(() => {
    clearControls();
    if (flight.current) pauseFlight(flight.current);
    refresh();
    music.pause();
  }, [clearControls, refresh, music.pause]);
  const close = useCallback(() => {
    pause();
    onClose?.();
  }, [pause, onClose]);

  useEffect(() => { if (result) music.pause(); }, [result, music.pause]);

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
      // On short landscape phones, reserve a left control rail inside the sky.
      // The engine measures the unobscured flight area: neither the pilot nor
      // an answer/obstacle can disappear beneath the student's fingers.
      const gutter = touch && height < 240 && pad
        ? Math.min(pad.right - stage.current.getBoundingClientRect().left + 4, Math.max(0, width - 180)) : 0;
      stage.current.style.setProperty('--fc-control-gutter', `${gutter}px`);
      flight.current.compactPilot = compactPilot;
      resizeFlight(flight.current, width - gutter, height);
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [started, rotateRequired, touch, compactPilot]);

  useEffect(() => {
    if (!started) return;
    let frame = 0;
    let lastTime = performance.now();
    let lastHud = 0;
    let lastSignature = '';
    const animate = (now: number) => {
      const state = flight.current;
      if (state) {
        stepFlight(state, (now - lastTime) / 1000, controls.current);
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
        const signature = `${state.mode}:${state.questionIndex}:${state.lives}:${state.hits}:${Math.ceil(state.immunity)}:${state.impactSeconds > 0}`;
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
  }, [started, touch, pause, clearControls]);

  useEffect(() => {
    if (view && ['reading', 'feedback', 'paused'].includes(view.mode)) resumeButton.current?.focus();
  }, [view?.mode, view?.index, rotateRequired]);

  const start = () => {
    if (flight.current || validation) return;
    clearControls();
    // The chosen challenge belongs to this run, not to the teacher's saved content.
    flight.current = createFlight({ ...content, settings: { ...content.settings, difficulty } }, 360, 380, undefined, compactPilot);
    music.resume();
    setStarted(true);
    refresh();
  };
  const releaseDirection = (pointerId: number) => {
    heldPointers.current.delete(pointerId);
    for (const direction of DIRECTIONS) {
      controls.current[direction.key] = [...heldPointers.current.values()].includes(direction.key);
    }
  };

  if (!validation && !result && rotateRequired) return <div className="fc-game fc-rotate">
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

  if (!started) return <div className="fc-game fc-intro">
    {validation ? <section className="fc-invalid" role="alert">
      <h2>Esta actividad necesita una revisión</h2><p>{validation}</p>
      <button className="fc-button" onClick={close}>Volver</button>
    </section> : <FlyingCatCover title={exercise?.titulo || 'Flying Cat'} instructions={content.instructions}
      touch={touch} difficulty={difficulty} onDifficultyChange={setDifficulty} onStart={start} onClose={onClose ? close : undefined} />}
  </div>;

  if (result) return <div className="fc-game fc-result" role="region" aria-label="Resumen del vuelo">
    <PilotCat className="fc-result-plane" />
    <p className="fc-kicker">Flying Cat · vuelo finalizado</p>
    <h2>{result.hits} de {result.total} respuestas correctas</h2>
    <p className="fc-result-grade">{(result.hits / Math.max(1, result.total) * 10).toFixed(1)} <small>/ 10</small></p>
    <p>{result.score} puntos de vuelo · {result.time} segundos</p>
    {flight.current?.crashed && <p>Se agotaron las tres vidas. Las preguntas sin responder no cuentan como aciertos.</p>}
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

  return <div className="fc-game fc-play" role="region" aria-label={exercise?.titulo || 'Flying Cat'} data-compact-pilot={compactPilot}>
    <div className="fc-hud">
      <span className="fc-progress"><strong>{DIFFICULTY_LABEL[difficulty]} · Nivel {view?.level || 1}</strong> · {Math.min((view?.index || 0) + 1, content.items.length)}/{content.items.length}</span>
      <span aria-label={`${view?.lives || 0} vidas`} className="fc-hearts">{'♥'.repeat(view?.lives || 0)}</span>
      <div className="fc-hud-actions">
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
    <section className="fc-definition" aria-label="Definición de la pregunta actual" tabIndex={0}>
      <small>BUSCA EL CONCEPTO</small><p>{view?.prompt}</p>
    </section>
    <div ref={stage} className={`fc-stage${view?.impact && view.mode === 'flying' ? ' fc-stage--impact' : ''}`}
      data-mode={view?.mode} data-difficulty={difficulty} tabIndex={0}
      aria-label={`Zona de vuelo: pilota al concepto correcto ${touch ? 'con los botones de dirección' : 'con WASD'}`}>
      <div className="fc-sky-hills" />
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
        <p className="fc-crash-caption" role="status">Se agotaron las tres vidas. Preparando tu resumen…</p>
      </>}
      </div>
      {view?.impact && view.mode === 'flying' && <div className="fc-impact-note" role="status">¡Choque! · Quedan {view.lives} vidas</div>}
      {view && !view.impact && view.immunity > 0 && view.mode === 'flying' && <div className="fc-immunity" role="status">Escudo · {view.immunity} s</div>}
      {touch && <div className="fc-touch-controls" aria-label="Controles táctiles de vuelo">
        <div className="fc-pad">{DIRECTIONS.map(({ key, label, arrow }) => <button type="button" key={key} data-direction={key}
          aria-label={label} disabled={view?.mode !== 'flying'}
          onPointerDown={(event) => {
            if (flight.current?.mode !== 'flying') return;
            event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
            heldPointers.current.set(event.pointerId, key); controls.current[key] = true;
          }} onPointerUp={(event) => releaseDirection(event.pointerId)} onPointerCancel={(event) => releaseDirection(event.pointerId)}
          onLostPointerCapture={(event) => releaseDirection(event.pointerId)}>{arrow}</button>)}</div>
      </div>}
      {view && ['reading', 'feedback', 'paused'].includes(view.mode) && <div className="fc-overlay">
        <section className="fc-dialog" role="dialog" aria-modal="true" aria-labelledby="fc-dialog-heading">
          <p className="fc-kicker">{view.mode === 'feedback' ? (view.explanation.trim() ? 'Explicación · vuelo en pausa' : 'Respuesta · vuelo en pausa') : 'Lee con calma · el cielo está en pausa'}</p>
          <h2 id="fc-dialog-heading">{view.mode === 'feedback' ? (view.feedback?.isCorrect ? '¡Concepto correcto!' : 'Vamos a aprenderlo')
            : view.mode === 'paused' ? 'Vuelo en pausa' : `Definición ${view.index + 1}`}</h2>
          <div className="fc-dialog-body">
            {view.mode === 'feedback' ? <>
              <p>Tu elección: <strong>{view.feedback?.selectedAnswer}</strong></p>
              <p>Concepto correcto: <strong>{view.feedback?.correctAnswer}</strong></p>
              {view.explanation.trim() && <p className="fc-explanation">{view.explanation}</p>}
            </> : <><p>{view.prompt}</p><p className="fc-help">Pilota {touch ? 'con los botones de dirección' : 'con WASD'} hacia el concepto correcto. Deja pasar los otros y esquiva los obstáculos. Si una tarjeta se va, volverá a aparecer.</p></>}
          </div>
          <p className="fc-shield-note">Al reanudar tendrás 3 segundos de protección contra obstáculos.</p>
          <button ref={resumeButton} className="fc-button" onClick={resume}>
            {view.mode === 'feedback' ? (view.index + 1 >= content.items.length ? 'Ver mi resultado' : 'Siguiente definición') : 'Continuar vuelo →'}
          </button>
        </section>
      </div>}
    </div>
    {!touch && <footer className="fc-keyboard-help">WASD para pilotar · P para pausar · Una tarjeta por vez</footer>}
  </div>;
}
