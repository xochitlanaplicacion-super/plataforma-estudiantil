export type QuestionType = "multiple_choice" | "true_false";

export interface PlatformQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  feedback: string;
}

export interface PlatformActivity {
  id: string;
  title: string;
  subject: string;
  instructions: string;
  createdAt: number;
  questions: PlatformQuestion[];
  settings: {
    difficulty: "easy" | "normal" | "hard";
    mazeSize: "small" | "medium" | "large";
    biome: string;
    questionTime: number;
    doorLockSeconds: number;
    requiredFragments: number;
    seedMode: "unique" | "fixed";
    fixedSeed: string;
    showFeedback: boolean;
  };
}

export interface PlatformResult {
  hits: number;
  total: number;
  wrongAttempts: number;
  time: number;
  captures: number;
  score: number;
  seedCode: string;
  fragments: number;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function numericSeed(value: string): number {
  if (/^\d+$/.test(value)) return Number(value) >>> 0;
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 100_000_000);
}

export function seedCode(seed: number): string {
  return (seed % 100_000_000).toString().padStart(8, "0");
}

export function normalizeActivity(input: unknown): PlatformActivity | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, any>;
  if (!Array.isArray(source.questions) || source.questions.length === 0) return null;
  const questions = source.questions.slice(0, 20).map((item: any, index: number): PlatformQuestion => {
    const type: QuestionType = item?.type === "true_false" ? "true_false" : "multiple_choice";
    const optionCount = type === "true_false" ? 2 : 4;
    const options = type === "true_false"
      ? ["Verdadero", "Falso"]
      : Array.isArray(item?.options) ? item.options.slice(0, optionCount).map(String) : [];
    while (options.length < optionCount) options.push("—");
    return {
      id: String(item?.id || `question-${index + 1}`),
      type,
      prompt: String(item?.prompt || ""),
      options,
      correctIndex: clamp(Number(item?.correctIndex) || 0, 0, optionCount - 1),
      feedback: String(item?.feedback || ""),
    };
  });
  const settings = source.settings && typeof source.settings === "object" ? source.settings : {};
  return {
    id: String(source.id || "preview"),
    title: String(source.title || "Backrooms Scape"),
    subject: String(source.subject || "Actividad educativa"),
    instructions: String(source.instructions || "Encuentra las salas seguras y reúne los fragmentos para escapar."),
    createdAt: Number(source.createdAt) || Date.now(),
    questions,
    settings: {
      difficulty: ["easy", "normal", "hard"].includes(settings.difficulty) ? settings.difficulty : "normal",
      mazeSize: ["small", "medium", "large"].includes(settings.mazeSize) ? settings.mazeSize : "medium",
      biome: String(settings.biome || "liminal_halls"),
      questionTime: clamp(Number(settings.questionTime) || 20, 10, 60),
      doorLockSeconds: clamp(Number(settings.doorLockSeconds) || 10, 5, 20),
      requiredFragments: clamp(Number(settings.requiredFragments) || Math.min(5, questions.length), 1, questions.length),
      seedMode: settings.seedMode === "fixed" ? "fixed" : "unique",
      fixedSeed: String(settings.fixedSeed || "47291385"),
      showFeedback: settings.showFeedback !== false,
    },
  };
}

export function demoActivity(): PlatformActivity {
  return normalizeActivity({
    id: "demo",
    title: "Backrooms Scape",
    subject: "Desafío educativo",
    instructions: "Explora, encuentra las salas cian y responde para abrir el portal.",
    questions: [
      { id: "1", type: "multiple_choice", prompt: "¿Cuánto es 7 × 8?", options: ["54", "56", "48", "63"], correctIndex: 1, feedback: "Siete grupos de ocho suman 56." },
      { id: "2", type: "true_false", prompt: "La Tierra gira alrededor del Sol.", options: ["Verdadero", "Falso"], correctIndex: 0, feedback: "Ese movimiento se llama traslación." },
      { id: "3", type: "multiple_choice", prompt: "¿Cuál es la fórmula del agua?", options: ["CO₂", "H₂O", "O₂", "NaCl"], correctIndex: 1, feedback: "Cada molécula tiene dos hidrógenos y un oxígeno." },
      { id: "4", type: "true_false", prompt: "Un hexágono tiene seis lados.", options: ["Verdadero", "Falso"], correctIndex: 0, feedback: "El prefijo hexa- significa seis." },
    ],
    settings: { difficulty: "normal", mazeSize: "medium", questionTime: 20, doorLockSeconds: 10, requiredFragments: 4, seedMode: "unique", showFeedback: true },
  })!;
}
