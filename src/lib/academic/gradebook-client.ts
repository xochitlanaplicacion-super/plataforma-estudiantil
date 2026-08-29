import type { EditAcademicGradesInput } from './validators';
import type {
  AcademicGradebookCellDto,
  AcademicGradebookColumnDto,
  AcademicGradebookStudentDto,
  AcademicGradebookWorkspaceDto,
  AcademicGradeState,
} from './gradebook-dto';

export interface AcademicGradeDraft {
  enrollmentId: string;
  columnId: string;
  sourceId: string | null;
  sourceType: Exclude<AcademicGradebookCellDto['sourceType'], 'participation'>;
  criterionId: string;
  subcriterionId: string | null;
  state: AcademicGradeState;
  grade: number | null;
  observation: string | null;
  expectedRowVersion: number;
}
export type AcademicGradeDraftMap = Record<string, AcademicGradeDraft>;

export function gradebookCellKey(enrollmentId: string, columnId: string): string {
  return `${enrollmentId}::${columnId}`;
}

export function validateGradeDraft(draft: AcademicGradeDraft): string | null {
  if (draft.state === 'calificado') {
    if (draft.grade === null || !Number.isFinite(draft.grade)) return 'Captura una calificación.';
    if (draft.grade < 0 || draft.grade > 10) return 'La calificación debe estar entre 0 y 10.';
  } else if (draft.grade !== null) {
    return 'Sólo el estado calificado admite una nota.';
  }
  if ((draft.observation?.length ?? 0) > 2_000) return 'La observación excede 2000 caracteres.';
  return null;
}

export function buildGradeMutationItems(
  drafts: AcademicGradeDraftMap,
): EditAcademicGradesInput['items'] {
  return Object.entries(drafts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, draft]) => ({
      sourceType: draft.sourceType,
      sourceId: draft.sourceId,
      enrollmentId: draft.enrollmentId,
      criterionId: draft.criterionId,
      subcriterionId: draft.subcriterionId,
      state: draft.state,
      grade: draft.grade,
      observation: draft.observation,
      expectedRowVersion: draft.expectedRowVersion,
    }));
}

export function workspaceContainsDrafts(
  workspace: AcademicGradebookWorkspaceDto,
  drafts: AcademicGradeDraftMap,
): boolean {
  const cells = new Map(workspace.cells.map((cell) => [
    gradebookCellKey(cell.enrollmentId, cell.columnId), cell,
  ]));
  return Object.entries(drafts).every(([key, draft]) => {
    const remote = cells.get(key);
    if (!remote) return false;
    return remote.state === draft.state
      && remote.grade === draft.grade
      && (remote.observation ?? null) === (draft.observation ?? null)
      && remote.rowVersion > draft.expectedRowVersion;
  });
}

export function sortAndFilterGradebookStudents(
  students: AcademicGradebookStudentDto[],
  search: string,
  order: 'name_asc' | 'name_desc' | 'enrollment_asc',
): AcademicGradebookStudentDto[] {
  const needle = search.trim().toLocaleLowerCase('es');
  return students
    .filter((student) => !needle || `${student.fullName} ${student.enrollmentCode ?? ''}`
      .toLocaleLowerCase('es').includes(needle))
    .sort((left, right) => {
      if (order === 'enrollment_asc') {
        return (left.enrollmentCode ?? '').localeCompare(right.enrollmentCode ?? '', 'es')
          || left.fullName.localeCompare(right.fullName, 'es');
      }
      const comparison = left.fullName.localeCompare(right.fullName, 'es');
      return order === 'name_desc' ? -comparison : comparison;
    });
}

export function defaultCellFor(
  student: AcademicGradebookStudentDto,
  column: AcademicGradebookColumnDto,
): AcademicGradebookCellDto {
  return {
    enrollmentId: student.enrollmentId,
    columnId: column.id,
    sourceId: null,
    sourceType: column.sourceType,
    criterionId: column.criterionId,
    subcriterionId: column.subcriterionId,
    state: 'sin_capturar',
    grade: null,
    observation: null,
    rowVersion: 0,
    updatedAt: null,
    editable: column.sourceType === 'directCriterion' && column.editable,
  };
}
