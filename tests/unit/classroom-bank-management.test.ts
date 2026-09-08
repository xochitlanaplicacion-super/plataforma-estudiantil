import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const actions = readFileSync(join(process.cwd(), 'src/lib/actions/classroom-games.ts'), 'utf8');
const manager = readFileSync(join(process.cwd(), 'src/components/classroom-games/QuestionBankManager.tsx'), 'utf8');
const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260908053557_atomic_classroom_question_bank_updates.sql'), 'utf8');

describe('administración persistente de bancos de actividades', () => {
  it('reemplaza encabezado y preguntas dentro de una única función transaccional', () => {
    expect(actions).toContain("db.rpc('replace_classroom_question_bank'");
    expect(migration).toContain('create or replace function public.replace_classroom_question_bank');
    expect(migration).toContain('set retired_at = now()');
    expect(migration).toContain('insert into public.classroom_question_items');
    expect(migration).toContain('security invoker');
  });

  it('restringe la función atómica al backend', () => {
    expect(migration).toMatch(/revoke execute[\s\S]*from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute[\s\S]*to service_role/);
    expect(migration).toContain('assignment.tenant_id = target_tenant_id');
    expect(migration).toContain('assignment.profesor_id = target_teacher_id');
  });

  it('permite abrir, editar, mezclar, cancelar y eliminar con confirmación', () => {
    expect(manager).toContain('Abrir y editar');
    expect(manager).toContain('Guardar cambios');
    expect(manager).toContain('Mezclar todos los incisos');
    expect(manager).toContain('Cancelar edición');
    expect(manager).toContain('<AlertDialog');
    expect(manager).toContain('deleteClassroomBankAction');
  });

  it('protege el historial archivando bancos que ya tienen partidas', () => {
    expect(actions).toContain("from('classroom_game_sessions').select('id')");
    expect(actions).toContain("update({ status: 'archived' })");
    expect(actions).toContain("deleteClassroomBankAction");
  });
});
