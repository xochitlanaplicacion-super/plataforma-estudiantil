export type PlatformWorkSummaryRow = {
  enrollmentId: string;
  studentName: string;
  grade: number | null;
  state: string | null;
};

export type StudentPlatformWorkSummary = {
  enrollmentId: string;
  studentName: string;
  resultCount: number;
  gradedCount: number;
  averageGrade: number | null;
};

/** Unweighted, informational average of graded platform work in the selected report range. */
export function summarizeStudentPlatformWork(
  rows: readonly PlatformWorkSummaryRow[],
): StudentPlatformWorkSummary[] {
  const byEnrollment = new Map<string, StudentPlatformWorkSummary & { gradeSum: number }>();

  for (const row of rows) {
    let summary = byEnrollment.get(row.enrollmentId);
    if (!summary) {
      summary = {
        enrollmentId: row.enrollmentId,
        studentName: row.studentName,
        resultCount: 0,
        gradedCount: 0,
        gradeSum: 0,
        averageGrade: null,
      };
      byEnrollment.set(row.enrollmentId, summary);
    }

    summary.resultCount += 1;
    if (row.state === 'calificado' && row.grade !== null && Number.isFinite(row.grade)) {
      summary.gradedCount += 1;
      summary.gradeSum += row.grade;
    }
  }

  return Array.from(byEnrollment.values())
    .map(({ gradeSum, ...summary }) => ({
      ...summary,
      averageGrade: summary.gradedCount ? gradeSum / summary.gradedCount : null,
    }))
    .sort((a, b) => a.studentName.localeCompare(b.studentName, 'es-MX'));
}
