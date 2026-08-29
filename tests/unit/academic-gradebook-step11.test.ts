import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  buildGradeMutationItems, gradebookCellKey, sortAndFilterGradebookStudents,
  validateGradeDraft, workspaceContainsDrafts, type AcademicGradeDraftMap,
} from '@/lib/academic/gradebook-client';
import type { AcademicGradebookWorkspaceDto } from '@/lib/academic/gradebook-dto';
import type { AcademicGradebookRepository } from '@/lib/academic/gradebook-repository';
import { AcademicGradebookService } from '@/lib/academic/gradebook-service';

const IDS = {
  tenant: '10000000-0000-4000-8000-000000000001',
  actor: '10000000-0000-4000-8000-000000000002',
  assignment: '10000000-0000-4000-8000-000000000003',
  period: '10000000-0000-4000-8000-000000000004',
  enrollment: '10000000-0000-4000-8000-000000000005',
  criterion: '10000000-0000-4000-8000-000000000006',
  source: '10000000-0000-4000-8000-000000000007',
};

function workspace(): AcademicGradebookWorkspaceDto {
  return {
    context: {
      assignmentId: IDS.assignment, cycleId: IDS.tenant, cycleName: '2026-2027', cycleState: 'activo',
      subjectId: IDS.criterion, subjectName: 'Matemáticas', groupId: IDS.period, groupName: 'A',
      teacherId: IDS.actor, teacherName: 'Docente', active: true,
      periods: [{ id: IDS.period, name: 'P1', startsOn: '2026-08-01', endsOn: '2026-10-01', order: 1, state: 'activo' }],
    },
    scheme: { id: IDS.source, name: 'Esquema', version: 1, passingGrade: 6, displayDecimals: 1 },
    periodState: 'activo', closed: false,
    students: [{ enrollmentId: IDS.enrollment, studentId: IDS.source, fullName: 'Zavala Ana', enrollmentCode: 'A01' }],
    columns: [{ id: `direct:${IDS.criterion}:root`, label: 'Examen', criterionName: 'Examen', subcriterionName: null, criterionId: IDS.criterion, subcriterionId: null, sourceType: 'directCriterion', exerciseId: null, editable: true, scale: '0-10', order: 1 }],
    cells: [], studentCount: 1, truncated: false, loadedAt: '2026-08-28T18:00:00.000Z',
  };
}

function repository(result = workspace()): AcademicGradebookRepository {
  return { loadWorkspace: vi.fn(async () => result) };
}

describe('Paso 11: contratos y aislamiento de la libreta', () => {
  it('deriva tenant, profesor y rol de la sesión y rechaza contexto manipulable', async () => {
    const repo = repository();
    const service = new AcademicGradebookService(repo, {
      tenantId: IDS.tenant, actorId: IDS.actor, role: 'profesor', featureEnabled: true,
    });
    await expect(service.loadWorkspace({ assignmentId: IDS.assignment, periodId: IDS.period })).resolves.toEqual(workspace());
    expect(repo.loadWorkspace).toHaveBeenCalledWith({ tenantId: IDS.tenant, actorId: IDS.actor, role: 'profesor' }, { assignmentId: IDS.assignment, periodId: IDS.period });
    await expect(service.loadWorkspace({ assignmentId: IDS.assignment, periodId: IDS.period, tenantId: 'ajeno' })).rejects.toBeDefined();
  });

  it('rechaza rol ajeno y feature flag apagado antes del repositorio', async () => {
    const repo = repository();
    await expect(new AcademicGradebookService(repo, { tenantId: IDS.tenant, actorId: IDS.actor, role: 'alumno', featureEnabled: true }).loadWorkspace({ assignmentId: IDS.assignment, periodId: IDS.period })).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(new AcademicGradebookService(repo, { tenantId: IDS.tenant, actorId: IDS.actor, role: 'profesor', featureEnabled: false }).loadWorkspace({ assignmentId: IDS.assignment, periodId: IDS.period })).rejects.toMatchObject({ kind: 'disabled' });
    expect(repo.loadWorkspace).not.toHaveBeenCalled();
  });

  it('mantiene filtros redundantes contra profesor ajeno y tenant B', () => {
    const source = readFileSync('src/lib/academic/gradebook-repository.ts', 'utf8');
    expect(source).toContain(".eq('tenant_id', context.tenantId)");
    expect(source).toContain("assignmentQuery.eq('profesor_id', context.actorId)");
    expect(source).toContain(".eq('asignacion_profesor_id', assignment.id)");
    expect(source).toContain(".in('inscripcion_alumno_id', enrollmentIds)");
    const route = readFileSync('src/app/dashboard/profesor/calificaciones/page.tsx', 'utf8');
    expect(route).toContain("requireTenantSession(['profesor'])");
  });
});
describe('Paso 11: lote, conciliación y 200 alumnos', () => {
  const key = gradebookCellKey(IDS.enrollment, `direct:${IDS.criterion}:root`);
  const draft: AcademicGradeDraftMap = {
    [key]: {
      enrollmentId: IDS.enrollment, columnId: `direct:${IDS.criterion}:root`, sourceId: null,
      sourceType: 'directCriterion', criterionId: IDS.criterion, subcriterionId: null,
      state: 'calificado', grade: 9.5, observation: 'Captura ordinaria', expectedRowVersion: 0,
    },
  };

  it('valida 0–10 y crea un lote determinista sin autosave', () => {
    expect(validateGradeDraft(draft[key])).toBeNull();
    expect(validateGradeDraft({ ...draft[key], grade: 10.01 })).toContain('entre 0 y 10');
    expect(buildGradeMutationItems(draft)).toEqual([expect.objectContaining({ grade: 9.5, expectedRowVersion: 0 })]);
  });

  it('reconcilia timeout sólo cuando la recarga avanzó versión y coincide exactamente', () => {
    const saved = workspace();
    saved.cells = [{
      enrollmentId: IDS.enrollment, columnId: `direct:${IDS.criterion}:root`, sourceId: IDS.source,
      sourceType: 'directCriterion', criterionId: IDS.criterion, subcriterionId: null,
      state: 'calificado', grade: 9.5, observation: 'Captura ordinaria', rowVersion: 1,
      updatedAt: '2026-08-28T18:01:00.000Z', editable: true,
    }];
    expect(workspaceContainsDrafts(saved, draft)).toBe(true);
    saved.cells[0].grade = 8;
    expect(workspaceContainsDrafts(saved, draft)).toBe(false);
  });

  it('busca y ordena 200 alumnos sin perder identidad de matrícula', () => {
    const students = Array.from({ length: 200 }, (_, index) => ({
      enrollmentId: `${index}`.padStart(36, '0'), studentId: `student-${index}`,
      fullName: `Alumno ${String(index).padStart(3, '0')}`,
      enrollmentCode: `M${String(200 - index).padStart(3, '0')}`,
    }));
    expect(sortAndFilterGradebookStudents(students, '', 'name_asc')).toHaveLength(200);
    expect(sortAndFilterGradebookStudents(students, 'Alumno 199', 'name_asc')).toHaveLength(1);
    expect(sortAndFilterGradebookStudents(students, '', 'enrollment_asc')[0].enrollmentCode).toBe('M001');
  });
});
