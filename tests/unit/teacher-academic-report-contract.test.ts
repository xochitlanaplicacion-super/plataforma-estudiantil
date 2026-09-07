import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260907003408_teacher_academic_reports.sql', import.meta.url),
  'utf8',
);
const dashboard = readFileSync(
  new URL('../../src/components/academic/AcademicReportsDashboard.tsx', import.meta.url),
  'utf8',
);

describe('teacher academic report contract', () => {
  it('authorizes reports by authenticated teacher and assignment ownership', () => {
    expect(migration).toContain("actor uuid := (select auth.uid())");
    expect(migration).toContain('assignment.profesor_id = actor');
    expect(migration).toContain('ACADEMIC_REPORT_ASSIGNMENT_FORBIDDEN');
    expect(migration).toContain('revoke all on function public.obtener_reporte_academico_docente');
  });

  it('derives attendance and criteria from the active period instead of fixed labels', () => {
    expect(migration).toContain('attendance.fecha_asistencia between period.fecha_inicio and period.fecha_fin');
    expect(migration).toContain("'criterionName', criterion.criterion_name");
    expect(migration).toContain("'subcriterionName', criterion.subcriterion_name");
    expect(migration).not.toContain("criterion.nombre in ('Tareas'");
  });

  it('nets participation reversals and exports the three evidence views', () => {
    expect(migration).toContain("event.tipo_evento = 'reversa'");
    expect(dashboard).toContain("addWorksheet('Asistencia'");
    expect(dashboard).toContain("addWorksheet('Criterios'");
    expect(dashboard).toContain("addWorksheet('Evidencias detalladas'");
    expect(dashboard).toContain('HISTORIAL DE ASISTENCIA');
    expect(dashboard).toContain('EVIDENCIA POR CRITERIOS');
  });
});
