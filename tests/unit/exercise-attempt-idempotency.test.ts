import { describe, expect, it } from 'vitest';
import { originalExerciseAttemptVersion, validateExerciseAttemptKey } from '@/lib/academic-grading/exercise-results';

describe('automatic attempt retry contract', () => {
  it('validates client-supplied attempt identifiers before querying the mutation ledger', () => {
    const id = '419a88f2-59b4-43c8-ae34-e8304eb11050';
    expect(validateExerciseAttemptKey(id)).toBe(id);
    for (const malformed of ['', 'not-a-uuid', null, 12]) {
      expect(() => validateExerciseAttemptKey(malformed)).toThrow('UUID');
    }
  });

  it('reuses the original zero version when replaying a first attempt already committed', () => {
    expect(originalExerciseAttemptVersion({ status: 'saved', saved: true, rowVersion: 1, grade: 8 }))
      .toBe(0);
  });

  it('uses the previous version for a committed update, not a fresh post-save version', () => {
    expect(originalExerciseAttemptVersion({ status: 'saved', saved: true, rowVersion: 12, grade: 8 }))
      .toBe(11);
  });

  it('does not decrement the version of a locked attempt that did not update the result', () => {
    expect(originalExerciseAttemptVersion({ status: 'locked', saved: false, rowVersion: 12, grade: 10 }))
      .toBe(12);
  });

  it('fails closed when a recorded response cannot safely identify its original optimistic version', () => {
    expect(() => originalExerciseAttemptVersion({ status: 'saved', saved: true })).toThrow();
    expect(() => originalExerciseAttemptVersion({ status: 'saved', saved: true, rowVersion: -1 })).toThrow();
    expect(() => originalExerciseAttemptVersion({ status: 'expired', saved: false })).toThrow();
  });
});
