/** Evidence sent by the isolated game iframe after a completed run. */
export interface GameAnswerEvent {
  questionId: string;
  prompt: string;
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  attemptNumber: number;
  timedOut?: boolean;
}

export interface GameAnswerDetail {
  tipo: 'respuesta_juego';
  pregunta_id: string;
  reactivo: string;
  respuesta_dada: string | null;
  respuesta_correcta: string;
  esCorrecto: boolean;
  numero_intento: number;
  tiempo_agotado: boolean;
}

const MAX_EVENTS = 120;
// La RPC admite p_detalles de hasta 128 KiB. Reservar espacio para las
// métricas del juego y para el resto del historial de esta operación.
const MAX_EVENTS_BYTES = 64 * 1024;

function trimmedText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

/** Never let an unusually long run or malformed iframe payload lose the grade. */
export function normalizeGameAnswerDetails(value: unknown): {
  details: GameAnswerDetail[];
  omitted: number;
} {
  if (!Array.isArray(value)) return { details: [], omitted: 0 };

  const details: GameAnswerDetail[] = [];
  const encoder = new TextEncoder();
  let usedBytes = 0;
  for (const raw of value) {
    if (details.length >= MAX_EVENTS) break;
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const attemptNumber = Number(item.attemptNumber);
    const questionId = trimmedText(item.questionId, 80);
    const prompt = trimmedText(item.prompt, 240);
    const correctAnswer = trimmedText(item.correctAnswer, 160);
    if (!questionId || !prompt || !correctAnswer || typeof item.isCorrect !== 'boolean'
      || !Number.isInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 10_000) continue;
    const timedOut = item.timedOut === true;
    const selectedAnswer = item.selectedAnswer === null || timedOut
      ? null : trimmedText(item.selectedAnswer, 160);
    if (!timedOut && !selectedAnswer) continue;

    const detail: GameAnswerDetail = {
      tipo: 'respuesta_juego',
      pregunta_id: questionId,
      reactivo: prompt,
      respuesta_dada: selectedAnswer,
      respuesta_correcta: correctAnswer,
      esCorrecto: item.isCorrect,
      numero_intento: attemptNumber,
      tiempo_agotado: timedOut,
    };
    const itemBytes = encoder.encode(JSON.stringify(detail)).length + 1;
    if (usedBytes + itemBytes > MAX_EVENTS_BYTES) break;
    details.push(detail);
    usedBytes += itemBytes;
  }
  return { details, omitted: Math.max(0, value.length - details.length) };
}
