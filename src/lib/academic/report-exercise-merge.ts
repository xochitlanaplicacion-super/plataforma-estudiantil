import type { AcademicReport } from '@/lib/actions/reportes-academicos';
import { isPastDeadline } from './deadline-policy';

export type ReportExercise = {
  id: string;
  criterionKey: string;
  name: string;
  type: string;
  createdAt: string;
  activityDate: string;
  dueAt: string | null;
};

export type ReportExerciseGrade = {
  exerciseId: string;
  enrollmentId: string;
  grade: number;
  observation: string;
  updatedAt: string;
};

/** Exercise marks and KIBO concept marks share one evidence list in exports. */
export function mergeReportExercises(
  report: AcademicReport,
  exercises: readonly ReportExercise[],
  grades: readonly ReportExerciseGrade[],
): AcademicReport {
  const criteria = new Set(report.criteria.map((item) => item.key));
  const existing = new Set(report.concepts.map((item) => item.id));
  const globalExercises = exercises.filter((exercise) =>
    criteria.has(exercise.criterionKey)
    && !existing.has(exercise.id),
  );
  if (!globalExercises.length) return report;
  const additions = globalExercises.filter((exercise) =>
    exercise.activityDate >= report.range.from && exercise.activityDate <= report.range.to);
  const exerciseIds = new Set(globalExercises.map((item) => item.id));
  const gradeByStudent = new Map<string, Record<string, AcademicReport['students'][number]['conceptGrades'][string]>>();
  for (const grade of grades) {
    if (!exerciseIds.has(grade.exerciseId)) continue;
    const byExercise = gradeByStudent.get(grade.enrollmentId) ?? {};
    byExercise[grade.exerciseId] = {
      grade: grade.grade,
      observation: grade.observation,
      updatedAt: grade.updatedAt,
    };
    gradeByStudent.set(grade.enrollmentId, byExercise);
  }
  const concepts = [...report.concepts, ...additions.map((exercise) => ({
    ...exercise,
    attendance: {},
  }))].sort((left, right) => left.activityDate.localeCompare(right.activityDate)
    || left.name.localeCompare(right.name, 'es'));
  const students = report.students.map((student) => {
    const exerciseGrades = gradeByStudent.get(student.enrollmentId) ?? {};
    const detailIds = new Set(additions.map((item) => item.id));
    const conceptGrades = { ...student.conceptGrades,
      ...Object.fromEntries(Object.entries(exerciseGrades).filter(([id]) => detailIds.has(id))) };
    const results = { ...student.results };
    for (const criterion of report.criteria) {
      if (criterion.type === 'participacion') continue;
      const evidence = globalExercises.filter((item) => item.criterionKey === criterion.key);
      if (!evidence.length) continue;
      const previous = results[criterion.key];
      if (previous?.calculationPolicy === 'direct_grade') continue;
      const values = evidence.map((item) => {
        const real = exerciseGrades[item.id]?.grade;
        if (typeof real === 'number') return real;
        return report.calculationPolicy.pendingCountsAsZero
          && isPastDeadline(item.dueAt, report.generatedAt) ? 0 : null;
      }).filter((value): value is number => typeof value === 'number');
      const baseCount = previous?.gradedCount ?? 0;
      const baseSum = previous?.grade === null || previous?.grade === undefined ? 0 : previous.grade * baseCount;
      const denominator = baseCount + values.length;
      const realExerciseCount = evidence.filter((item) => exerciseGrades[item.id] !== undefined).length;
      const expectedCount = (previous?.expectedCount ?? 0) + evidence.length;
      const gradedCount = baseCount + realExerciseCount;
      results[criterion.key] = {
        grade: denominator ? Math.round(((baseSum + values.reduce((sum, value) => sum + value, 0)) / denominator) * 10000) / 10000 : null,
        state: gradedCount === expectedCount ? 'calificado' : 'pendiente',
        participationPoints: previous?.participationPoints ?? 0,
        participationCount: previous?.participationCount ?? 0,
        expectedCount,
        gradedCount,
        missingCount: expectedCount - gradedCount,
        complete: gradedCount === expectedCount,
        missingConceptNames: [...(previous?.missingConceptNames ?? []),
          ...evidence.filter((item) => exerciseGrades[item.id] === undefined).map((item) => item.name)],
        calculationPolicy: 'explicit_grades_only_with_coverage',
      };
    }
    return { ...student, results, conceptGrades };
  });
  return { ...report, concepts, students };
}
