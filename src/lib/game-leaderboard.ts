export type RankedGameType = 'parkour_race' | 'backrooms_scape';

export interface GameLeaderboardEntry {
  name: string;
  isCurrentStudent: boolean;
  accuracy: number;
  hits: number;
  total: number;
  time: number;
  score: number;
  penalties: number;
  attempts: number;
}

export interface GameLeaderboard {
  gameType: RankedGameType;
  entries: GameLeaderboardEntry[];
  participantCount: number;
  generatedAt: string;
}

export interface GameResultRow {
  alumno_id: string;
  historico_intentos: unknown;
}

export interface GameStudentRow {
  id: string;
  nombre: string | null;
  apellidos: string | null;
}

const finite = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function gameDetails(details: unknown, gameType: RankedGameType): Record<string, unknown> | null {
  const candidates = Array.isArray(details) ? details : [details];
  const found = candidates.find((item) => item && typeof item === 'object' && (item as Record<string, unknown>).tipo === gameType);
  return found && typeof found === 'object' ? found as Record<string, unknown> : null;
}

function compareOverall(a: GameLeaderboardEntry, b: GameLeaderboardEntry) {
  return b.accuracy - a.accuracy || b.score - a.score || a.time - b.time || a.penalties - b.penalties || a.name.localeCompare(b.name, 'es');
}

/** Builds one personal-best row per student from the canonical attempt history. */
export function buildGameLeaderboard(
  gameType: RankedGameType,
  students: GameStudentRow[],
  results: GameResultRow[],
  currentStudentId: string,
  generatedAt = new Date().toISOString(),
): GameLeaderboard {
  const studentsById = new Map(students.map((student) => [student.id, student]));
  const entries: GameLeaderboardEntry[] = [];

  for (const result of results) {
    const student = studentsById.get(result.alumno_id);
    if (!student || !Array.isArray(result.historico_intentos)) continue;
    const candidates: GameLeaderboardEntry[] = [];
    for (const rawAttempt of result.historico_intentos) {
      if (!rawAttempt || typeof rawAttempt !== 'object') continue;
      const attempt = rawAttempt as Record<string, unknown>;
      const details = gameDetails(attempt.detalles, gameType);
      if (!details) continue;
      const hits = Math.max(0, Math.round(finite(attempt.aciertos)));
      const total = Math.max(1, Math.round(finite(attempt.total_preguntas, 1)));
      const penaltiesKey = gameType === 'parkour_race' ? 'caidas' : 'capturas';
      const rawTime = Number(details.tiempo_segundos);
      const rawScore = Number(details.puntos_juego);
      const rawPenalties = Number(details[penaltiesKey]);
      if (!Number.isFinite(rawTime) || rawTime <= 0 || rawTime > 86_400
          || !Number.isFinite(rawScore) || rawScore < 0
          || !Number.isInteger(rawPenalties) || rawPenalties < 0 || rawPenalties > 100_000) continue;
      // El navegador ejecuta el juego, pero una cifra imposible no debe llegar al ranking.
      const maximumScore = gameType === 'parkour_race'
        ? total * 100 + 500
        : Math.floor(rawTime) * 2 + total * 100 + (25 * total * (total - 1)) / 2 + 600;
      if (rawScore > maximumScore) continue;
      const time = rawTime;
      const score = Math.round(rawScore);
      const penalties = rawPenalties;
      candidates.push({
        name: `${student.nombre || ''} ${student.apellidos || ''}`.trim() || 'Estudiante',
        isCurrentStudent: student.id === currentStudentId,
        accuracy: Math.round((hits * 10_000) / total) / 100,
        hits,
        total,
        time,
        score,
        penalties,
        attempts: result.historico_intentos.length,
      });
    }
    candidates.sort(compareOverall);
    if (candidates[0]) entries.push(candidates[0]);
  }

  entries.sort(compareOverall);
  return { gameType, entries, participantCount: entries.length, generatedAt };
}
