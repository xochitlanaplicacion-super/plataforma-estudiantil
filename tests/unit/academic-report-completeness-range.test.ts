import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260910013315_academic_report_ranges_and_capture_completeness.sql', import.meta.url),
  'utf8',
);
const action = readFileSync(
  new URL('../../src/lib/actions/reportes-academicos.ts', import.meta.url),
  'utf8',
);
const dashboard = readFileSync(
  new URL('../../src/components/academic/AcademicReportsDashboard.tsx', import.meta.url),
  'utf8',
);
const recoveryMigration = readFileSync(
  new URL('../../supabase/migrations/20260910031533_expand_recent_concepts_for_recovery.sql', import.meta.url),
  'utf8',
);
const attendanceContextMigration = readFileSync(
  new URL('../../supabase/migrations/20260910042000_concept_attendance_context.sql', import.meta.url),
  'utf8',
);
const mobile = readFileSync(
  new URL('../../../APLICACION ANDROID PLATAFORMA ESTUDIANTIL/App.tsx', import.meta.url),
  'utf8',
);

describe('academic evidence completeness and report ranges', () => {
  it('keeps an aggregate pending until every expected concept has a grade', () => {
    expect(migration).toContain('create or replace function private.enforce_mobile_concept_completeness()');
    expect(migration).toContain('graded_count < expected_count');
    expect(migration).toContain("new.estado := 'pendiente'");
    expect(migration).toContain("btrim(coalesce(new.observacion, '')) <> 'Promedio de capturas móviles'");
    expect(migration).not.toMatch(/coalesce\s*\(\s*grade\.calificacion\s*,\s*0\s*\)/i);
  });

  it('counts explicit zero grades but exposes every missing activity', () => {
    expect(migration).toContain('count(grade.id)::integer');
    expect(migration).toContain("'pendingCountsAsZero', false");
    expect(migration).toContain("'explicitZeroCounts', true");
    expect(migration).toContain("'missingConceptNames', missing_names");
    expect(dashboard).toContain('Promedio parcial:');
    expect(dashboard).toContain('falta calificar');
  });

  it('restricts ranges to the active period and authorizes by teacher assignment', () => {
    expect(migration).toContain('assignment.profesor_id = actor');
    expect(migration).toContain('effective_from := greatest(period_start');
    expect(migration).toContain('effective_to := least(period_end');
    expect(migration).toContain('ACADEMIC_REPORT_INVALID_DATE_RANGE');
    expect(action).toContain("rpc('obtener_reporte_academico_docente_unificado_rango'");
  });

  it('offers the requested web presets and uses the same range for exports', () => {
    expect(dashboard).toContain('Últimos 7 días');
    expect(dashboard).toContain('Últimos 15 días');
    expect(dashboard).toContain('Últimos 30 días');
    expect(dashboard).toContain('${report.range.from}_${report.range.to}.pdf');
    expect(dashboard).toContain('${report.range.from}_${report.range.to}.xlsx');
  });

  it('lets KIBO reopen an activity, select pending students, record zero and edit a grade', () => {
    expect(recoveryMigration).toContain('limit 200');
    expect(recoveryMigration).toContain('assignment.profesor_id = actor');
    expect(mobile).toContain('Buscar actividades anteriores');
    expect(mobile).toContain('Buscar actividad por nombre');
    expect(mobile).toContain('Seleccionar pendientes');
    expect(mobile).toContain('No entregó · registrar 0');
    expect(mobile).toContain('selecciona otra nota para corregirla');
    expect(mobile).toContain("observation: value === 0 ? 'No entregó' : ''");
  });

  it('distinguishes absence, teacher omission and missing attendance without assigning an automatic zero', () => {
    expect(attendanceContextMigration).toContain('obtener_contexto_asistencia_conceptos_docente');
    expect(attendanceContextMigration).toContain("attendance.estado as status");
    expect(attendanceContextMigration).toContain("assignment.profesor_id = actor");
    expect(dashboard).toContain('Ausente el');
    expect(dashboard).toContain('falta calificar');
    expect(dashboard).toContain('Sin pase de lista');
    expect(mobile).toContain('pendiente de recuperar');
    expect(mobile).toContain('Sin pase de lista');
  });
});
