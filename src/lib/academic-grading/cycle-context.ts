export type AcademicCycleState = 'borrador' | 'activo' | 'cerrado' | 'archivado';

export interface AcademicCycleSummary {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  timezone: string;
  state: AcademicCycleState;
}

export interface AcademicContextIndicator {
  cycle: AcademicCycleSummary | null;
  activeStudents: number;
  activeEnrollments: number;
  activeAssignments: number;
  isCoherent: boolean;
}

export function buildAcademicContextIndicator(
  cycle: AcademicCycleSummary | null,
  counts: {
    activeStudents: number | null;
    activeEnrollments: number | null;
    activeAssignments: number | null;
  }
): AcademicContextIndicator {
  const activeStudents = counts.activeStudents ?? 0;
  const activeEnrollments = counts.activeEnrollments ?? 0;
  const activeAssignments = counts.activeAssignments ?? 0;

  return {
    cycle,
    activeStudents,
    activeEnrollments,
    activeAssignments,
    isCoherent: cycle !== null && activeStudents === activeEnrollments,
  };
}
