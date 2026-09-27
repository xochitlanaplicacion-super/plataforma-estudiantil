type PerformanceRow = {
  name: string; group?: string | null; completedAt?: string | null;
  grade?: number | null; hits?: number | null; total?: number | null; attempts?: number | null;
};

function cell(value: string | number | null | undefined): string {
  const raw = String(value ?? '');
  const safe = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exercisePerformanceCsv(rows: readonly PerformanceRow[]): string {
  const heading = ['Alumno', 'Grupo', 'Fecha de finalización', 'Calificación / 10', 'Aciertos', 'Total de preguntas', 'Intentos'];
  const lines = rows.map((row) => [row.name, row.group, row.completedAt,
    row.grade, row.hits, row.total, row.attempts].map(cell).join(','));
  return `\uFEFF${[heading.map(cell).join(','), ...lines].join('\r\n')}\r\n`;
}
