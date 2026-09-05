import { useEffect } from "react";
import { randomSeed, validateImported } from "./lib/core";
import { useStore } from "./store";
import Home from "./components/Home";
import Editor from "./components/Editor";
import GameScreen from "./components/GameScreen";
import { isGameLeaderboard } from "../../shared/leaderboard";

export default function App() {
  const screen = useStore((s) => s.screen);
  const activity = useStore((s) => s.activity);
  const gameKey = useStore((s) => s.gameKey);
  const embedded = new URLSearchParams(window.location.search).get("embed") === "1";

  useEffect(() => {
    if (!embedded) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type === "parkour-race:leaderboard") {
        const board = event.data?.payload;
        if (isGameLeaderboard(board) && board.gameType === 'parkour_race') useStore.getState().setLeaderboard(board);
        return;
      }
      if (event.data?.type !== "parkour-race:load") return;
      const loaded = validateImported(event.data?.payload?.activity);
      if (!loaded) {
        window.parent.postMessage({ type: "parkour-race:error", payload: { message: "Preset de actividad inválido" } }, window.location.origin);
        return;
      }
      const configuredSeed = parseInt(loaded.settings.fixedSeed.replace(/\D/g, ""), 10);
      const seed = loaded.settings.seedMode === "unique" || !configuredSeed ? randomSeed() : configuredSeed;
      const board = event.data?.payload?.leaderboard;
      useStore.getState().setLeaderboard(isGameLeaderboard(board) && board.gameType === 'parkour_race' ? board : null);
      useStore.getState().startGame(loaded, seed);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "parkour-race:ready" }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, [embedded]);

  if (embedded && !activity) {
    return <div className="grid h-full w-full place-items-center bg-[#0B1026] text-sm font-bold text-white">Preparando Parkour Race…</div>;
  }

  if (screen === "editor" && activity) return <Editor key={activity.id} />;
  if (screen === "game" && activity) return <GameScreen key={gameKey} />;
  return <Home />;
}
