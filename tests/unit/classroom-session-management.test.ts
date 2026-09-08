import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260908064057_manage_classroom_game_sessions.sql'), 'utf8');
const actions = readFileSync(join(process.cwd(), 'src/lib/actions/classroom-games.ts'), 'utf8');
const manager = readFileSync(join(process.cwd(), 'src/components/classroom-games/TeacherSessionManager.tsx'), 'utf8');
const room = readFileSync(join(process.cwd(), 'src/components/classroom-games/BetWinLoseRoom.tsx'), 'utf8');

describe('Administración de sesiones recientes', () => {
  it('reinicia únicamente partidas finalizadas del mismo profesor y tenant', () => {
    expect(migration).toContain('reset_classroom_game_session');
    expect(migration).toContain('session.tenant_id = target_tenant_id');
    expect(migration).toContain('session.teacher_id = target_teacher_id');
    expect(migration).toContain("session.status in ('finished', 'cancelled')");
    expect(migration).toContain('for update');
    expect(migration).toContain('security invoker');
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
  });

  it('borra resultados antes de participantes y devuelve la sesión a borrador', () => {
    const matches = migration.indexOf('delete from public.classroom_game_matches');
    const participants = migration.indexOf('delete from public.classroom_game_participants');
    expect(matches).toBeGreaterThan(-1);
    expect(participants).toBeGreaterThan(matches);
    expect(migration).toContain("set status = 'draft'");
    expect(migration).toContain("question_order = '{}'");
  });

  it('valida propiedad y limita el borrado masivo desde el servidor', () => {
    expect(actions).toContain("const sessionIdsSchema = z.array(z.string().uuid()).min(1).max(50)");
    expect(actions).toContain("requireTenantSession(['profesor'])");
    expect(actions).toContain(".eq('tenant_id', tenantId).eq('teacher_id', profile.id).in('id', sessionIds)");
    expect(actions).toContain("if ((owned || []).length !== sessionIds.length)");
    expect(actions).toContain('deleteClassroomSessionsAction');
  });

  it('permite selección múltiple, borrado individual y confirmación explícita', () => {
    expect(manager).toContain('Seleccionar todas');
    expect(manager).toContain('Borrar seleccionadas');
    expect(manager).toContain('Eliminar sesión');
    expect(manager).toContain('¿Reiniciar esta sesión?');
    expect(manager).toContain('¿Eliminar');
    expect(manager).toContain('AlertDialog');
  });

  it('deja revisar resultados y sólo reinicia cuando el moderador lo confirma', () => {
    expect(room).toContain('Puedes revisar la clasificación con calma');
    expect(room).toContain('Reiniciar esta sesión');
    expect(room).toContain("state.viewerRole === 'profesor'");
    expect(room).toContain('resetClassroomSessionAction(sessionId)');
    expect(room).toContain("router.push('/dashboard/profesor/actividades-clase')");
  });
});
