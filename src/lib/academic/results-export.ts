import { AcademicApplicationError } from './errors';
import type { AcademicResultsExportDto, AcademicTenantStudentResultDto } from './results-dto';
import {
  ACADEMIC_RESULTS_EXPORT_MAX_BYTES,
  ACADEMIC_RESULTS_EXPORT_MAX_ROWS,
} from './results-dto';

function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  text = text.replace(/[\r\n]+/g, ' ').trim();
  // Evita que Excel/LibreOffice interpreten datos de usuario como fórmulas.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportFilename(subjectName: string, periodName: string): string {
  const safe = `${subjectName}-${periodName}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80) || 'resultados';
  return `resultados-${safe}.csv`;
}

export function createAcademicResultsCsv(input: {
  rows: readonly AcademicTenantStudentResultDto[];
  subjectName: string;
  periodName: string;
}): AcademicResultsExportDto {
  if (input.rows.length > ACADEMIC_RESULTS_EXPORT_MAX_ROWS) {
    throw new AcademicApplicationError('conflict');
  }
  const header = [
    'Matrícula', 'Alumno', 'Ciclo', 'Grupo', 'Materia', 'Profesor', 'Periodo',
    'Estado', 'Calificación 0-10', 'Completa', 'Progreso captura', 'Versión cierre',
  ];
  const lines = [header, ...input.rows.map((row) => [
    row.enrollmentCode, row.studentName, row.cycleName, row.groupName, row.subjectName,
    row.teacherName, row.periodName, row.publicationState, row.displayGrade,
    row.complete ? 'Sí' : 'No', `${row.progressPercent}%`, row.closureVersion,
  ])].map((line) => line.map(csvCell).join(','));
  const content = `\uFEFF${lines.join('\r\n')}\r\n`;
  const byteLength = new TextEncoder().encode(content).byteLength;
  if (byteLength > ACADEMIC_RESULTS_EXPORT_MAX_BYTES) {
    throw new AcademicApplicationError('conflict');
  }
  return {
    filename: exportFilename(input.subjectName, input.periodName),
    mimeType: 'text/csv;charset=utf-8',
    content,
    rowCount: input.rows.length,
    byteLength,
  };
}
