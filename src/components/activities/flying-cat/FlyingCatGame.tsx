'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeFlyingCatContent, validateFlyingCatContent } from '@/lib/activities/flying-cat';
import {
  createFlight, emptyFlightControls, flightDifficulty, flightResult, moveFlightPlayer,
  pauseFlight, resizeFlight, resumeFlight, stepFlight, type FlightControls, type FlightState,
  type FlyingCatResult,
} from '@/lib/activities/flying-cat-engine';
import { FallingPilotCat, PilotCat, PilotCatWreck } from './PilotCat';
import { FlyingCatCover } from './FlyingCatCover';
import './flying-cat.css';

export type { FlyingCatResult } from '@/lib/activities/flying-cat-engine';
interface View {
  mode: FlightState['mode']; index: number; hits: number; lives: number; level: number;
  immunity: number; prompt: string; feedback: FlightState['feedback']; explanation: string;
}
const DIRECTIONS: { key: keyof FlightControls; label: string; arrow: string }[] = [
  { key: 'up', label: 'Volar hacia arriba', arrow: '↑' },
  { key: 'left', label: 'Volar hacia la izquierda', arrow: '←' },
  { key: 'down', label: 'Volar hacia abajo', arrow: '↓' },
  { key: 'right', label: 'Volar hacia la derecha', arrow: '→' },
];
const KEY_DIRECTION: Record<string, keyof FlightControls> = {
  w: 'up', arrowup: 'up', a: 'left', arrowleft: 'left', s: 'down', arrowdown: 'down', d: 'right', arrowright: 'right',
};

export default function FlyingCatGame({ exercise, onComplete, onClose }: {
  exercise: any;
  onComplete?: (result: FlyingCatResult) => Promise<unknown> | unknown;
  onClose?: () => void;
}) {
  const [content] = useState(() => {
    let source = exercise?.contenido;
    if (typeof source === 'string') { try { source = JSON.parse(source); } catch { source = {}; } }
    return normalizeFlyingCatContent(source);
  });
  const validation = validateFlyingCatContent(content);
  const [touch, setTouch] = useState(false);
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
  const dragPointer = useRef<number | null>(null);
  const heldPointers = useRef(new Map<number, keyof FlightControls>());
  const resumeButton = useRef<HTMLButtonElement>(null);

  const clearControls = useCallback(() => {
    controls.current = emptyFlightControls();
    dragPointer.current = null;
    heldPointers.current.clear();
  }, []);
  const refresh = useCallback(() => {
    const state = flight.current;
    if (!state) return;
    const question = state.questions[state.questionIndex];
    setView({
      mode: state.mode, index: state.questionIndex, hits: state.hits, lives: state.lives,
      level: flightDifficulty(state).level, immunity: Math.ceil(state.immunity),
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
  }, [clearControls, refresh]);
  const pause = useCallback(() => {
    clearControls();
    if (flight.current) pauseFlight(flight.current);
    refresh();
  }, [clearControls, refresh]);

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setTouch(query.matches && navigator.maxTouchPoints > 0);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!started || !stage.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (flight.current) resizeFlight(flight.current, entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [started]);

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
            if (lastCardText.current !== object.text) {
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
            node.style.transform = `translate3d(${object.x - object.width / 2}px,${object.y - object.height / 2}px,0)`;
            node.dataset.kind = String(object.kind);
          }
        });
        const signature = `${state.mode}:${state.questionIndex}:${state.lives}:${state.hits}:${Math.ceil(state.immunity)}`;
        if (state.mode === 'crashing') clearControls();
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
      if (direction && flight.current?.mode === 'flying') {
        event.preventDefault(); controls.current[direction] = true;
      }
    };
    const keyup = (event: KeyboardEvent) => {
      const direction = KEY_DIRECTION[event.key.toLowerCase()];
      if (direction) controls.current[direction] = false;
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
  }, [started, pause, clearControls]);

  useEffect(() => {
    if (view && ['reading', 'feedback', 'paused'].includes(view.mode)) resumeButton.current?.focus();
  }, [view?.mode, view?.index]);

  const start = () => {
    if (flight.current || validation) return;
    clearControls();
    flight.current = createFlight(content, 360, 380);
    setStarted(true);
    refresh();
  };
  const steer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragPointer.current !== event.pointerId || flight.current?.mode !== 'flying' || !stage.current) return;
    const box = stage.current.getBoundingClientRect();
    moveFlightPlayer(flight.current, event.clientX - box.left, event.clientY - box.top - 32);
  };
  const releaseDirection = (pointerId: number) => {
    heldPointers.current.delete(pointerId);
    for (const direction of DIRECTIONS) {
      controls.current[direction.key] = [...heldPointers.current.values()].includes(direction.key);
    }
  };

  if (!started) return <div className="fc-game fc-intro">
    {validation ? <section className="fc-invalid" role="alert">
      <h2>Esta actividad necesita una revisión</h2><p>{validation}</p>
      <button className="fc-button" onClick={onClose}>Volver</button>
    </section> : <FlyingCatCover title={exercise?.titulo || 'Flying Cat'} instructions={content.instructions}
      touch={touch} onStart={start} onClose={onClose} />}
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
    <button className="fc-button fc-secondary" disabled={saveState === 'saving'} onClick={onClose}>Volver a mis actividades</button>
  </div>;

  return <div className="fc-game fc-play">
    <div className="fc-hud">
      <span><strong>Nivel {view?.level || 1}</strong> · {Math.min((view?.index || 0) + 1, content.items.length)}/{content.items.length}</span>
      <span aria-label={`${view?.lives || 0} vidas`} className="fc-hearts">{'♥'.repeat(view?.lives || 0)}</span>
      <button className="fc-pause" onClick={pause} disabled={view?.mode !== 'flying'} aria-label="Pausar y releer definición">Ⅱ Pausa</button>
    </div>
    <section className="fc-definition" aria-label="Definición de la pregunta actual" tabIndex={0}>
      <small>BUSCA EL CONCEPTO</small><p>{view?.prompt}</p>
    </section>
    <div ref={stage} className="fc-stage" tabIndex={0} aria-label="Zona de vuelo: toca la tarjeta del concepto correcto"
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' || flight.current?.mode !== 'flying') return;
        event.preventDefault(); dragPointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId); steer(event);
      }} onPointerMove={steer}
      onPointerUp={() => { dragPointer.current = null; }} onPointerCancel={() => { dragPointer.current = null; }}>
      <div className="fc-sky-hills" />
      <div ref={plane} className="fc-plane" hidden={view?.mode === 'crashing'}><PilotCat flying={view?.mode === 'flying'} protected={Boolean(view && view.immunity > 0)} /></div>
      <div ref={card} className="fc-card" hidden />
      {[0, 1, 2].map((index) => <div key={index} className="fc-obstacle" hidden
        ref={(node) => { obstacleNodes.current[index] = node; }} aria-hidden="true">
        <svg viewBox="0 0 80 60"><g className="fc-ob-cloud"><path d="M10 39C-2 18 18 9 30 20C30 1 62 4 61 22C83 15 89 45 68 46H15Z" fill="#6d8594" stroke="#f7efdf" strokeWidth="3"/><path d="M29 44l-6 10m24-10-6 10" stroke="#36566b" strokeWidth="4"/></g>
          <g className="fc-ob-kite"><path d="M39 3L62 25 39 47 16 25Z" fill="#db754c" stroke="#fff5dd" strokeWidth="3"/><path d="M39 3v44M16 25h46M39 47q12 6 0 12" fill="none" stroke="#36566b" strokeWidth="2"/></g>
          <g className="fc-ob-balloon"><ellipse cx="40" cy="24" rx="20" ry="22" fill="#ddb757" stroke="#fff5dd" strokeWidth="3"/><path d="M31 44v11h18V44" fill="#9a5939" stroke="#fff5dd" strokeWidth="2"/></g>
        </svg></div>)}
      {view && view.immunity > 0 && view.mode === 'flying' && <div className="fc-immunity" role="status">Escudo · {view.immunity} s</div>}
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
      {view && ['reading', 'feedback', 'paused'].includes(view.mode) && <div className="fc-overlay">
        <section className="fc-dialog" role="dialog" aria-modal="true" aria-labelledby="fc-dialog-heading">
          <p className="fc-kicker">{view.mode === 'feedback' ? 'Explicación · vuelo en pausa' : 'Lee con calma · el cielo está en pausa'}</p>
          <h2 id="fc-dialog-heading">{view.mode === 'feedback' ? (view.feedback?.isCorrect ? '¡Concepto correcto!' : 'Vamos a aprenderlo')
            : view.mode === 'paused' ? 'Vuelo en pausa' : `Definición ${view.index + 1}`}</h2>
          <div className="fc-dialog-body">
            {view.mode === 'feedback' ? <>
              <p>Tu elección: <strong>{view.feedback?.selectedAnswer}</strong></p>
              <p>Concepto correcto: <strong>{view.feedback?.correctAnswer}</strong></p>
              <p className="fc-explanation">{view.explanation || 'Relaciona las características de la definición con el concepto correcto.'}</p>
            </> : <><p>{view.prompt}</p><p className="fc-help">Toca con tu avión el concepto correcto. Deja pasar los otros y esquiva los obstáculos. Si una tarjeta se va, volverá a aparecer.</p></>}
          </div>
          <p className="fc-shield-note">Al reanudar tendrás 3 segundos de protección contra obstáculos.</p>
          <button ref={resumeButton} className="fc-button" onClick={resume}>
            {view.mode === 'feedback' ? (view.index + 1 >= content.items.length ? 'Ver mi resultado' : 'Siguiente definición') : 'Continuar vuelo →'}
          </button>
        </section>
      </div>}
    </div>
    {touch ? <div className="fc-touch-controls" aria-label="Controles táctiles de vuelo">
      <span>Desliza en el cielo<br />o usa las flechas</span>
      <div className="fc-pad">{DIRECTIONS.map(({ key, label, arrow }) => <button key={key} data-direction={key}
        aria-label={label} disabled={view?.mode !== 'flying'}
        onPointerDown={(event) => {
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
          heldPointers.current.set(event.pointerId, key); controls.current[key] = true;
        }} onPointerUp={(event) => releaseDirection(event.pointerId)} onPointerCancel={(event) => releaseDirection(event.pointerId)}
        onLostPointerCapture={(event) => releaseDirection(event.pointerId)}>{arrow}</button>)}</div>
    </div> : <footer className="fc-keyboard-help">WASD o flechas para pilotar · P para pausar · Una tarjeta por vez</footer>}
  </div>;
}
