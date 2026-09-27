import { describe, expect, it } from 'vitest';
import { mergeReportExercises } from '@/lib/academic/report-exercise-merge';
import type { AcademicReport } from '@/lib/actions/reportes-academicos';

const report = {
  generatedAt: '2026-09-26T12:00:00Z',
  calculationPolicy: { pendingCountsAsZero: false },
  range: { from: '2026-09-01', to: '2026-09-30' },
  criteria: [{ key: 'criterion:root', type: 'actividades' }],
  concepts: [{ id: 'concept', criterionKey: 'criterion:root', name: 'Trabajo en clase',
    type: 'trabajo', createdAt: '2026-09-10T12:00:00Z', activityDate: '2026-09-10', attendance: {} }],
  students: [{ enrollmentId: 'student', conceptGrades: {
    concept: { grade: 7, observation: '', updatedAt: '2026-09-11T12:00:00Z' },
  }, results: { 'criterion:root': {
    grade: 7, state: 'calificado', participationPoints: 0, participationCount: 0,
    expectedCount: 1, gradedCount: 1, missingCount: 0, complete: true,
    missingConceptNames: [], calculationPolicy: 'explicit_grades_only_with_coverage',
  } } }],
} as unknown as AcademicReport;

describe('academic report exercise evidence', () => {
  it('includes automatic and descriptive marks in detailed evidence and criterion average', () => {
    const result = mergeReportExercises(report, [{ id: 'exercise', criterionKey: 'criterion:root',
      name: 'Actividad descriptiva', type: 'descriptiveSubmission',
      createdAt: '2026-09-15T12:00:00Z', activityDate: '2026-09-15', dueAt: '2026-09-25T12:00:00Z' }], [{
      exerciseId: 'exercise', enrollmentId: 'student', grade: 9,
      observation: 'Revisado', updatedAt: '2026-09-16T12:00:00Z',
    }]);
    expect(result.concepts.map((item) => item.name)).toEqual(['Trabajo en clase', 'Actividad descriptiva']);
    expect(result.students[0].conceptGrades.exercise.grade).toBe(9);
    expect(result.students[0].results['criterion:root']).toMatchObject({
      grade: 8, expectedCount: 2, gradedCount: 2, complete: true,
    });
    expect(report.students[0].results['criterion:root'].grade).toBe(7);
  });

  it('keeps ungraded exercises pending and omits activity outside date range', () => {
    const result = mergeReportExercises(report, [
      { id: 'pending', criterionKey: 'criterion:root', name: 'Pendiente',
        type: 'automaticExercise', createdAt: '2026-09-20T12:00:00Z', activityDate: '2026-09-20', dueAt: '2026-09-27T12:00:00Z' },
      { id: 'outside', criterionKey: 'criterion:root', name: 'Fuera',
        type: 'automaticExercise', createdAt: '2026-10-01T12:00:00Z', activityDate: '2026-10-01', dueAt: '2026-10-02T12:00:00Z' },
    ], []);
    expect(result.concepts.map((item) => item.id)).toEqual(['concept', 'pending']);
    expect(result.students[0].results['criterion:root']).toMatchObject({
      grade: 7, expectedCount: 3, gradedCount: 1, missingCount: 2, complete: false,
    });
  });

  it('uses a virtual zero only after the deadline, without inserting a grade', () => {
    const active = { ...report, calculationPolicy: { pendingCountsAsZero: true } } as AcademicReport;
    const result = mergeReportExercises(active, [
      { id: 'expired', criterionKey: 'criterion:root', name: 'Vencida',
        type: 'descriptiveSubmission', createdAt: '2026-09-12T12:00:00Z', activityDate: '2026-09-12', dueAt: '2026-09-25T12:00:00Z' },
      { id: 'in-time', criterionKey: 'criterion:root', name: 'En plazo',
        type: 'descriptiveSubmission', createdAt: '2026-09-13T12:00:00Z', activityDate: '2026-09-13', dueAt: '2026-09-27T12:00:00Z' },
    ], []);
    expect(result.students[0].results['criterion:root'].grade).toBe(3.5);
    expect(result.students[0].conceptGrades.expired).toBeUndefined();
    expect(result.students[0].conceptGrades['in-time']).toBeUndefined();
  });

  it('keeps the criterion global while limiting detailed evidence to the selected dates', () => {
    const limited = { ...report, range: { from: '2026-09-10', to: '2026-09-10' } } as AcademicReport;
    const result = mergeReportExercises(limited, [{
      id: 'later', criterionKey: 'criterion:root', name: 'Otra semana',
      type: 'automaticExercise', createdAt: '2026-09-20T12:00:00Z',
      activityDate: '2026-09-20', dueAt: '2026-09-25T12:00:00Z',
    }], [{ exerciseId: 'later', enrollmentId: 'student', grade: 9,
      observation: '', updatedAt: '2026-09-21T12:00:00Z' }]);
    expect(result.concepts.map((item) => item.id)).toEqual(['concept']);
    expect(result.students[0].results['criterion:root'].grade).toBe(8);
  });
});
