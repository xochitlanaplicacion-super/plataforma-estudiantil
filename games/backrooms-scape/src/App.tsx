import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackroomsGame, type Difficulty, type MouseConfig, type Snapshot } from "./game/BackroomsGame";
import GameUI from "./components/GameUI";
import { loadMusicMuted } from "./game/music";
import { isGameLeaderboard, type GameLeaderboard } from "../../shared/leaderboard";
import {
  demoActivity,
  normalizeActivity,
  numericSeed,
  randomSeed,
  type PlatformActivity,
  type PlatformResult,
} from "./platform";

const embedded = new URLSearchParams(window.location.search).get("embed") === "1";
const MOUSE_KEY = "backrooms_scape_mouse_v1";

function loadMouseConfig(): MouseConfig {
  try {
    const parsed = JSON.parse(localStorage.getItem(MOUSE_KEY) || "null");
    if (parsed) return {
      invertX: parsed.invertX !== false,
      invertY: parsed.invertY !== false,
      sensitivity: Math.max(0.4, Math.min(2.2, Number(parsed.sensitivity) || 1)),
    };
  } catch {
    /* configuración opcional */
  }
  return { invertX: true, invertY: true, sensitivity: 1 };
}

function platformDifficulty(value: PlatformActivity["settings"]["difficulty"]): Difficulty {
  return value === "easy" ? "facil" : value === "hard" ? "dificil" : "normal";
}

function nextSeed(activity: PlatformActivity): number {
  return activity.settings.seedMode === "fixed" ? numericSeed(activity.settings.fixedSeed) : randomSeed();
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<BackroomsGame | null>(null);
  const completionSent = useRef(false);
  const loadedActivityKey = useRef("");
  const [activity, setActivity] = useState<PlatformActivity | null>(embedded ? null : demoActivity());
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [diff, setDiff] = useState<Difficulty>("normal");
  const [gameVersion, setGameVersion] = useState(0);
  const [mouseConfig, setMouseConfigState] = useState<MouseConfig>(loadMouseConfig);
  const [musicMuted, setMusicMutedState] = useState(loadMusicMuted);
  const [leaderboard, setLeaderboard] = useState<GameLeaderboard | null>(null);
  const mouseConfigRef = useRef(mouseConfig);
  const musicMutedRef = useRef(musicMuted);

  const updateMouseConfig = useCallback((changes: Partial<MouseConfig>) => {
    setMouseConfigState((current) => {
      const next = { ...current, ...changes };
      mouseConfigRef.current = next;
      try { localStorage.setItem(MOUSE_KEY, JSON.stringify(next)); } catch { /* opcional */ }
      gameRef.current?.setMouseConfig(next);
      return next;
    });
  }, []);

  const updateMusicMuted = useCallback((muted: boolean) => {
    musicMutedRef.current = muted;
    setMusicMutedState(muted);
    gameRef.current?.setMusicMuted(muted);
  }, []);

  const initialSeed = useMemo(() => activity ? nextSeed(activity) : 0, [activity, gameVersion]);

  useEffect(() => {
    if (!embedded) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type === "backrooms-scape:leaderboard") {
        const board = event.data?.payload;
        if (isGameLeaderboard(board) && board.gameType === 'backrooms_scape') setLeaderboard(board);
        return;
      }
      if (event.data?.type !== "backrooms-scape:load") return;
      const loaded = normalizeActivity(event.data?.payload?.activity);
      if (!loaded) {
        window.parent.postMessage({ type: "backrooms-scape:error", payload: { message: "Preset de actividad inválido" } }, window.location.origin);
        return;
      }
      const loadKey = JSON.stringify([loaded.id, loaded.createdAt, loaded.settings, loaded.questions]);
      if (loadedActivityKey.current === loadKey) return;
      loadedActivityKey.current = loadKey;
      completionSent.current = false;
      const board = event.data?.payload?.leaderboard;
      setLeaderboard(isGameLeaderboard(board) && board.gameType === 'backrooms_scape' ? board : null);
      setDiff(platformDifficulty(loaded.settings.difficulty));
      setActivity(loaded);
      setGameVersion((value) => value + 1);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "backrooms-scape:ready" }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activity) return;
    const complete = (result: PlatformResult) => {
      if (!embedded || completionSent.current) return;
      completionSent.current = true;
      window.parent.postMessage({ type: "backrooms-scape:complete", payload: result }, window.location.origin);
    };
    const game = new BackroomsGame(canvas, activity, initialSeed, (s) => setSnap({ ...s }), complete);
    game.setMouseConfig(mouseConfigRef.current);
    game.setMusicMuted(musicMutedRef.current);
    gameRef.current = game;
    return () => {
      if (gameRef.current === game) gameRef.current = null;
      game.dispose();
    };
  }, [activity, gameVersion, initialSeed]);

  const start = useCallback(() => {
    gameRef.current?.startRun(diff, initialSeed);
  }, [diff, initialSeed]);

  const restart = useCallback(() => {
    completionSent.current = false;
    gameRef.current?.startRun(diff, activity ? nextSeed(activity) : randomSeed());
  }, [activity, diff]);

  const toMenu = useCallback(() => {
    gameRef.current?.toMenu();
  }, []);

  const close = useCallback(() => {
    if (embedded) window.parent.postMessage({ type: "backrooms-scape:close" }, window.location.origin);
    else gameRef.current?.toMenu();
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full outline-none" />
      {!activity ? <div className="absolute inset-0 grid place-items-center bg-black text-sm font-bold text-amber-100">Preparando Backrooms Scape…</div> :
        <GameUI snap={snap} game={gameRef.current} diff={diff} setDiff={setDiff} activity={activity}
          leaderboard={leaderboard}
          lockDifficulty={embedded} mouseConfig={mouseConfig} onMouseConfigChange={updateMouseConfig}
          musicMuted={musicMuted} onMusicMutedChange={updateMusicMuted}
          onStart={start} onRestart={restart} onMenu={toMenu} onClose={close} />}
    </div>
  );
}
