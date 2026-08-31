/* ============================================================
   Núcleo de datos: tipos, PRNG determinístico, demo y storage
   ============================================================ */

export interface Question {
  id: string;
  prompt: string;
  answers: string[]; // 4 opciones
  correctIndex: number;
  feedback?: string;
}

export type MapSize = "small" | "medium" | "large" | "custom";
export type Difficulty = "easy" | "normal" | "hard";
export type ParkourDensity = "low" | "medium" | "high";
export type SeedMode = "unique" | "fixed" | "manual";

export interface ActivitySettings {
  mapSize: MapSize;
  customStations: number;
  difficulty: Difficulty;
  parkour: ParkourDensity;
  seedMode: SeedMode;
  fixedSeed: string; // código de mapa usado en fixed/manual
  showFeedback: boolean;
}

export interface Activity {
  id: string;
  title: string;
  subject: string;
  instructions: string;
  color: string; // acento visual
  createdAt: number;
  questions: Question[];
  settings: ActivitySettings;
}

export interface Results {
  title: string;
  score: number;
  answered: number;
  total: number;
  wrong: number;
  accuracy: number;
  time: number;
  falls: number;
  seedCode: string;
}

/* ---------------- PRNG determinístico ---------------- */

export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — PRNG rápido y determinístico */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedCode(seed: number): string {
  return (seed % 100000000).toString().padStart(8, "0");
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 100000000);
}

/* ---------------- utilidades ---------------- */

export function uid(): string {
  return (
    Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
  );
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

/** estaciones objetivo según tamaño de mapa */
export function stationCountFor(settings: ActivitySettings, rng?: () => number): number {
  const r = rng ?? Math.random;
  let base: number;
  switch (settings.mapSize) {
    case "small":
      base = 3 + Math.floor(r() * 3); // 3–5
      break;
    case "medium":
      base = 5 + Math.floor(r() * 3); // 5–7
      break;
    case "large":
      base = 10 + Math.floor(r() * 4); // 10–13
      break;
    case "custom":
      base = clamp(Math.round(settings.customStations || 5), 1, 20);
      break;
  }
  return base;
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export const COURSE_COLORS = ["#FF6B8A", "#FFB84D", "#4DD6C1", "#8A7CFF", "#5DB9FF", "#A3E635"];

/* ---------------- actividad demo ---------------- */

function q(prompt: string, answers: string[], correctIndex: number, feedback?: string): Question {
  return { id: uid(), prompt, answers, correctIndex, feedback };
}

export function buildDemoActivity(): Activity {
  return {
    id: "demo-english-adventure",
    title: "English Vocabulary Adventure",
    subject: "Inglés · Vocabulario",
    instructions:
      "Recorre las islas flotantes, supera el parkour y responde en cada estación para abrir el camino. ¡Llega al portal final!",
    color: "#FF6B8A",
    createdAt: Date.now(),
    questions: [
      q('What color is the sun commonly represented as?', ["Yellow", "Blue", "Black", "Purple"], 0, "The sun is commonly represented as yellow."),
      q('What animal says "meow"?', ["Dog", "Cat", "Cow", "Bird"], 1),
      q('Which number is "thirty"?', ["13", "40", "30", "20"], 2),
      q('What is the opposite of "big"?', ["Tall", "Fast", "Small", "Long"], 2),
      q('Which word means "casa"?', ["Horse", "Mouse", "School", "House"], 3),
    ],
    settings: {
      mapSize: "medium",
      customStations: 5,
      difficulty: "normal",
      parkour: "medium",
      seedMode: "unique",
      fixedSeed: "38172914",
      showFeedback: true,
    },
  };
}

export function blankActivity(): Activity {
  return {
    id: uid(),
    title: "Mi Aventura de Aprendizaje",
    subject: "General",
    instructions: "Supera el parkour y responde las preguntas en cada estación.",
    color: COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)],
    createdAt: Date.now(),
    questions: [q("Escribe tu primera pregunta aquí", ["Opción A", "Opción B", "Opción C", "Opción D"], 0)],
    settings: {
      mapSize: "medium",
      customStations: 5,
      difficulty: "normal",
      parkour: "medium",
      seedMode: "unique",
      fixedSeed: seedCode(randomSeed()),
      showFeedback: true,
    },
  };
}

/* ---------------- storage local ---------------- */

const LS_KEY = "islasaber_activities_v1";

export function loadActivities(): Activity[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveActivities(list: Activity[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* almacenamiento lleno / no disponible */
  }
}

export function upsertActivity(a: Activity): Activity[] {
  const list = loadActivities();
  const i = list.findIndex((x) => x.id === a.id);
  if (i >= 0) list[i] = a;
  else list.unshift(a);
  saveActivities(list);
  return list;
}

export function deleteActivity(id: string): Activity[] {
  const list = loadActivities().filter((x) => x.id !== id);
  saveActivities(list);
  return list;
}

export function validateImported(obj: any): Activity | null {
  if (!obj || typeof obj !== "object") return null;
  if (!Array.isArray(obj.questions) || obj.questions.length === 0) return null;
  const clean: Question[] = [];
  for (const qq of obj.questions) {
    if (!qq || typeof qq.prompt !== "string" || !Array.isArray(qq.answers)) continue;
    const answers = qq.answers.slice(0, 4).map((s: any) => String(s ?? ""));
    while (answers.length < 4) answers.push("—");
    clean.push({
      id: typeof qq.id === "string" ? qq.id : uid(),
      prompt: String(qq.prompt),
      answers,
      correctIndex: clamp(Number(qq.correctIndex) || 0, 0, 3),
      feedback: typeof qq.feedback === "string" ? qq.feedback : "",
    });
  }
  if (clean.length === 0) return null;
  const s = obj.settings ?? {};
  return {
    id: typeof obj.id === "string" ? obj.id : uid(),
    title: String(obj.title || "Actividad importada"),
    subject: String(obj.subject || "General"),
    instructions: String(obj.instructions || ""),
    color: typeof obj.color === "string" ? obj.color : "#4DD6C1",
    createdAt: Number(obj.createdAt) || Date.now(),
    questions: clean,
    settings: {
      mapSize: ["small", "medium", "large", "custom"].includes(s.mapSize) ? s.mapSize : "medium",
      customStations: clamp(Number(s.customStations) || 5, 1, 20),
      difficulty: ["easy", "normal", "hard"].includes(s.difficulty) ? s.difficulty : "normal",
      parkour: ["low", "medium", "high"].includes(s.parkour) ? s.parkour : "medium",
      seedMode: ["unique", "fixed", "manual"].includes(s.seedMode) ? s.seedMode : "unique",
      fixedSeed: String(s.fixedSeed || seedCode(randomSeed())),
      showFeedback: s.showFeedback !== false,
    },
  };
}
