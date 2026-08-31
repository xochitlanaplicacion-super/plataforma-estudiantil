import { create } from "zustand";
import type { Activity, Question, Results } from "./lib/core";

export type Screen = "home" | "editor" | "game";

export interface MouseCfg {
  invertX: boolean;
  invertY: boolean;
  sens: number;
}

const MOUSE_KEY = "islasaber_mouse_v1";
const MUSIC_MUTED_KEY = "parkour_race_music_muted_v1";

function loadMusicMuted(): boolean {
  try {
    return localStorage.getItem(MUSIC_MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

function loadMouseCfg(): MouseCfg {
  try {
    const raw = localStorage.getItem(MOUSE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      return {
        invertX: !!o.invertX,
        invertY: !!o.invertY,
        sens: Math.min(2.2, Math.max(0.4, Number(o.sens) || 1)),
      };
    }
  } catch {
    /* noop */
  }
  return { invertX: false, invertY: false, sens: 1 };
}

export interface Hud {
  answered: number;
  total: number;
  score: number;
  time: number;
  falls: number;
  checkpoint: number; // índice de checkpoint actual (-1 = inicio)
}

interface GameStore {
  screen: Screen;
  activity: Activity | null;
  seed: number;
  gameKey: number; // fuerza remount del juego

  hud: Hud;
  playing: boolean; // ya pasó la intro / está en juego activo
  prompt: boolean; // mostrar "Pulsa E"
  question: { index: number; total: number } | null; // pregunta abierta
  questionFeedback: "idle" | "wrong" | "correct";
  results: Results | null;
  paused: boolean;
  debug: boolean;
  respawnFlash: number; // contador para fade
  completedStations: boolean[]; // barra de progreso
  runQuestions: Question[]; // preguntas barajadas para ESTA partida
  setRunQuestions: (q: Question[]) => void;
  mouseCfg: MouseCfg;
  setMouseCfg: (p: Partial<MouseCfg>) => void;
  musicMuted: boolean;
  setMusicMuted: (muted: boolean) => void;

  setScreen: (s: Screen) => void;
  startGame: (activity: Activity, seed: number) => void;
  restartSameMap: () => void;
  restartNewMap: (seed: number) => void;
  setHud: (h: Partial<Hud>) => void;
  setPlaying: (b: boolean) => void;
  setPrompt: (b: boolean) => void;
  openQuestion: (index: number, total: number) => void;
  closeQuestion: () => void;
  setQuestionFeedback: (f: "idle" | "wrong" | "correct") => void;
  setResults: (r: Results) => void;
  setPaused: (b: boolean) => void;
  toggleDebug: () => void;
  flashRespawn: () => void;
  setCompleted: (i: number, total: number) => void;
  resetRunUi: (total: number) => void;
}

export const useStore = create<GameStore>((set) => ({
  screen: "home",
  activity: null,
  seed: 1,
  gameKey: 0,

  hud: { answered: 0, total: 0, score: 0, time: 0, falls: 0, checkpoint: -1 },
  playing: false,
  prompt: false,
  question: null,
  questionFeedback: "idle",
  results: null,
  paused: false,
  debug: false,
  respawnFlash: 0,
  completedStations: [],
  runQuestions: [],
  setRunQuestions: (q) => set({ runQuestions: q }),
  mouseCfg: loadMouseCfg(),
  musicMuted: loadMusicMuted(),
  setMusicMuted: (muted) => {
    try {
      localStorage.setItem(MUSIC_MUTED_KEY, String(muted));
    } catch {
      /* noop */
    }
    set({ musicMuted: muted });
  },
  setMouseCfg: (p) =>
    set((st) => {
      const next = { ...st.mouseCfg, ...p };
      next.sens = Math.min(2.2, Math.max(0.4, next.sens));
      try {
        localStorage.setItem(MOUSE_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return { mouseCfg: next };
    }),

  setScreen: (s) => set({ screen: s }),
  startGame: (activity, seed) =>
    set((st) => ({
      screen: "game",
      activity,
      seed,
      gameKey: st.gameKey + 1,
      results: null,
      question: null,
      questionFeedback: "idle",
      paused: false,
      playing: false,
      prompt: false,
    })),
  restartSameMap: () =>
    set((st) => ({
      gameKey: st.gameKey + 1,
      results: null,
      question: null,
      paused: false,
      playing: false,
      prompt: false,
      questionFeedback: "idle",
    })),
  restartNewMap: (seed) =>
    set((st) => ({
      seed,
      gameKey: st.gameKey + 1,
      results: null,
      question: null,
      paused: false,
      playing: false,
      prompt: false,
      questionFeedback: "idle",
    })),
  setHud: (h) => set((st) => ({ hud: { ...st.hud, ...h } })),
  setPlaying: (b) => set({ playing: b }),
  setPrompt: (b) => set({ prompt: b }),
  openQuestion: (index, total) =>
    set({ question: { index, total }, questionFeedback: "idle" }),
  closeQuestion: () => set({ question: null, questionFeedback: "idle" }),
  setQuestionFeedback: (f) => set({ questionFeedback: f }),
  setResults: (r) => set({ results: r, playing: false }),
  setPaused: (b) => set({ paused: b }),
  toggleDebug: () => set((st) => ({ debug: !st.debug })),
  flashRespawn: () => set((st) => ({ respawnFlash: st.respawnFlash + 1 })),
  setCompleted: (i, total) =>
    set((st) => {
      const arr = st.completedStations.length === total ? [...st.completedStations] : new Array(total).fill(false);
      if (i >= 0 && i < total) arr[i] = true;
      return { completedStations: arr };
    }),
  resetRunUi: (total) =>
    set({
      completedStations: new Array(total).fill(false),
      hud: { answered: 0, total, score: 0, time: 0, falls: 0, checkpoint: -1 },
    }),
}));

/** Referencia mutable al juego activo para que la UI lo controle */
export const gameRef: { current: import("./game/game").AdventureGame | null } = {
  current: null,
};
