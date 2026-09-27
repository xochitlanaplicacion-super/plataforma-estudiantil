import { describe, expect, it } from 'vitest';
import { exercisePerformanceCsv } from '@/lib/academic/exercise-performance-csv';

describe('exercise results export', () => {
  it('includes automatic results and neutralizes spreadsheet formulas in names', () => {
    const csv = exercisePerformanceCsv([{ name: '=IMPORTXML("evil")', group: 'A', grade: 9,
      hits: 9, total: 10, attempts: 1, completedAt: '2026-09-27' }]);
    expect(csv).toContain("'=IMPORTXML");
    expect(csv).toContain('"9"');
    expect(csv).toContain('2026-09-27');
  });
});
