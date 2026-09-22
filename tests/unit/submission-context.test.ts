import { describe, expect, it } from 'vitest';
import { resolveExerciseUnitId } from '@/lib/academic-grading/submission-context';

describe('descriptive submission context', () => {
  it('accepts the object shape returned by the temas foreign key', () => {
    expect(resolveExerciseUnitId({ unidad_id: 'unidad-1' })).toBe('unidad-1');
  });

  it('keeps compatibility with array-shaped relationship results', () => {
    expect(resolveExerciseUnitId([{ unidad_id: 'unidad-2' }])).toBe('unidad-2');
    expect(resolveExerciseUnitId([])).toBeNull();
  });
});
