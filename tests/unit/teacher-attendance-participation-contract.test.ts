import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root=resolve(__dirname,'../..');
const migration=readFileSync(resolve(root,'supabase/migrations/20260906225808_teacher_daily_attendance.sql'),'utf8');
const dashboard=readFileSync(resolve(root,'src/components/academic/TeacherParticipationDashboard.tsx'),'utf8');

describe('teacher attendance and participation contract',()=>{
  it('derives attendance date on the server and protects retries',()=>{
    expect(migration).toContain("clock_timestamp() at time zone timezone_name");
    expect(migration).toContain('MOBILE_IDEMPOTENCY_MISMATCH');
    expect(migration).toContain('on conflict (tenant_id, inscripcion_alumno_id, fecha_asistencia) do update');
    expect(migration).toContain('MOBILE_ATTENDANCE_ROSTER_MISMATCH');
  });

  it('keeps tenant boundaries and does not expose direct writes',()=>{
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('force row level security');
    expect(migration).toContain('daily_attendance_tenant_boundary');
    expect(migration).toMatch(/revoke all on public\.asistencias_diarias_docente,[\s\S]*from public, anon, authenticated/);
  });

  it('supports daily and active-period participation views in both styles',()=>{
    expect(migration).toContain('obtener_resumen_participacion_docente_movil');
    expect(migration).toContain("event.tipo_evento = 'reversa' then -event.puntos");
    expect(dashboard).toContain("type Mode='sobrio'|'infantil'");
    expect(dashboard).toContain("type Scope='hoy'|'periodo'");
    expect(dashboard).toContain('teacher-participation-style');
  });
});
