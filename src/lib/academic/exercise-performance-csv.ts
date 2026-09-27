import { readExerciseAttempts } from './exercise-attempt-history';

type PerformanceRow = {
  name: string; group?: string | null; completedAt?: string | null;
  grade?: number | null; hits?: number | null; total?: number | null; attempts?: number | null;
};

function cell(value: string | number | null | undefined): string {
  const raw = String(value ?? '');
  const safe = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exercisePerformanceCsv(rows: readonly PerformanceRow[], options: { game?: boolean } = {}): string {
  const hitsLabel = options.game ? 'Aciertos al primer intento (última partida)' : 'Aciertos del último intento';
  const heading = ['Alumno', 'Grupo', 'Fecha de finalización', 'Promedio de intentos / 10', hitsLabel, 'Preguntas del último intento', 'Intentos'];
  const lines = rows.map((row) => [row.name, row.group, row.completedAt,
    row.grade, row.hits, row.total, row.attempts].map(cell).join(','));
  return `\uFEFF${[heading.map(cell).join(','), ...lines].join('\r\n')}\r\n`;
}

type AttemptDetailRow = {
  name: string;
  group?: string | null;
  history: unknown;
};

/** One row per answer/retry, or one explicit summary row for old attempts without answers. */
export function exerciseAttemptDetailCsv(rows: readonly AttemptDetailRow[]): string {
  const heading = [
    'Alumno', 'Grupo', 'Intento de actividad', 'Fecha', 'Calificación del intento / 10',
    'Aciertos (en juegos: al primer intento)', 'Preguntas del intento', 'Tipo de juego', 'Pregunta',
    'Respuesta n.º', 'Respuesta dada', 'Respuesta correcta', 'Resultado',
    'Reintentos incorrectos', 'Tiempo del juego (s)', 'Caídas', 'Capturas',
    'Fragmentos', 'Puntos del juego', 'Código del mapa', 'Estado del desglose',
  ];
  const lines: string[] = [];

  for (const row of rows) {
    for (const attempt of readExerciseAttempts(row.history)) {
      const answers = attempt.answers.length > 0 ? attempt.answers : [null];
      for (const answer of answers) {
        lines.push([
          row.name, row.group, attempt.number, attempt.date, attempt.grade,
          attempt.hits, attempt.total, attempt.game?.type,
          answer?.prompt, answer?.retryNumber, answer?.given,
          answer?.correctAnswer,
          answer ? (answer.timedOut ? 'Tiempo agotado' : answer.isCorrect ? 'Correcta' : 'Incorrecta') : 'Sin desglose de respuestas',
          attempt.game?.wrongAttempts, attempt.game?.seconds,
          attempt.game?.falls, attempt.game?.captures, attempt.game?.fragments,
          attempt.game?.points, attempt.game?.mapCode,
          attempt.game?.traceTruncated ? 'Parcial: se omitieron respuestas o reintentos'
            : attempt.answers.length === 0 ? 'Sin respuestas registradas' : 'Completo',
        ].map(cell).join(','));
      }
    }
  }

  return `\uFEFF${[heading.map(cell).join(','), ...lines].join('\r\n')}\r\n`;
}
