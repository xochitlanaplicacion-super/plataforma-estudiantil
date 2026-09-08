import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shuffleEachQuestionOptions, shuffleQuestionOptions } from '@/lib/activities/classroom-question-options';

const aiRoute = readFileSync(join(process.cwd(), 'src/app/api/exercises/generate-classroom-bank/route.ts'), 'utf8');
const bankManager = readFileSync(join(process.cwd(), 'src/components/classroom-games/QuestionBankManager.tsx'), 'utf8');
const bankActions = readFileSync(join(process.cwd(), 'src/lib/actions/classroom-games.ts'), 'utf8');
const atomicMigration = readFileSync(join(process.cwd(), 'supabase/migrations/20260908053557_atomic_classroom_question_bank_updates.sql'), 'utf8');

describe('mezcla de incisos del banco de actividades', () => {
  it('mueve la respuesta correcta junto con su texto', () => {
    const result = shuffleQuestionOptions({
      questionType: 'multiple_choice',
      prompt: 'Capital de Francia',
      options: ['París', 'Roma', 'Londres', 'Madrid'],
      correctIndex: 0,
      explanation: 'París es la capital.',
    }, () => 0);

    expect(result.options).toEqual(['Roma', 'Londres', 'Madrid', 'París']);
    expect(result.options[result.correctIndex]).toBe('París');
  });

  it('nunca cruza incisos entre preguntas distintas', () => {
    const result = shuffleEachQuestionOptions([
      { questionType: 'multiple_choice', prompt: 'Pregunta uno', options: ['A1', 'B1', 'C1', 'D1'], correctIndex: 1 },
      { questionType: 'multiple_choice', prompt: 'Pregunta dos', options: ['A2', 'B2', 'C2', 'D2'], correctIndex: 2 },
    ], () => 0);

    expect(new Set(result[0].options)).toEqual(new Set(['A1', 'B1', 'C1', 'D1']));
    expect(new Set(result[1].options)).toEqual(new Set(['A2', 'B2', 'C2', 'D2']));
    expect(result[0].options).not.toContain('A2');
    expect(result[1].options).not.toContain('A1');
    expect(result[0].options[result[0].correctIndex]).toBe('B1');
    expect(result[1].options[result[1].correctIndex]).toBe('C2');
  });

  it('conserva el orden fijo de verdadero y falso', () => {
    const question = { questionType: 'true_false' as const, prompt: 'El agua es un elemento.', options: ['Verdadero', 'Falso'], correctIndex: 1 };
    expect(shuffleQuestionOptions(question, () => 0)).toBe(question);
  });

  it('limita la generación de IA al profesor autenticado y registra el tenant real', () => {
    expect(aiRoute).toContain("requireTenantSession(['profesor'])");
    expect(aiRoute).toContain('tenant_id: tenantId');
    expect(aiRoute).toContain('user_id: user.id');
    expect(aiRoute).not.toContain('userId } = await request.json()');
  });

  it('abre bancos completos, confirma el borrado y guarda la edición sobre el mismo id', () => {
    expect(bankManager).toContain('Abrir y editar');
    expect(bankManager).toContain('Guardar cambios');
    expect(bankManager).toContain('¿Eliminar');
    expect(bankManager).toContain('bankId: editingBankId');
    expect(bankActions).toContain('deleteClassroomBankAction');
  });

  it('reemplaza encabezado y preguntas atómicamente sólo desde el backend', () => {
    expect(bankActions).toContain("db.rpc('replace_classroom_question_bank'");
    expect(atomicMigration).toContain('security invoker');
    expect(atomicMigration).toContain('from public, anon, authenticated');
    expect(atomicMigration).toContain('to service_role');
    expect(atomicMigration).toContain('set retired_at = now()');
    expect(atomicMigration).toContain('insert into public.classroom_question_items');
    expect(atomicMigration).toContain('where retired_at is null');
  });
});
