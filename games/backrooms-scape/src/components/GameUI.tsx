// ------------------------------------------------------------------
// Backrooms Scape — capa de interfaz (HUD, menús, preguntas)
// ------------------------------------------------------------------
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Play,
  RotateCcw,
  Home,
  Zap,
  Shield,
  Waves,
  Map as MapIcon,
  Gem,
  Flame,
  Heart,
  Skull,
  Trophy,
  Keyboard,
  MousePointerClick,
  DoorOpen,
  Flag,
  Wind,
  Timer,
  Sparkles,
  Volume2,
  VolumeX,
  Crown,
  Medal,
} from "lucide-react";
import type { BackroomsGame, Difficulty, BoostId, MouseConfig, Snapshot } from "../game/BackroomsGame";
import type { PlatformActivity } from "../platform";
import { leaderboardTime, rankedEntries, type GameLeaderboard, type LeaderboardCategory } from "../../../shared/leaderboard";

const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
};

const clamp01 = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const BOARD_TABS: { id: LeaderboardCategory; label: string }[] = [
  { id: 'overall', label: 'General' }, { id: 'accuracy', label: 'Calificación' },
  { id: 'score', label: 'Puntos' }, { id: 'time', label: 'Tiempo' },
  { id: 'penalties', label: 'Capturas' },
];

function LeaderboardPanel({ leaderboard }: { leaderboard: GameLeaderboard | null }): ReactNode {
  const [category, setCategory] = useState<LeaderboardCategory>('overall');
  if (!leaderboard) return null;
  const ranked = rankedEntries(leaderboard, category);
  const currentIndex = ranked.findIndex((entry) => entry.isCurrentStudent);
  const rows = ranked.slice(0, 5).map((entry, index) => ({ entry, rank: index + 1 }));
  if (currentIndex >= 5) rows.push({ entry: ranked[currentIndex], rank: currentIndex + 1 });
  return (
    <section className="pointer-events-auto mt-5 w-full max-w-[620px] shrink-0 overflow-hidden rounded-2xl border border-cyan-300/20 bg-black/70 text-left shadow-[0_0_45px_rgba(34,211,238,.10)] backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-cyan-300/10 bg-gradient-to-r from-cyan-400/10 via-amber-300/5 to-transparent px-4 py-3">
        <div className="flex items-center gap-2"><Crown size={19} className="text-amber-300 drop-shadow-[0_0_10px_rgba(252,211,77,.65)]" /><div><h3 className="text-sm font-black tracking-wider text-amber-200">ARCHIVO DE SOBREVIVIENTES</h3><p className="text-[9px] font-bold uppercase tracking-[.16em] text-cyan-200/60">Marcas de esta actividad y tu grupo</p></div></div>
        <span className="rounded border border-cyan-300/15 bg-cyan-300/5 px-2 py-1 font-mono text-[9px] text-cyan-100/70">{leaderboard.participantCount} REGISTROS</span>
      </div>
      <div className="flex gap-1 overflow-x-auto px-3 py-2">
        {BOARD_TABS.map((tab) => <button key={tab.id} type="button" onClick={() => setCategory(tab.id)} className={`whitespace-nowrap rounded px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider ${category === tab.id ? 'border border-cyan-200/50 bg-cyan-300/15 text-cyan-100' : 'border border-white/5 bg-white/[.03] text-white/35'}`}>{tab.label}</button>)}
      </div>
      {rows.length === 0 ? <p className="px-4 py-6 text-center text-xs text-white/40">Todavía no hay sobrevivientes registrados. Tu marca puede ser la primera.</p> : (
        <div className="max-h-[250px] space-y-1 overflow-y-auto px-3 pb-3">
          {rows.map(({ entry, rank }) => (
            <div key={`${entry.name}-${rank}`} className={`grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2 py-2 ${entry.isCurrentStudent ? 'border-cyan-300/60 bg-cyan-300/10' : rank === 1 ? 'border-amber-300/30 bg-amber-300/[.06]' : 'border-white/5 bg-white/[.025]'}`}>
              <span className={`grid h-8 w-8 place-items-center rounded font-mono text-xs font-bold ${rank === 1 ? 'bg-amber-300 text-black' : rank <= 3 ? 'bg-cyan-300/10 text-cyan-200' : 'bg-white/5 text-white/35'}`}>{rank === 1 ? <Crown size={16} /> : rank <= 3 ? <Medal size={15} /> : rank}</span>
              <div className="min-w-0"><p className="truncate text-[11px] font-bold uppercase tracking-wide text-white/90">{entry.name}{entry.isCurrentStudent ? ' · TÚ' : ''}</p><p className="font-mono text-[8px] text-white/30">{entry.hits}/{entry.total} ACIERTOS · {entry.attempts} INTENTO{entry.attempts === 1 ? '' : 'S'}</p></div>
              <div className="grid grid-cols-4 gap-1 text-center">
                {[[`${entry.accuracy}%`,'Nota'],[String(entry.score),'Pts'],[leaderboardTime(entry.time),'Tiempo'],[String(entry.penalties),'Capt.']].map(([value,label]) => <span key={label} className="min-w-11 rounded border border-white/5 bg-black/30 px-1 py-1"><b className="block font-mono text-[9px] text-white/85">{value}</b><small className="block text-[6px] uppercase tracking-wide text-white/25">{label}</small></span>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// --------------------------- Vignette ---------------------------

function Vignette({ threat }: { threat: number }): ReactNode {
  const danger = Math.pow(clamp01(threat, 0, 1), 1.4);
  return (
    <>
      <div className="vg-base" />
      <div className="vg-danger" style={{ opacity: danger * 0.9 }} />
      <div className="vg-pulse" style={{ opacity: threat > 0.72 ? (threat - 0.72) * 3 : 0 }} />
    </>
  );
}

// --------------------------- Marcadores ---------------------------

function Markers({ snap }: { snap: Snapshot }): ReactNode {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {snap.markers.map((m) => {
        let x = m.x;
        let y = m.y;
        if (m.behind) {
          x = 1 - x;
          y = 1.25 - y;
        }
        const edge = m.behind || x < 0.04 || x > 0.96 || y < 0.06 || y > 0.94;
        const cx = clamp01(x, 0.05, 0.95) * 100;
        const cy = clamp01(y, 0.08, 0.9) * 100;
        const scale = clamp01(1.35 - m.dist / 70, 0.55, 1.1);
        return (
          <div
            key={m.id}
            className={`marker ${edge ? "marker-edge" : ""}`}
            style={{ left: `${cx}%`, top: `${cy}%`, transform: `translate(-50%,-100%) scale(${scale})` }}
          >
            <div className="marker-chip" style={{ borderColor: m.color, color: m.color }}>
              {m.icon === "exit" ? <Flag size={13} /> : <DoorOpen size={13} />}
              <span>{m.label}</span>
            </div>
            <div className="marker-tail" style={{ background: m.color }} />
          </div>
        );
      })}
    </div>
  );
}

// --------------------------- Minimapa ---------------------------

function Minimap({ game, visible }: { game: BackroomsGame | null; visible: boolean }): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!visible || !game) return;
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const draw = (): void => {
      const data = game.getMinimap();
      if (!data) return;
      const s = cv.width / data.gw;
      ctx.fillStyle = "rgba(8,6,3,0.92)";
      ctx.fillRect(0, 0, cv.width, cv.height);
      for (let r = 0; r < data.gh; r++) {
        for (let c = 0; c < data.gw; c++) {
          ctx.fillStyle = data.solid[r][c] ? "#2a2210" : "#0e0a05";
          ctx.fillRect(c * s + 0.4, r * s + 0.4, s - 0.8, s - 0.8);
        }
      }
      for (const room of data.rooms) {
        ctx.fillStyle =
          room.state === "locked" ? "#ff4444" : room.state === "done" ? "#4ade80" : "#37e0ff";
        ctx.beginPath();
        ctx.arc((room.c + 0.5) * s, (room.r + 0.5) * s, s * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = data.exit.active ? "#b26bff" : "#4a3a66";
      ctx.fillRect(data.exit.c * s + s * 0.15, data.exit.r * s + s * 0.15, s * 0.7, s * 0.7);
      // jugador
      ctx.save();
      ctx.translate((data.player.c + 0.5) * s, (data.player.r + 0.5) * s);
      ctx.rotate(Math.PI - data.player.ang);
      ctx.fillStyle = "#ffd84d";
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.55);
      ctx.lineTo(s * 0.4, s * 0.45);
      ctx.lineTo(-s * 0.4, s * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    draw();
    const id = setInterval(draw, 200);
    return () => clearInterval(id);
  }, [visible, game]);
  if (!visible) return null;
  return (
    <div className="minimap">
      <canvas ref={ref} width={184} height={184} />
      <div className="minimap-tag">
        <MapIcon size={11} /> MAPA
      </div>
    </div>
  );
}

// --------------------------- HUD ---------------------------

const BOOST_META: Record<BoostId, { icon: ReactNode; key: string }> = {
  sprint: { icon: <Zap size={17} />, key: "1" },
  shield: { icon: <Shield size={17} />, key: "2" },
  pulse: { icon: <Waves size={17} />, key: "3" },
  map: { icon: <MapIcon size={17} />, key: "4" },
};

function HUD({ snap, game }: { snap: Snapshot; game: BackroomsGame | null }): ReactNode {
  const heartRate = 1.15 - snap.threat * 0.8;
  return (
    <>
      {/* superior */}
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <div className="chip">
          {Array.from({ length: snap.fragmentsNeeded }).map((_, i) => (
            <Gem
              key={i}
              size={18}
              className={i < snap.fragments ? "text-amber-300" : "text-white/20"}
              fill={i < snap.fragments ? "#fcd34d" : "none"}
            />
          ))}
          <span className="ml-1 text-xs font-bold tracking-widest text-white/70">
            {snap.fragments}/{snap.fragmentsNeeded}
          </span>
        </div>
        {snap.streak > 1 && (
          <div className="chip text-orange-300">
            <Flame size={15} fill="#fb923c" />
            <span className="text-xs font-bold">RACHA x{snap.streak}</span>
          </div>
        )}
        <div className="chip text-white/70">
          <Sparkles size={13} className="text-cyan-300" />
          <span className="max-w-[230px] text-[11px] leading-tight">{snap.objective}</span>
        </div>
      </div>

      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <div className="chip">
          <Timer size={14} className="text-white/60" />
          <span className="font-mono text-sm font-bold text-white/90">{fmtTime(snap.time)}</span>
        </div>
        <div className="chip">
          <span className="text-[10px] tracking-[0.25em] text-white/50">PTS</span>
          <span className="font-mono text-sm font-bold text-amber-300">{snap.score}</span>
        </div>
      </div>

      {/* corazón de amenaza */}
      {snap.threat > 0.18 && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2">
          <Heart
            size={26 + snap.threat * 14}
            fill="#ff2233"
            className="drop-shadow-[0_0_18px_rgba(255,34,51,0.9)]"
            style={{ animation: `heartbeat ${Math.max(0.32, heartRate)}s ease-in-out infinite` }}
          />
        </div>
      )}

      {/* inferior */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Wind size={14} className={snap.speedActive ? "text-cyan-300" : "text-white/40"} />
          <div className="bar-outer">
            <div
              className={`bar-inner ${snap.stamina < 0.25 ? "bar-tired" : ""}`}
              style={{ width: `${Math.round(snap.stamina * 100)}%` }}
            />
          </div>
        </div>
        {snap.shieldActive && (
          <div className="chip text-cyan-300">
            <Shield size={13} />
            <span className="text-[10px] font-bold">ESCUDO ACTIVO</span>
          </div>
        )}
      </div>

      <div className="absolute bottom-4 right-4 flex gap-2">
        {snap.boosts.map((b) => (
          <button
            key={b.id}
            onClick={() => game?.useBoost(["sprint", "shield", "pulse", "map"].indexOf(b.id))}
            className={`boost-slot ${b.active ? "boost-active" : ""} ${b.count === 0 ? "boost-empty" : ""}`}
          >
            <span className="boost-key">{BOOST_META[b.id].key}</span>
            {BOOST_META[b.id].icon}
            <span className="text-[9px] font-bold tracking-wider">{b.name}</span>
            <span className="boost-count">{b.count}</span>
          </button>
        ))}
      </div>

      <Minimap game={game} visible={snap.mapVisible} />
      <Markers snap={snap} />
    </>
  );
}

// --------------------------- Toasts ---------------------------

function Toasts({ snap }: { snap: Snapshot }): ReactNode {
  return (
    <div className="pointer-events-none absolute bottom-40 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
      {snap.toasts.slice(-4).map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// --------------------------- Pregunta ---------------------------

function QuestionModal({ snap, onAnswer, onContinue }: { snap: Snapshot; onAnswer: (i: number) => void; onContinue: () => void }): ReactNode {
  const q = snap.question;
  if (!q) return null;
  const pct = (q.timeLeft / q.total) * 100;
  const low = q.timeLeft < 6;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
      <div className="modal-card w-[min(620px,92vw)]">
        <div className="mb-3 flex items-center justify-between">
          <span className="chip !border-cyan-400/50 text-cyan-300">
            <DoorOpen size={13} />
            <span className="text-[10px] font-bold tracking-widest">{q.roomLabel.toUpperCase()} — ESTÁS A SALVO</span>
          </span>
          <span className="chip text-white/60">{q.cat}</span>
        </div>
        <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-[width] duration-150 ${low ? "bg-red-500" : "bg-cyan-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <h2 className="mb-6 text-center text-2xl font-bold leading-snug text-white md:text-[1.7rem]">
          {q.text}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {q.options.map((op, i) => (
            <button key={i} className="opt-btn" disabled={Boolean(snap.answerFeedback)} onClick={() => onAnswer(i)}>
              <span className="opt-num">{i + 1}</span>
              <span>{op}</span>
            </button>
          ))}
        </div>
        {snap.answerFeedback && (
          <div className={`mt-5 rounded-2xl border p-4 text-center ${snap.answerFeedback.correct ? "border-emerald-400/50 bg-emerald-500/10" : "border-red-400/50 bg-red-500/10"}`}>
            <p className={`text-lg font-black ${snap.answerFeedback.correct ? "text-emerald-300" : "text-red-300"}`}>
              {snap.answerFeedback.correct ? "¡Respuesta correcta!" : snap.answerFeedback.timeout ? "Se agotó el tiempo" : "Respuesta incorrecta"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              {snap.answerFeedback.explanation || `La respuesta correcta es: ${snap.answerFeedback.correctAnswer}.`}
            </p>
            <button className="btn-main mt-4 !px-6 !py-3" onClick={onContinue}>
              {snap.answerFeedback.correct ? "CONTINUAR EXPLORANDO" : "SALIR DE LA SALA"}
            </button>
          </div>
        )}
        <p className="mt-4 text-center text-[11px] text-white/40">
          Responde antes de que se agote el tiempo · si fallas, la sala te expulsa y la puerta se bloquea
        </p>
      </div>
    </div>
  );
}

// --------------------------- Menú ---------------------------

const DIFF_LABELS: { id: Difficulty; label: string; desc: string }[] = [
  { id: "facil", label: "Fácil", desc: "Más tiempo, Merodeador lento" },
  { id: "normal", label: "Normal", desc: "La experiencia estándar" },
  { id: "dificil", label: "Difícil", desc: "Rápido, implacable" },
];

function ControlSettings({ mouseConfig, onMouseConfigChange, musicMuted, onMusicMutedChange }: {
  mouseConfig: MouseConfig;
  onMouseConfigChange: (changes: Partial<MouseConfig>) => void;
  musicMuted: boolean;
  onMusicMutedChange: (muted: boolean) => void;
}): ReactNode {
  return (
    <div className="pointer-events-auto mt-4 w-full max-w-[430px] rounded-2xl border border-white/15 bg-black/45 p-3 backdrop-blur-md">
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className={`btn-ghost !justify-center !px-2 !py-2 text-[11px] ${mouseConfig.invertX ? "!border-cyan-300/70 !text-cyan-200" : ""}`}
          onClick={() => onMouseConfigChange({ invertX: !mouseConfig.invertX })}>
          Invertir X {mouseConfig.invertX ? "ON" : "OFF"}
        </button>
        <button type="button" className={`btn-ghost !justify-center !px-2 !py-2 text-[11px] ${mouseConfig.invertY ? "!border-cyan-300/70 !text-cyan-200" : ""}`}
          onClick={() => onMouseConfigChange({ invertY: !mouseConfig.invertY })}>
          Invertir Y {mouseConfig.invertY ? "ON" : "OFF"}
        </button>
        <button type="button" className="btn-ghost !justify-center !px-2 !py-2 text-[11px]"
          aria-label={musicMuted ? "Activar música" : "Silenciar música"} onClick={() => onMusicMutedChange(!musicMuted)}>
          {musicMuted ? <VolumeX size={15} /> : <Volume2 size={15} />} {musicMuted ? "OFF" : "ON"}
        </button>
      </div>
      <label className="mt-3 block text-left text-[10px] font-bold uppercase tracking-widest text-white/45">
        Sensibilidad ×{mouseConfig.sensitivity.toFixed(1)}
        <input className="mt-1 w-full accent-cyan-300" type="range" min={0.4} max={2.2} step={0.1}
          value={mouseConfig.sensitivity} onChange={(event) => onMouseConfigChange({ sensitivity: Number(event.target.value) })} />
      </label>
    </div>
  );
}

function Menu({
  diff,
  setDiff,
  activity,
  lockDifficulty,
  mouseConfig,
  onMouseConfigChange,
  musicMuted,
  onMusicMutedChange,
  onStart,
  onClose,
  leaderboard,
}: {
  diff: Difficulty;
  setDiff: (d: Difficulty) => void;
  activity: PlatformActivity;
  lockDifficulty: boolean;
  mouseConfig: MouseConfig;
  onMouseConfigChange: (changes: Partial<MouseConfig>) => void;
  musicMuted: boolean;
  onMusicMutedChange: (muted: boolean) => void;
  onStart: () => void;
  onClose: () => void;
  leaderboard: GameLeaderboard | null;
}): ReactNode {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-black/55 via-black/35 to-black/70 px-4 py-5">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.45em] text-amber-200/70">
        <Sparkles size={13} /> NIVEL 0 — LOS BACKROOMS <Sparkles size={13} />
      </div>
      <h1 className="title-font title-flicker text-center leading-none">
        BACKROOMS
        <span className="block text-amber-300">SCAPE</span>
      </h1>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">{activity.subject} · {activity.title}</p>
      <p className="mt-3 max-w-xl text-center text-sm leading-relaxed text-white/60">{activity.instructions}</p>
      <LeaderboardPanel leaderboard={leaderboard} />

      <div className="mt-7 flex gap-2">
        {DIFF_LABELS.filter((d) => !lockDifficulty || d.id === diff).map((d) => (
          <button
            key={d.id}
            onClick={() => { if (!lockDifficulty) setDiff(d.id); }}
            className={`diff-pill ${diff === d.id ? "diff-on" : ""}`}
          >
            <span className="text-sm font-bold">{d.label}</span>
            <span className="text-[10px] opacity-60">{d.desc}</span>
          </button>
        ))}
      </div>

      <ControlSettings mouseConfig={mouseConfig} onMouseConfigChange={onMouseConfigChange}
        musicMuted={musicMuted} onMusicMutedChange={onMusicMutedChange} />

      <button onClick={onStart} className="btn-main mt-5">
        <Play size={22} fill="currentColor" />
        ENTRAR A LOS BACKROOMS
      </button>
      <button onClick={onClose} className="btn-ghost mt-3"><Home size={16} /> VOLVER A LA PLATAFORMA</button>

      <div className="mt-9 grid max-w-lg grid-cols-2 gap-x-8 gap-y-2 text-[11px] text-white/45">
        <span className="flex items-center gap-2">
          <Keyboard size={13} className="text-amber-200/70" /> WASD — moverse
        </span>
        <span className="flex items-center gap-2">
          <MousePointerClick size={13} className="text-amber-200/70" /> Ratón — cámara
        </span>
        <span className="pl-5">SHIFT — esprintar · ESPACIO — saltar</span>
        <span className="pl-5">1–4 — usar boosts · P — pausa</span>
      </div>
    </div>
  );
}

// --------------------------- Pausa / Fin ---------------------------

function PauseOverlay({ onResume, onMenu, mouseConfig, onMouseConfigChange, musicMuted, onMusicMutedChange }: {
  onResume: () => void;
  onMenu: () => void;
  mouseConfig: MouseConfig;
  onMouseConfigChange: (changes: Partial<MouseConfig>) => void;
  musicMuted: boolean;
  onMusicMutedChange: (muted: boolean) => void;
}): ReactNode {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="modal-card max-h-[90%] overflow-y-auto w-[min(420px,92vw)] text-center">
        <h2 className="title-font mb-1 text-4xl text-amber-300">PAUSA</h2>
        <p className="mb-6 text-xs text-white/50">El Merodeador espera paciente…</p>
        {navigator.maxTouchPoints > 0 && <button className="btn-ghost w-full justify-center" onClick={() => window.dispatchEvent(new Event('touch-settings:backrooms-scape'))}>Ajustar controles táctiles</button>}
        <ControlSettings mouseConfig={mouseConfig} onMouseConfigChange={onMouseConfigChange}
          musicMuted={musicMuted} onMusicMutedChange={onMusicMutedChange} />
        <button onClick={onResume} className="btn-main mb-3 mt-4 w-full justify-center">
          <Play size={18} fill="currentColor" /> CONTINUAR
        </button>
        <button onClick={onMenu} className="btn-ghost w-full justify-center">
          <Home size={16} /> Salir al menú
        </button>
      </div>
    </div>
  );
}

function EndOverlay({
  snap,
  onRestart,
  onMenu,
  leaderboard,
}: {
  snap: Snapshot;
  onRestart: () => void;
  onMenu: () => void;
  leaderboard: GameLeaderboard | null;
}): ReactNode {
  const win = snap.mode === "win";
  const st = snap.stats;
  if (!st) return win ? null : <div className="vg-death" />;
  const rows: [string, string][] = [
    ["Tiempo", fmtTime(st.time)],
    ["Puntuación", `${st.score}`],
    ["Aciertos", `${st.correct}`],
    ["Fallos", `${st.wrong}`],
    ["Fragmentos", `${st.fragments}/${snap.fragmentsNeeded}`],
    ["Mejor racha", `x${st.bestStreak}`],
  ];
  return (
    <div className={`absolute inset-0 z-30 flex items-center justify-center overflow-y-auto py-4 backdrop-blur-sm ${win ? "bg-black/55" : "bg-red-950/40"}`}>
      <div className="modal-card max-h-[94vh] w-[min(620px,92vw)] overflow-y-auto text-center">
        <div className="mb-2 flex justify-center">
          {win ? (
            <Trophy size={54} className="text-amber-300 drop-shadow-[0_0_25px_rgba(252,211,77,0.7)]" />
          ) : (
            <Skull size={54} className="text-red-500 drop-shadow-[0_0_25px_rgba(239,68,68,0.7)]" />
          )}
        </div>
        <h2 className={`title-font text-4xl leading-tight ${win ? "text-amber-300" : "text-red-500"}`}>
          {win ? "¡ESCAPASTE!" : "TE ATRAPÓ\nEL MERODEADOR"}
        </h2>
        <p className="mb-5 mt-1 text-xs text-white/50">
          {win ? "El portal se cierra tras de ti. Esta vez." : "Solo sentiste su presencia… hasta que fue demasiado tarde."}
        </p>
        <div className="mb-6 grid grid-cols-2 gap-2">
          {rows.map(([k, v]) => (
            <div key={k} className="stat-cell">
              <span className="text-[9px] tracking-[0.2em] text-white/40">{k.toUpperCase()}</span>
              <span className="font-mono text-lg font-bold text-white/90">{v}</span>
            </div>
          ))}
        </div>
        <LeaderboardPanel leaderboard={leaderboard} />
        <button onClick={onRestart} className="btn-main mb-3 w-full justify-center">
          <RotateCcw size={18} /> {win ? "JUGAR OTRA VEZ" : "REINTENTAR"}
        </button>
        <button onClick={onMenu} className="btn-ghost w-full justify-center">
          <Home size={16} /> Volver al menú
        </button>
      </div>
    </div>
  );
}

// --------------------------- Raíz UI ---------------------------

export default function GameUI({
  snap,
  game,
  diff,
  setDiff,
  activity,
  leaderboard,
  lockDifficulty,
  mouseConfig,
  onMouseConfigChange,
  musicMuted,
  onMusicMutedChange,
  onStart,
  onRestart,
  onMenu,
  onClose,
}: {
  snap: Snapshot | null;
  game: BackroomsGame | null;
  diff: Difficulty;
  setDiff: (d: Difficulty) => void;
  activity: PlatformActivity;
  leaderboard: GameLeaderboard | null;
  lockDifficulty: boolean;
  mouseConfig: MouseConfig;
  onMouseConfigChange: (changes: Partial<MouseConfig>) => void;
  musicMuted: boolean;
  onMusicMutedChange: (muted: boolean) => void;
  onStart: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onClose: () => void;
}): ReactNode {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const fn = (): void => setLocked(document.pointerLockElement !== null);
    document.addEventListener("pointerlockchange", fn);
    return () => document.removeEventListener("pointerlockchange", fn);
  }, []);

  const mode = snap?.mode ?? "menu";

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-body">
      {/* capas globales */}
      <div className="scanlines" />
      <div className="noise-overlay" />
      {snap && <Vignette threat={snap.threat} />}
      {snap?.flash && (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-100"
          style={{ background: snap.flash.color, opacity: snap.flash.a * 0.55 }}
        />
      )}

      {mode === "menu" && <Menu diff={diff} setDiff={setDiff} activity={activity} lockDifficulty={lockDifficulty}
        leaderboard={leaderboard}
        mouseConfig={mouseConfig} onMouseConfigChange={onMouseConfigChange}
        musicMuted={musicMuted} onMusicMutedChange={onMusicMutedChange} onStart={onStart} onClose={onClose} />}

      {(mode === "play" || mode === "question" || mode === "feedback" || mode === "paused") && snap && (
        <>
          <HUD snap={snap} game={game} />
          <Toasts snap={snap} />
        </>
      )}

      {mode === "play" && !locked && navigator.maxTouchPoints === 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
          <div className="chip animate-pulse">
            <MousePointerClick size={13} className="text-amber-300" />
            <span className="text-[11px] text-white/80">Haz clic en la pantalla para capturar el ratón</span>
          </div>
        </div>
      )}

      {(mode === "question" || mode === "feedback") && snap && <QuestionModal snap={snap} onAnswer={(i) => game?.answer(i)} onContinue={() => game?.continueAfterAnswer()} />}
      {mode === "paused" && <PauseOverlay onResume={() => game?.resume()} onMenu={onMenu}
        mouseConfig={mouseConfig} onMouseConfigChange={onMouseConfigChange}
        musicMuted={musicMuted} onMusicMutedChange={onMusicMutedChange} />}
      {(mode === "dead" || mode === "win") && snap && (
        <EndOverlay snap={snap} onRestart={onRestart} onMenu={onMenu} leaderboard={leaderboard} />
      )}
    </div>
  );
}
