import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameRuntime, type HudState } from './GameRuntime';
import { normalizeActivity, randomSeed, type Activity, type Question, type Result } from './core';

type Stage = 'intro' | 'playing' | 'paused' | 'lost' | 'complete';
type QuestionState = { question: Question; seconds: number; deadline: number };
type Verdict = { correct: boolean; feedback: string } | null;

const EMPTY_HUD: HudState = { fragments: 0, required: 1, time: 0, threat: 0, prompt: '', exitOpen: false, sprint: 0 };

function numericSeed(value: string) {
  if (/^\d+$/.test(value)) return Number(value) >>> 0;
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function seedFor(activity: Activity, session: number) {
  return activity.settings.seedMode === 'fixed'
    ? numericSeed(activity.settings.fixedSeed)
    : (randomSeed() ^ activity.createdAt ^ session) >>> 0;
}

function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);
  const completionSent = useRef(false);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [session, setSession] = useState(0);
  const [stage, setStage] = useState<Stage>('intro');
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [questionState, setQuestionState] = useState<QuestionState | null>(null);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [questionSeconds, setQuestionSeconds] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const seed = useMemo(() => activity ? seedFor(activity, session) : 0, [activity, session]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type !== 'backrooms-scape:load') return;
      const normalized = normalizeActivity(event.data?.payload?.activity);
      if (normalized) {
        completionSent.current = false;
        setActivity(normalized);
        setStage('intro');
        setHud({ ...EMPTY_HUD, required: normalized.settings.requiredFragments });
      }
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'backrooms-scape:ready' }, window.location.origin);
    return () => window.removeEventListener('message', receive);
  }, []);

  useEffect(() => {
    if (!activity || !canvasRef.current) return;
    const runtime = new GameRuntime(canvasRef.current, activity, seed, {
      onHud: setHud,
      onQuestion: (question, seconds) => {
        setVerdict(null);
        setQuestionSeconds(Math.ceil(seconds));
        setQuestionState({ question, seconds, deadline: Date.now() + seconds * 1000 });
      },
      onAutoFail: (feedback) => setVerdict({ correct: false, feedback }),
      onPause: () => setStage('paused'),
      onGameOver: () => {
        setQuestionState(null);
        setVerdict(null);
        setStage('lost');
      },
      onComplete: (finalResult) => {
        setResult(finalResult);
        setStage('complete');
        if (!completionSent.current) {
          completionSent.current = true;
          window.parent.postMessage({ type: 'backrooms-scape:complete', payload: finalResult }, window.location.origin);
        }
      },
    });
    runtimeRef.current = runtime;
    return () => {
      runtime.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [activity, seed]);

  useEffect(() => {
    if (!questionState || verdict) return;
    const timer = window.setInterval(() => {
      setQuestionSeconds(Math.max(0, Math.ceil((questionState.deadline - Date.now()) / 1000)));
    }, 200);
    return () => window.clearInterval(timer);
  }, [questionState, verdict]);

  const start = () => {
    setStage('playing');
    runtimeRef.current?.begin();
  };

  const resume = () => {
    setStage('playing');
    runtimeRef.current?.resume();
  };

  const replay = () => {
    completionSent.current = false;
    setResult(null);
    setQuestionState(null);
    setVerdict(null);
    setHud({ ...EMPTY_HUD, required: activity?.settings.requiredFragments || 1 });
    setStage('intro');
    setSession((value) => value + 1);
  };

  const answer = (index: number) => {
    if (verdict) return;
    const response = runtimeRef.current?.answer(index);
    if (response) setVerdict(response);
  };

  const continueAfterAnswer = () => {
    runtimeRef.current?.continueAfterAnswer();
    setQuestionState(null);
    setVerdict(null);
  };

  const close = () => window.parent.postMessage({ type: 'backrooms-scape:close' }, window.location.origin);

  const touch = useCallback((control: 'forward' | 'back' | 'left' | 'right' | 'sprint') => ({
    onPointerDown: (event: React.PointerEvent) => { event.preventDefault(); runtimeRef.current?.setTouch(control, true); },
    onPointerUp: () => runtimeRef.current?.setTouch(control, false),
    onPointerCancel: () => runtimeRef.current?.setTouch(control, false),
    onPointerLeave: () => runtimeRef.current?.setTouch(control, false),
  }), []);

  return (
    <main className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Laberinto tridimensional de Backrooms Scape" />

      {activity && stage !== 'intro' && (
        <header className="hud" aria-live="polite">
          <div className="hud-card"><span>FRAGMENTOS</span><strong>{hud.fragments}/{hud.required}</strong></div>
          <div className="hud-card hud-time"><span>TIEMPO</span><strong>{formatTime(hud.time)}</strong></div>
          <button className="icon-button" disabled={Boolean(questionState)} onClick={() => { runtimeRef.current?.setPaused(true); setStage('paused'); }} aria-label="Pausar juego">Ⅱ</button>
        </header>
      )}

      {stage === 'playing' && (
        <>
          <div className={`threat-vignette ${hud.threat > .65 ? 'is-near' : ''}`} style={{ opacity: hud.threat * .72 }} />
          <aside className="signal-meter"><span>SEÑAL</span><i style={{ width: `${Math.round(hud.threat * 100)}%` }} /></aside>
          {hud.sprint > 0 && <div className="boost">IMPULSO {Math.ceil(hud.sprint)}s</div>}
          {hud.exitOpen && <div className="exit-open">SALIDA DESBLOQUEADA · BUSCA LA LUZ DORADA</div>}
          {hud.prompt && <button className="interact-prompt" onClick={() => runtimeRef.current?.interact()}>{hud.prompt}</button>}
          <div className="crosshair" aria-hidden="true">+</div>
          <div className="mobile-controls" aria-label="Controles táctiles">
            <div className="dpad">
              <button className="up" {...touch('forward')}>▲</button>
              <button className="left" {...touch('left')}>◀</button>
              <button className="down" {...touch('back')}>▼</button>
              <button className="right" {...touch('right')}>▶</button>
            </div>
            <div className="action-pad">
              <button className="sprint-button" {...touch('sprint')}>CORRER</button>
              <button className="use-button" onClick={() => runtimeRef.current?.interact()}>USAR</button>
            </div>
          </div>
        </>
      )}

      {!activity && <section className="overlay"><div className="panel compact"><div className="loader" /><p>Cargando actividad…</p></div></section>}

      {activity && stage === 'intro' && (
        <section className="overlay intro-overlay">
          <div className="panel intro-panel">
            <p className="eyebrow">EXPEDICIÓN EDUCATIVA</p>
            <h1>BACKROOMS <em>SCAPE</em></h1>
            <p className="subject">{activity.subject || activity.title}</p>
            <p>{activity.instructions || 'Explora el laberinto, encuentra las salas seguras y responde correctamente para reunir los fragmentos de salida.'}</p>
            <div className="mission-grid">
              <div><b>{activity.settings.requiredFragments}</b><span>fragmentos</span></div>
              <div><b>{activity.settings.questionTime}s</b><span>por pregunta</span></div>
              <div><b>{activity.settings.difficulty}</b><span>dificultad</span></div>
            </div>
            <div className="instructions"><span>WASD / flechas: moverte</span><span>Mouse: mirar</span><span>E: interactuar</span><span>Shift: correr</span></div>
            <button className="primary-button" onClick={start}>ENTRAR AL LABERINTO</button>
            <button className="text-button" onClick={close}>Cerrar actividad</button>
          </div>
        </section>
      )}

      {questionState && (
        <section className="overlay question-overlay">
          <div className="panel question-panel">
            <div className="question-header">
              <div><p className="eyebrow">SALA SEGURA</p><span>{questionState.question.type === 'true_false' ? 'VERDADERO O FALSO' : 'OPCIÓN MÚLTIPLE'}</span></div>
              <div className={`question-clock ${questionSeconds <= 5 ? 'danger' : ''}`}>{questionSeconds}</div>
            </div>
            <h2>{questionState.question.prompt}</h2>
            <div className="answers">
              {questionState.question.options.map((option, index) => (
                <button key={`${questionState.question.id}-${index}`} disabled={Boolean(verdict)} onClick={() => answer(index)}>
                  <b>{String.fromCharCode(65 + index)}</b><span>{option}</span>
                </button>
              ))}
            </div>
            {verdict && (
              <div className={`feedback ${verdict.correct ? 'correct' : 'incorrect'}`}>
                <strong>{verdict.correct ? '¡Fragmento recuperado!' : questionSeconds <= 0 ? 'Se agotó el tiempo' : 'Respuesta incorrecta'}</strong>
                {activity?.settings.showFeedback && verdict.feedback && <p>{verdict.feedback}</p>}
                <button onClick={continueAfterAnswer}>{verdict.correct ? 'CONTINUAR EXPLORANDO' : 'SALIR DE LA SALA'}</button>
              </div>
            )}
          </div>
        </section>
      )}

      {activity && stage === 'paused' && (
        <section className="overlay"><div className="panel compact"><p className="eyebrow">PAUSA</p><h2>La expedición está detenida</h2><button className="primary-button" onClick={resume}>CONTINUAR</button><button className="text-button" onClick={close}>Salir</button></div></section>
      )}

      {activity && stage === 'lost' && (
        <section className="overlay lost-overlay"><div className="panel compact"><p className="eyebrow">SEÑAL PERDIDA</p><h2>El Merodeador te encontró</h2><p>Observa la señal, muévete entre salas y evita permanecer demasiado tiempo en los pasillos.</p><button className="primary-button" onClick={replay}>INTENTAR DE NUEVO</button><button className="text-button" onClick={close}>Cerrar</button></div></section>
      )}

      {activity && stage === 'complete' && result && (
        <section className="overlay complete-overlay"><div className="panel result-panel"><p className="eyebrow">RUTA DE ESCAPE COMPLETADA</p><h2>¡Encontraste la salida!</h2><div className="result-score"><strong>{result.score}</strong><span>puntos</span></div><div className="result-grid"><div><b>{result.hits}/{result.total}</b><span>aciertos al primer intento</span></div><div><b>{formatTime(result.time)}</b><span>tiempo</span></div><div><b>{result.seedCode}</b><span>código del mapa</span></div></div><p className="saved-note">Tu resultado fue enviado a la plataforma.</p><button className="primary-button" onClick={replay}>JUGAR OTRO MAPA</button><button className="text-button" onClick={close}>Volver a la plataforma</button></div></section>
      )}
    </main>
  );
}
