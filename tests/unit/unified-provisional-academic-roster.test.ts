import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260909004335_unified_provisional_academic_roster.sql', import.meta.url),
  'utf8',
);
const mobileApi = readFileSync(
  new URL('../../../APLICACION ANDROID PLATAFORMA ESTUDIANTIL/src/lib/api.ts', import.meta.url),
  'utf8',
);

describe('unified provisional academic roster', () => {
  it('adds provisional attendance without replacing the official tables', () => {
    expect(migration).toContain('create table public.asistencias_provisionales_docente');
    expect(migration).toContain('references public.alumnos_provisionales_docente(id, tenant_id)');
    expect(migration).not.toMatch(/drop table|truncate table|delete from public\.inscripciones_alumno/i);
    expect(migration).toContain('on conflict (tenant_id,inscripcion_alumno_id,fecha_asistencia) do nothing');
  });

  it('keeps tenant and teacher boundaries on every unified operation', () => {
    expect(migration).toContain('provisional_attendance_tenant_boundary');
    expect(migration).toContain('a.profesor_id=actor and a.activo');
    expect(migration).toContain('MOBILE_ATTENDANCE_ROSTER_MISMATCH');
    expect(migration).toContain('from public,anon,authenticated');
  });

  it('uses an append-only negative adjustment and preserves the physical QR token', () => {
    expect(migration).toContain("tipo_evento in ('registro','reversa','ajuste_negativo')");
    expect(migration).toContain("'participacion_resta'");
    expect(migration).toContain("then 'ajuste_negativo' else 'registro'");
    expect(migration).toContain('values(provisional.tenant_id,enrollment.id,transferred_qr');
  });

  it('routes KIBO attendance, participation and reports through the unified API', () => {
    expect(mobileApi).toContain("rpc('obtener_asistencia_docente_movil_unificada'");
    expect(mobileApi).toContain("rpc('guardar_asistencia_docente_movil_unificada'");
    expect(mobileApi).toContain("rpc('obtener_resumen_participacion_docente_movil_unificado'");
    expect(mobileApi).toContain("rpc('obtener_reporte_academico_docente_unificado'");
    expect(mobileApi).toContain("rpc('registrar_ajuste_participacion_docente_movil'");
  });
});
