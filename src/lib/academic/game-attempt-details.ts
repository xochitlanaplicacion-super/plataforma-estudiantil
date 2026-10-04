import { normalizeGameAnswerDetails, type GameAnswerDetail } from './game-answer-details';
import type { GameType } from './exercise-attempt-history';

interface GameAttemptMetadata extends Record<string, unknown> {
  tipo: GameType;
  detalle_respuestas_disponible: boolean;
  respuestas_omitidas: number;
  traza_truncada: boolean;
}

/** Serialize all games through the same bounded academic-attempt contract. */
export function gameAttemptDetails(
  gameType: GameType,
  metrics: Record<string, unknown>,
  answers: unknown,
  answersTruncated = false,
): [GameAttemptMetadata, ...GameAnswerDetail[]] {
  // Flying Cat definitions can be long; keep them intact in the evidence while
  // retaining the shared 64 KiB budget for retries and legacy-game defaults.
  const { details, omitted } = normalizeGameAnswerDetails(answers,
    gameType === 'flying_cat' ? { maxPromptCharacters: 1600 } : undefined);
  return [{
    ...metrics,
    tipo: gameType,
    detalle_respuestas_disponible: Array.isArray(answers),
    respuestas_omitidas: omitted,
    traza_truncada: answersTruncated || omitted > 0,
  }, ...details];
}
