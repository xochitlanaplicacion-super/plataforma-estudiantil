export type GameType = 'parkour_race' | 'backrooms_scape';

export interface AttemptAnswer {
  questionId: string | null;
  prompt: string;
  given: string | null;
  correctAnswer: string | null;
  isCorrect: boolean;
  retryNumber: number | null;
  timedOut: boolean;
}

export interface GameAttemptMetrics {
  type: GameType;
  wrongAttempts: number | null;
  seconds: number | null;
  falls: number | null;
  captures: number | null;
  fragments: number | null;
  points: number | null;
  mapCode: string | null;
  answersAvailable: boolean;
  answersOmitted: number;
  traceTruncated: boolean;
}

export interface ExerciseAttempt {
  number: number;
  date: string | null;
  grade: number | null;
  hits: number | null;
  total: number | null;
  game: GameAttemptMetrics | null;
  answers: AttemptAnswer[];
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^\s*-?\d+(?:\.\d+)?\s*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Verdadero' : 'Falso';
  return null;
}

function gameMetrics(value: unknown): GameAttemptMetrics | null {
  const item = object(value);
  if (!item || (item.tipo !== 'parkour_race' && item.tipo !== 'backrooms_scape')) return null;
  return {
    type: item.tipo,
    wrongAttempts: finite(item.intentos_incorrectos),
    seconds: finite(item.tiempo_segundos),
    falls: finite(item.caidas),
    captures: finite(item.capturas),
    fragments: finite(item.fragmentos),
    points: finite(item.puntos_juego),
    mapCode: text(item.codigo_mapa),
    answersAvailable: item.detalle_respuestas_disponible === true,
    answersOmitted: Math.max(0, finite(item.respuestas_omitidas) ?? 0),
    traceTruncated: item.traza_truncada === true,
  };
}

function answer(value: unknown): AttemptAnswer | null {
  const item = object(value);
  if (!item || gameMetrics(item)) return null;
  if (item.tipo !== 'respuesta_juego' && !('reactivo' in item) && !('respuesta_correcta' in item)) return null;
  const retry = finite(item.numero_intento);
  return {
    questionId: text(item.pregunta_id),
    prompt: text(item.reactivo) || 'Pregunta sin título',
    given: text(item.respuesta_dada),
    correctAnswer: text(item.respuesta_correcta),
    // Older exercises stored only mistakes and had no esCorrecto flag.
    isCorrect: item.esCorrecto === true,
    retryNumber: retry !== null && Number.isInteger(retry) && retry > 0 ? retry : null,
    timedOut: item.tiempo_agotado === true,
  };
}

/** Reads both current game events and old aggregate-only histories without inventing answers. */
export function readExerciseAttempts(value: unknown): ExerciseAttempt[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index) => {
    const attempt = object(raw);
    if (!attempt) return [];
    const details = Array.isArray(attempt.detalles) ? attempt.detalles : [];
    const number = finite(attempt.intento);
    const grade = finite(attempt.calificacion_10);
    return [{
      number: number !== null && Number.isInteger(number) && number > 0 ? number : index + 1,
      date: text(attempt.fecha),
      // The canonical database history uses calificacion_10. `calificacion` in
      // old data could mean a percentage, so do not guess its scale.
      grade: grade !== null && grade >= 0 && grade <= 10 ? grade : null,
      hits: finite(attempt.aciertos),
      total: finite(attempt.total_preguntas),
      game: details.map(gameMetrics).find((item): item is GameAttemptMetrics => item !== null) || null,
      answers: details.map(answer).filter((item): item is AttemptAnswer => item !== null),
    }];
  });
}
