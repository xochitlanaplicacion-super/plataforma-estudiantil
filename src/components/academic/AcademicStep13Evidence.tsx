import type { AcademicContextDto } from '@/lib/academic/dto';
import type {
  AcademicStudentResultsDto,
  AcademicTenantResultsDto,
  AcademicTenantStudentResultDto,
} from '@/lib/academic/results-dto';

import { AcademicStudentResultsPage } from './AcademicStudentResultsPage';
import { AcademicTenantResultsPage } from './AcademicTenantResultsPage';

export type AcademicStep13EvidenceRole = 'student' | 'management';
export type AcademicStep13EvidenceState = 'results' | 'empty' | 'final' | 'reopened';

const IDS = {
  cycle: '13000000-0000-4000-8000-000000000001',
  assignment: '13000000-0000-4000-8000-000000000002',
  subject: '13000000-0000-4000-8000-000000000003',
  group: '13000000-0000-4000-8000-000000000004',
  teacher: '13000000-0000-4000-8000-000000000005',
  period: '13000000-0000-4000-8000-000000000006',
  scheme: '13000000-0000-4000-8000-000000000007',
  enrollment: '13000000-0000-4000-8000-000000000008',
  student: '13000000-0000-4000-8000-000000000009',
  criterion: '13000000-0000-4000-8000-000000000010',
};

const context: AcademicContextDto = {
  assignmentId: IDS.assignment,
  cycleId: IDS.cycle,
  cycleName: '2026–2027',
  cycleState: 'activo',
  subjectId: IDS.subject,
  subjectName: 'Matemáticas',
  groupId: IDS.group,
  groupName: '1° A',
  teacherId: IDS.teacher,
  teacherName: 'Docente de evidencia',
  active: true,
  periods: [{
    id: IDS.period,
    name: 'Primer periodo',
    startsOn: '2026-08-31',
    endsOn: '2026-10-30',
    order: 1,
    state: 'activo',
  }],
};

function result(state: AcademicStep13EvidenceState, index = 0): AcademicTenantStudentResultDto {
  const publicationState = state === 'final' ? 'final' : state === 'reopened' ? 'reopened' : 'provisional';
  return {
    assignmentId: IDS.assignment,
    enrollmentId: index === 0 ? IDS.enrollment : `13100000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    studentId: index === 0 ? IDS.student : `13200000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    studentName: index === 0 ? 'Ramírez Ana' : `Alumno ${String(index + 1).padStart(2, '0')}`,
    enrollmentCode: `MAT-${String(index + 1).padStart(4, '0')}`,
    cycleId: IDS.cycle,
    cycleName: context.cycleName,
    subjectId: IDS.subject,
    subjectName: context.subjectName,
    groupId: IDS.group,
    groupName: context.groupName,
    teacherId: IDS.teacher,
    teacherName: context.teacherName,
    periodId: IDS.period,
    periodName: 'Primer periodo',
    periodState: publicationState === 'final' ? 'cerrado' : 'activo',
    schemeId: IDS.scheme,
    schemeVersion: publicationState === 'final' ? 3 : 4,
    passingGrade: 6,
    displayDecimals: 1,
    publicationState,
    closureVersion: publicationState === 'provisional' ? null : 2,
    closedAt: publicationState === 'provisional' ? null : '2026-10-31T12:00:00.000Z',
    exactGrade: index % 2 === 0 ? '9.2500' : '7.5000',
    displayGrade: index % 2 === 0 ? '9.3' : '7.5',
    complete: publicationState === 'final' || index % 3 !== 0,
    sourceCount: 4,
    resolvedSourceCount: index % 3 === 0 ? 3 : 4,
    missingSourceCount: index % 3 === 0 ? 1 : 0,
    progressPercent: index % 3 === 0 ? 75 : 100,
    criteria: [{
      criterionId: IDS.criterion,
      label: 'Actividades',
      originalWeight: '100.0000',
      effectiveWeight: '100.0000',
      canonicalGrade: index % 2 === 0 ? '9.2500' : '7.5000',
      contributionToTotal: index % 2 === 0 ? '9.2500' : '7.5000',
      complete: true,
    }],
    warnings: index % 3 === 0 ? [{
      code: 'PENDING_SOURCE', criterionId: IDS.criterion,
      subcriterionId: null, sourceId: null,
    }] : [],
  };
}

function managementData(state: AcademicStep13EvidenceState): AcademicTenantResultsDto {
  const rows = state === 'empty' ? [] : Array.from({ length: 28 }, (_, index) => result(state, index));
  const visible = rows.length;
  const resolved = rows.reduce((sum, row) => sum + row.resolvedSourceCount, 0);
  const sources = rows.reduce((sum, row) => sum + row.sourceCount, 0);
  return {
    context,
    periodId: IDS.period,
    periodName: 'Primer periodo',
    periodState: state === 'final' ? 'cerrado' : 'activo',
    closureVersion: state === 'results' || state === 'empty' ? null : 2,
    results: {
      items: rows.slice(0, 25), page: 1, pageSize: 25, total: visible,
      totalPages: visible === 0 ? 0 : Math.ceil(visible / 25),
      hasPreviousPage: false, hasNextPage: visible > 25,
    },
    summary: {
      visibleStudents: visible,
      withGrade: visible,
      complete: rows.filter((row) => row.complete).length,
      missing: rows.filter((row) => !row.complete).length,
      provisional: rows.filter((row) => row.publicationState === 'provisional').length,
      final: rows.filter((row) => row.publicationState === 'final').length,
      reopened: rows.filter((row) => row.publicationState === 'reopened').length,
      average: visible === 0 ? null : '8.41',
      captureProgressPercent: sources === 0 ? 0 : Math.round((resolved / sources) * 100),
    },
    generatedAt: '2026-08-29T20:00:00.000Z',
  };
}

function studentData(state: AcademicStep13EvidenceState): AcademicStudentResultsDto {
  const row = result(state);
  const { studentId: _studentId, studentName: _studentName, enrollmentCode: _code, ...own } = row;
  return {
    items: state === 'empty' ? [] : [own],
    page: 1,
    pageSize: 25,
    total: state === 'empty' ? 0 : 1,
    totalPages: state === 'empty' ? 0 : 1,
    hasPreviousPage: false,
    hasNextPage: false,
    cycles: [{ id: IDS.cycle, name: context.cycleName }],
    periods: [{ id: IDS.period, cycleId: IDS.cycle, name: 'Primer periodo', state: own.periodState }],
    generatedAt: '2026-08-29T20:00:00.000Z',
  };
}

export function AcademicStep13Evidence({
  role,
  state,
}: {
  role: AcademicStep13EvidenceRole;
  state: AcademicStep13EvidenceState;
}) {
  return role === 'student'
    ? <AcademicStudentResultsPage key={state} initialData={studentData(state)} />
    : <AcademicTenantResultsPage key={state} initialContexts={[context]} initialData={managementData(state)} />;
}
