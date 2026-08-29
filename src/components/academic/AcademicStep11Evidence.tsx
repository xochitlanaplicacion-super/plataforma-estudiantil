'use client';

import { useRef, useState } from 'react';

import type { AcademicCalculatedResultDto, AcademicMutationResultDto } from '@/lib/academic/dto';
import type { AcademicGradebookWorkspaceDto } from '@/lib/academic/gradebook-dto';
import type { EditAcademicGradesInput } from '@/lib/academic/validators';
import { AcademicErrorState, AcademicLoadingState } from './AcademicConfigurationUi';
import { GradebookEditor } from './GradebookEditor';

export type AcademicStep11EvidenceState =
  | 'workspace' | 'loading' | 'empty' | 'error' | 'forbidden'
  | 'closed' | 'conflict' | 'timeout' | 'large';

const ID = {
  assignment: '11000000-0000-4000-8000-000000000001', period: '11000000-0000-4000-8000-000000000002',
  cycle: '11000000-0000-4000-8000-000000000003', subject: '11000000-0000-4000-8000-000000000004',
  group: '11000000-0000-4000-8000-000000000005', teacher: '11000000-0000-4000-8000-000000000006',
  criterion: '11000000-0000-4000-8000-000000000007', scheme: '11000000-0000-4000-8000-000000000008',
  correlation: '11000000-0000-4000-8000-000000000009',
};

function syntheticWorkspace(state: AcademicStep11EvidenceState): AcademicGradebookWorkspaceDto {
  const count = state === 'large' ? 200 : state === 'empty' ? 0 : 3;
  const students = Array.from({ length: count }, (_, index) => ({
    enrollmentId: `11000000-0000-4000-8${String(index).padStart(3, '0')}-${String(index + 100).padStart(12, '0')}`,
    studentId: `12000000-0000-4000-8${String(index).padStart(3, '0')}-${String(index + 100).padStart(12, '0')}`,
    fullName: index === 0 ? 'Ramírez Ana' : index === 1 ? 'Sánchez Bruno' : `Alumno ${String(index + 1).padStart(3, '0')}`,
    enrollmentCode: `XCHTL-${String(index + 1).padStart(4, '0')}`,
  }));
  return {
    context: {
      assignmentId: ID.assignment, cycleId: ID.cycle, cycleName: '2026–2027', cycleState: 'activo',
      subjectId: ID.subject, subjectName: 'Matemáticas', groupId: ID.group, groupName: '1° A',
      teacherId: ID.teacher, teacherName: 'Docente de evidencia', active: true,
      periods: [{ id: ID.period, name: 'Primer periodo', startsOn: '2026-08-31', endsOn: '2026-10-30', order: 1, state: state === 'closed' ? 'cerrado' : 'activo' }],
    },
    scheme: { id: ID.scheme, name: 'Esquema institucional', version: 2, passingGrade: 6, displayDecimals: 1 },
    periodState: state === 'closed' ? 'cerrado' : 'activo', closed: state === 'closed',
    students,
    columns: [{
      id: `direct:${ID.criterion}:root`, label: 'Examen parcial', criterionName: 'Exámenes',
      subcriterionName: null, criterionId: ID.criterion, subcriterionId: null,
      sourceType: 'directCriterion', exerciseId: null, editable: true, scale: '0-10', order: 1,
    }],
    cells: [], studentCount: count, truncated: false, loadedAt: new Date().toISOString(),
  };
}

const breakdown: AcademicCalculatedResultDto = {
  engineVersion: 'academic-deterministic-v1', scale: '0-10', exactGrade: '9.2500',
  displayGrade: '9.3', displayDecimals: 1, complete: true,
  criteria: [{ label: 'Exámenes', canonicalGrade: '9.2500', contributionToTotal: '9.2500' }],
  warnings: [],
};

export function AcademicStep11Evidence({ state }: { state: AcademicStep11EvidenceState }) {
  const [workspace, setWorkspace] = useState(() => syntheticWorkspace(state));
  const workspaceRef = useRef(workspace);
  const [saveRequests, setSaveRequests] = useState(0);

  if (state === 'loading') return <main className="p-6"><AcademicLoadingState label="Cargando libreta de evidencia…" /></main>;
  if (state === 'error') return <main className="p-6"><AcademicErrorState status="error" error={{ code: 'ACADEMIC_UNEXPECTED', message: 'No fue posible completar la operación académica.', httpStatus: 500 }} onRetry={() => undefined} /></main>;
  if (state === 'forbidden') return <main className="p-6"><AcademicErrorState status="forbidden" error={{ code: 'ACADEMIC_FORBIDDEN', message: 'No tienes autorización para consultar esta asignación.', httpStatus: 403 }} onRetry={() => undefined} /></main>;

  async function save(input: EditAcademicGradesInput) {
    setSaveRequests((count) => count + 1);
    if (state === 'conflict') {
      return { ok: false as const, status: 'conflict' as const, error: { code: 'ACADEMIC_CONFLICT' as const, message: 'La fila cambió en otra pestaña.', httpStatus: 409 as const } };
    }
    const items: AcademicMutationResultDto['items'] = [];
    const nextCells = input.items.map((item, index) => {
      const sourceId = item.sourceId ?? `13000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      items.push({ sourceType: item.sourceType, sourceId, rowVersion: item.expectedRowVersion + 1, state: item.state, grade: item.grade });
      return {
        enrollmentId: item.enrollmentId, columnId: `direct:${item.criterionId}:root`,
        sourceId, sourceType: item.sourceType, criterionId: item.criterionId!, subcriterionId: item.subcriterionId ?? null,
        state: item.state, grade: item.grade, observation: item.observation ?? null,
        rowVersion: item.expectedRowVersion + 1, updatedAt: new Date().toISOString(), editable: true,
      };
    });
    const nextWorkspace = { ...workspaceRef.current, cells: nextCells };
    workspaceRef.current = nextWorkspace;
    setWorkspace(nextWorkspace);
    if (state === 'timeout') {
      return { ok: false as const, status: 'error' as const, error: { code: 'ACADEMIC_TIMEOUT' as const, message: 'Tiempo agotado', httpStatus: 504 as const } };
    }
    return { ok: true as const, status: 'success' as const, data: { status: 'saved' as const, replayed: false, correlationId: ID.correlation, items } };
  }

  return (
    <main className="mx-auto max-w-[96rem] space-y-4 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Arnés local con datos sintéticos; cero consultas externas.</p>
        <output data-testid="save-request-count" aria-label="Conteo de solicitudes de guardado">Solicitudes de guardado: {saveRequests}</output>
      </div>
      <GradebookEditor
        workspace={workspace}
        onReload={async () => ({ ok: true, status: workspaceRef.current.students.length ? 'success' : 'empty', data: workspaceRef.current })}
        onSave={save}
        onBreakdown={async () => ({ ok: true, status: 'success', data: breakdown })}
      />
    </main>
  );
}
