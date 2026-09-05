import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Flag,
  Keyboard,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  Home as HomeIcon,
  Trophy,
  XCircle,
  MousePointer2,
  Pencil,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useStore, gameRef } from "../store";
import { AdventureGame } from "../game/game";
import { fmtTime, randomSeed, seedCode } from "../lib/core";
import { cn } from "../utils/cn";
import { sfx } from "../game/sfx";
import { gameMusic } from "../game/music";

function leaveGame(fallback: () => void) {
  if (window.parent !== window) {
    window.parent.postMessage({ type: "parkour-race:close" }, window.location.origin);
    return;
  }
  fallback();
}

function MusicToggle({ compact = false }: { compact?: boolean }) {
  const muted = useStore((s) => s.musicMuted);
  const setMusicMuted = useStore((s) => s.setMusicMuted);

  const toggle = () => {
    const next = !muted;
    sfx.ui();
    setMusicMuted(next);
    gameMusic.setMuted(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={muted ? "Activar música" : "Silenciar música"}
      aria-pressed={muted}
      title={muted ? "Activar música" : "Silenciar música"}
      className={cn(
        "btn-candy pointer-events-auto inline-flex items-center justify-center gap-2 border border-white/15 bg-[#0B1026]/60 font-bold text-white backdrop-blur-md",
        compact ? "h-10 w-10 rounded-xl" : "w-full rounded-2xl px-5 py-3"
      )}
    >
      {muted ? <VolumeX size={18} className="text-slate-300" /> : <Volume2 size={18} className="text-[#7BE3D1]" />}
      {!compact && <span>{muted ? "Música desactivada" : "Música activada"}</span>}
    </button>
  );
}

function MouseSettings({ className = "" }: { className?: string }) {
  const mouseCfg = useStore((s) => s.mouseCfg);
  const setMouseCfg = useStore((s) => s.setMouseCfg);
  return (
    <div className={cn("rounded-2xl bg-white/5 p-3 text-left", className)}>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
        <MousePointer2 size={12} /> Ratón
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setMouseCfg({ invertX: !mouseCfg.invertX })}
          className={cn("btn-candy rounded-xl px-3 py-2 text-xs font-extrabold transition", mouseCfg.invertX ? "bg-[#4DD6C1]/80 text-[#06281F]" : "bg-white/10 text-slate-300")}>
          Invertir X {mouseCfg.invertX ? "ON" : "OFF"}
        </button>
        <button type="button" onClick={() => setMouseCfg({ invertY: !mouseCfg.invertY })}
          className={cn("btn-candy rounded-xl px-3 py-2 text-xs font-extrabold transition", mouseCfg.invertY ? "bg-[#4DD6C1]/80 text-[#06281F]" : "bg-white/10 text-slate-300")}>
          Invertir Y {mouseCfg.invertY ? "ON" : "OFF"}
        </button>
      </div>
      <label className="mt-2.5 block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Sensibilidad ×{mouseCfg.sens.toFixed(1)}</span>
        <input type="range" min={0.4} max={2.2} step={0.1} value={mouseCfg.sens}
          onChange={(event) => setMouseCfg({ sens: parseFloat(event.target.value) })} className="w-full accent-[#4DD6C1]" />
      </label>
    </div>
  );
}

export default function GameScreen() {
  const activity = useStore((s) => s.activity);
  const seed = useStore((s) => s.seed);
  const gameKey = useStore((s) => s.gameKey);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !activity) return;
    let game: AdventureGame | null = null;
    try {
      game = new AdventureGame(canvasRef.current, activity, seed, {
        onFatal: (msg) => setFatalError(msg),
      });
      gameRef.current = game;
    } catch (err) {
      console.error("[IslaSaber] fallo al iniciar el juego:", err);
      setFatalError(err instanceof Error ? err.message : String(err));
    }
    return () => {
      gameRef.current = null;
      game?.dispose();
    };
  }, [activity, seed, gameKey]);

  if (!activity) return null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0B1026]">
      <canvas ref={canvasRef} className="h-full w-full touch-none" />
      <Hud />
      <PromptOverlay canvasRef={canvasRef} />
      <IntroOverlay />
      <PauseMenu />
      <QuestionModal />
      <ResultsScreen />
      <RespawnFlash />
      <DebugPanel />
      {fatalError && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[#0B1026]/90">
          <div className="mx-4 max-w-md rounded-3xl border border-red-400/40 bg-[#171D42] p-6 text-center text-white">
            <p className="font-display text-xl font-extrabold text-red-300">No se pudo iniciar la aventura</p>
            <p className="mt-2 break-words rounded-xl bg-black/40 p-3 font-mono text-xs text-red-200">{fatalError}</p>
            <button
              onClick={() => leaveGame(() => useStore.getState().setScreen("home"))}
              className="btn-candy mt-4 rounded-2xl bg-white/10 px-6 py-3 text-sm font-bold"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- HUD ---------------- */

function Hud() {
  const hud = useStore((s) => s.hud);
  const activity = useStore((s) => s.activity);
  const completed = useStore((s) => s.completedStations);
  const playing = useStore((s) => s.playing);
  const results = useStore((s) => s.results);
  const seed = useStore((s) => s.seed);

  if (!playing && !results) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* superior izquierda: título */}
      <div className="absolute left-4 top-4 anim-slide-up">
        <div className="rounded-2xl border border-white/15 bg-[#0B1026]/60 px-4 py-2.5 backdrop-blur-md">
          <p className="font-display text-sm font-extrabold leading-tight text-white">{activity?.title}</p>
          <p className="text-[11px] font-semibold text-[#7BE3D1]">MAPA #{seedCode(seed)}</p>
        </div>
      </div>

      {/* superior centro: progreso de estaciones */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 anim-slide-up" style={{ animationDelay: "0.05s" }}>
        <div className="flex items-center gap-1.5 rounded-2xl border border-white/15 bg-[#0B1026]/60 px-4 py-3 backdrop-blur-md">
          <Flag size={14} className="mr-1 text-[#7BE3D1]" />
          {completed.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold transition-all",
                  c
                    ? "bg-emerald-400 text-[#06281F]"
                    : i === hud.answered
                      ? "anim-pulse-ring bg-[#FFB84D] text-[#331B00]"
                      : "bg-white/15 text-slate-300"
                )}
              >
                {c ? "✓" : i + 1}
              </span>
              {i < completed.length - 1 && <span className={cn("h-0.5 w-3 rounded-full", c ? "bg-emerald-400" : "bg-white/15")} />}
            </div>
          ))}
          <Trophy size={14} className="ml-1 text-[#FFB84D]" />
        </div>
      </div>

      {/* superior derecha: score y tiempo */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2 anim-slide-up" style={{ animationDelay: "0.1s" }}>
        <div className="rounded-2xl border border-white/15 bg-[#0B1026]/60 px-4 py-2 text-right backdrop-blur-md">
          <p className="font-display text-lg font-extrabold leading-none text-[#FFD166]">{hud.score}<span className="ml-1 text-[10px] text-slate-300">PTS</span></p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-[#0B1026]/60 px-4 py-1.5 backdrop-blur-md">
          <p className="font-mono text-sm font-bold tabular-nums text-white">{fmtTime(hud.time)}</p>
        </div>
        <MusicToggle compact />
      </div>

      {/* inferior izquierda: checkpoint */}
      <div className="absolute bottom-4 left-4">
        <div className="rounded-2xl border border-white/15 bg-[#0B1026]/60 px-4 py-2 backdrop-blur-md">
          <p className="text-[11px] font-bold text-slate-300">
            Checkpoint: <span className="text-white">{hud.checkpoint < 0 ? "Inicio" : `Estación ${hud.checkpoint + 1}`}</span>
            <span className="ml-3 text-slate-400">Caídas: <span className="text-white">{hud.falls}</span></span>
          </p>
        </div>
      </div>

      {/* inferior derecha: controles */}
      <div className="absolute bottom-4 right-4 hidden md:block">
        <div className="rounded-2xl border border-white/15 bg-[#0B1026]/60 px-4 py-2 backdrop-blur-md">
          <p className="text-[11px] font-semibold text-slate-400">
            <b className="text-slate-200">WASD</b> mover · <b className="text-slate-200">ESPACIO</b> saltar · <b className="text-slate-200">SHIFT</b> sprint · <b className="text-slate-200">E</b> responder · <b className="text-slate-200">R</b> checkpoint · <b className="text-slate-200">ESC</b> pausa
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Prompt "Pulsa E" ---------------- */

function PromptOverlay({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const prompt = useStore((s) => s.prompt);
  const question = useStore((s) => s.question);
  if (!prompt || question) return null;
  void canvasRef;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[22%] z-10 flex justify-center">
      <div className="anim-pop-in flex items-center gap-3 rounded-2xl border border-[#4DD6C1]/40 bg-[#0B1026]/80 px-5 py-3 shadow-xl shadow-[#4DD6C1]/10 backdrop-blur-md">
        <span className="font-display grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#4DD6C1] to-[#5DB9FF] text-base font-extrabold text-[#06281F]">E</span>
        <div>
          <p className="font-display text-sm font-extrabold text-white">Responder pregunta</p>
          <p className="text-[11px] text-slate-300">Pulsa <b>E</b> para abrir la estación</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Intro ---------------- */

function IntroOverlay() {
  const playing = useStore((s) => s.playing);
  const activity = useStore((s) => s.activity);
  const paused = useStore((s) => s.paused);
  if (playing || !activity) return null;
  void paused;
  return (
    <div className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-[#0B1026]/72 py-4 backdrop-blur-[6px]">
      <div className="anim-pop-in mx-4 max-h-[94vh] max-w-lg overflow-y-auto rounded-[28px] border border-white/15 bg-gradient-to-b from-[#171D42] to-[#0E1330] p-8 text-center shadow-2xl">
        <span className="mb-4 inline-grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-[#FF6B8A] to-[#8A7CFF] shadow-xl">
          <Play size={30} className="ml-1 text-white" />
        </span>
        <h2 className="font-display text-3xl font-extrabold text-white">{activity.title}</h2>
        {activity.subject && <p className="mt-1 text-xs font-extrabold uppercase tracking-[0.25em] text-[#7BE3D1]">{activity.subject}</p>}
        {activity.instructions && (
          <p className="mt-4 text-sm leading-relaxed text-slate-300">{activity.instructions}</p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2 text-left">
          {[
            ["WASD", "Moverse"],
            ["RATÓN", "Cámara"],
            ["ESPACIO", "Saltar"],
            ["E", "Responder"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2">
              <span className="font-display rounded-lg bg-white/10 px-2 py-0.5 text-[11px] font-extrabold text-white">{k}</span>
              <span className="text-xs text-slate-300">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <MouseSettings className="mb-3" />
          <MusicToggle />
        </div>
        <button
          onClick={() => {
            sfx.ui();
            gameRef.current?.begin();
          }}
          className="btn-candy font-display mt-6 w-full rounded-2xl bg-gradient-to-r from-[#4DD6C1] to-[#5DB9FF] px-6 py-4 text-lg font-extrabold text-[#06281F] shadow-xl shadow-[#4DD6C1]/30"
        >
          ¡Haz clic para jugar!
        </button>
        <p className="mt-4 rounded-xl border border-[#FFB84D]/30 bg-[#FFB84D]/10 px-3 py-2 text-[12px] font-semibold text-[#FFD9A0]">
          💡 ¿Salto corto? Si rozas el borde de una plataforma, tu personaje se agarrará y trepará solo.
        </p>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <MousePointer2 size={12} /> El ratón se capturará para controlar la cámara · ESC para pausar
        </p>
      </div>
    </div>
  );
}

/* ---------------- Pausa ---------------- */

function PauseMenu() {
  const paused = useStore((s) => s.paused);
  const question = useStore((s) => s.question);
  const results = useStore((s) => s.results);
  const seed = useStore((s) => s.seed);
  const { setScreen, restartSameMap } = useStore();
  if (!paused || question || results) return null;
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#0B1026]/70 backdrop-blur-[6px]">
      <div className="anim-pop-in mx-4 max-h-[90%] overflow-y-auto w-full max-w-sm rounded-[28px] border border-white/15 bg-gradient-to-b from-[#171D42] to-[#0E1330] p-7 text-center shadow-2xl">
        <span className="mb-3 inline-grid h-14 w-14 place-items-center rounded-2xl bg-white/10">
          <Pause size={26} className="text-[#FFB84D]" />
        </span>
        <h2 className="font-display text-2xl font-extrabold">Pausa</h2>
        <p className="mt-1 text-xs text-slate-400">Mapa <span className="font-mono font-bold text-[#7BE3D1]">#{seedCode(seed)}</span></p>
        <div className="mt-5 space-y-2">
          <button
            onClick={() => gameRef.current?.requestLock()}
            className="btn-candy font-display flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4DD6C1] to-[#5DB9FF] px-5 py-3.5 font-extrabold text-[#06281F]"
          >
            <Play size={18} /> Reanudar
          </button>
          <button
            onClick={() => { sfx.ui(); restartSameMap(); }}
            className="btn-candy flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 py-3 font-bold text-white"
          >
            <RotateCcw size={16} /> Reiniciar este mapa
          </button>
          <MusicToggle />
          <button
            onClick={() => { sfx.ui(); leaveGame(() => setScreen("home")); }}
            className="btn-candy flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 py-3 font-bold text-white"
          >
            <HomeIcon size={16} /> {window.parent !== window ? "Volver a la plataforma" : "Salir al inicio"}
          </button>
        </div>
        <MouseSettings className="mt-4" />
        {navigator.maxTouchPoints > 0 && <button className="mt-3 w-full rounded-xl bg-white/10 p-3 font-bold" onClick={() => window.dispatchEvent(new Event('touch-settings:parkour-race'))}>Ajustar controles táctiles</button>}
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <Keyboard size={12} /> Consejo: SHIFT para sprint y R para volver al checkpoint
        </p>
      </div>
    </div>
  );
}

/* ---------------- Modal de pregunta ---------------- */

function QuestionModal() {
  const question = useStore((s) => s.question);
  const runQuestions = useStore((s) => s.runQuestions);
  const feedback = useStore((s) => s.questionFeedback);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    setPicked(null);
  }, [question?.index]);

  if (!question) return null;
  const q = runQuestions[question.index];
  if (!q) return null;
  const showExplainedFeedback = !!useStore.getState().activity?.settings.showFeedback && feedback !== "idle";

  const choose = (i: number) => {
    if (feedback !== "idle") return;
    setPicked(i);
    const res = gameRef.current?.submitAnswer(i);
    if (res === "wrong" && !useStore.getState().activity?.settings.showFeedback) {
      setTimeout(() => setPicked(null), 500);
    }
  };

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#0B1026]/60 backdrop-blur-[4px]">
      <div
        className={cn(
          "anim-pop-in mx-4 w-full max-w-2xl rounded-[28px] border bg-gradient-to-b from-[#171D42] to-[#0E1330] p-7 shadow-2xl transition-colors",
          feedback === "correct" ? "border-emerald-400/60" : feedback === "wrong" ? "border-red-400/60" : "border-white/15",
          feedback === "wrong" && "anim-shake"
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="font-display rounded-xl bg-gradient-to-r from-[#8A7CFF] to-[#5DB9FF] px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-widest">
            Pregunta {question.index + 1} / {question.total}
          </span>
          <span className="text-[11px] font-bold text-slate-400">Responde para abrir el portal</span>
        </div>

        <h2 className="font-display text-2xl font-extrabold leading-snug text-white md:text-[28px]">{q.prompt}</h2>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {q.answers.map((ans, i) => {
            const isPicked = picked === i;
            return (
              <button
                key={i}
                onClick={() => choose(i)}
                className={cn(
                  "btn-candy flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition",
                  feedback === "correct" && i === q.correctIndex
                    ? "border-emerald-400 bg-emerald-500/20"
                    : isPicked && feedback === "wrong"
                      ? "border-red-400 bg-red-500/15"
                      : "border-white/15 bg-white/5 hover:border-[#4DD6C1]/60 hover:bg-[#4DD6C1]/10"
                )}
              >
                <span
                  className={cn(
                    "font-display grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold",
                    feedback === "correct" && i === q.correctIndex
                      ? "bg-emerald-400 text-[#06281F]"
                      : isPicked && feedback === "wrong"
                        ? "bg-red-400 text-white"
                        : "bg-white/10 text-white"
                  )}
                >
                  {["A", "B", "C", "D"][i]}
                </span>
                <span className="text-[15px] font-bold text-white">{ans}</span>
                {feedback === "correct" && i === q.correctIndex && <CheckCircle2 size={20} className="ml-auto shrink-0 text-emerald-300" />}
                {isPicked && feedback === "wrong" && <XCircle size={20} className="ml-auto shrink-0 text-red-300" />}
              </button>
            );
          })}
        </div>

        {showExplainedFeedback && (
          <div className={cn(
            "mt-5 rounded-2xl border px-5 py-4",
            feedback === "correct" ? "border-emerald-400/40 bg-emerald-500/10" : "border-red-400/40 bg-red-500/10"
          )}>
            <p className="font-display text-base font-extrabold text-white">
              {feedback === "correct" ? "¡Respuesta correcta!" : "Revisa la respuesta"}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-200">
              {q.feedback?.trim() || `La respuesta correcta es: ${q.answers[q.correctIndex]}.`}
            </p>
            <button
              onClick={() => {
                if (feedback === "correct") gameRef.current?.continueAfterFeedback();
                else {
                  setPicked(null);
                  gameRef.current?.retryAfterFeedback();
                }
              }}
              className={cn(
                "btn-candy font-display mt-4 w-full rounded-2xl px-5 py-3 font-extrabold",
                feedback === "correct" ? "bg-emerald-400 text-[#06281F]" : "bg-white/10 text-white"
              )}
            >
              {feedback === "correct" ? "Continuar el recorrido" : "Intentar nuevamente"}
            </button>
          </div>
        )}

        {feedback === "wrong" && (
          <p className="anim-fade-in mt-4 text-center text-sm font-bold text-red-300">
            Respuesta incorrecta — ¡inténtalo otra vez!
          </p>
        )}
        {feedback === "correct" && (
          <p className="anim-fade-in mt-4 text-center text-sm font-bold text-emerald-300">
            ¡Correcto! Portal abierto + checkpoint activado
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------- Resultados ---------------- */

function ResultsScreen() {
  const results = useStore((s) => s.results);
  const { restartSameMap, restartNewMap, setScreen } = useStore();
  const embedded = window.parent !== window;
  if (!results) return null;
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#0B1026]/55 backdrop-blur-[3px]">
      <div className="anim-pop-in mx-4 w-full max-w-xl rounded-[30px] border border-[#FFD166]/30 bg-gradient-to-b from-[#1D2450] to-[#0E1330] p-8 text-center shadow-2xl">
        <span className="anim-bob mb-2 inline-grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-[#FFD166] to-[#FF8A5C] shadow-2xl shadow-[#FFD166]/30">
          <Trophy size={38} className="text-[#3A2103]" />
        </span>
        <h2 className="font-display text-3xl font-extrabold text-white">¡Actividad completada!</h2>
        <p className="mt-1 text-sm font-semibold text-[#7BE3D1]">{results.title}</p>

        <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-2.5">
          {[
            ["Puntuación", `${results.score}`],
            ["Precisión", `${results.accuracy}%`],
            ["Tiempo", fmtTime(results.time)],
            ["Correctas", `${results.answered}/${results.total}`],
            ["Fallos", `${results.wrong}`],
            ["Caídas", `${results.falls}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white/5 px-3 py-3">
              <p className="font-display text-lg font-extrabold leading-tight text-white">{v}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{k}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Código de mapa</span>
          <span className="font-mono text-base font-extrabold tracking-[0.3em] text-[#7BE3D1]">#{results.seedCode}</span>
        </div>

        <div className="mt-6 grid gap-2">
          <button
            onClick={() => { sfx.ui(); restartNewMap(randomSeed()); }}
            className="btn-candy font-display flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4DD6C1] to-[#5DB9FF] px-5 py-3.5 font-extrabold text-[#06281F] shadow-xl shadow-[#4DD6C1]/25"
          >
            <Shuffle size={18} /> Nuevo mapa aleatorio (misma actividad)
          </button>
          <div className={cn("grid gap-2", embedded ? "grid-cols-2" : "grid-cols-3")}>
            <button
              onClick={() => { sfx.ui(); restartSameMap(); }}
              className="btn-candy flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold"
            >
              <RotateCcw size={15} /> Repetir mapa
            </button>
            {!embedded && (
              <button
                onClick={() => { sfx.ui(); setScreen("editor"); }}
                className="btn-candy flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold"
              >
                <Pencil size={15} /> Editor
              </button>
            )}
            <button
              onClick={() => { sfx.ui(); leaveGame(() => setScreen("home")); }}
              className="btn-candy flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold"
            >
              <HomeIcon size={15} /> {embedded ? "Volver" : "Inicio"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Flash de respawn ---------------- */

function RespawnFlash() {
  const flash = useStore((s) => s.respawnFlash);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (flash === 0) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 350);
    return () => clearTimeout(t);
  }, [flash]);
  if (!visible) return null;
  return <div className="anim-fade-in pointer-events-none absolute inset-0 z-40 bg-[#0B1026]" style={{ animationDuration: "0.35s", animationDirection: "reverse" }} />;
}

/* ---------------- Debug ---------------- */

function DebugPanel() {
  const debug = useStore((s) => s.debug);
  const [info, setInfo] = useState("");
  useEffect(() => {
    if (!debug) return;
    const id = setInterval(() => {
      setInfo(gameRef.current?.getDebugInfo() ?? "");
    }, 250);
    return () => clearInterval(id);
  }, [debug]);
  if (!debug) return null;
  return (
    <pre className="absolute bottom-16 left-4 z-50 rounded-xl border border-white/20 bg-black/70 p-3 font-mono text-[11px] leading-relaxed text-emerald-300">
      {info}
    </pre>
  );
}
