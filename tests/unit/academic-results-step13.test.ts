import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import type { Json, Tables } from '@/lib/database.types';
import { calculateAcademicGrade, rowsToCalculationInput } from '@/lib/academic-grading/calculation';
import type { AcademicRepositoryContext } from '@/lib/academic/repository';
import type { AcademicTenantStudentResultDto } from '@/lib/academic/results-dto';
import { ACADEMIC_RESULTS_EXPORT_MAX_ROWS } from '@/lib/academic/results-dto';
import { createAcademicResultsCsv } from '@/lib/academic/results-export';
import {
  averageAcademicResults,
  projectAcademicResult,
  summarizeTenantResults,
} from '@/lib/academic/results-projector';
import type { AcademicResultsRepository } from '@/lib/academic/results-repository';
import { AcademicResultsService } from '@/lib/academic/results-service';

const ID = {
  tenant: '13000000-0000-4000-8000-000000000001',
  actor: '13000000-0000-4000-8000-000000000002',
  assignment: '13000000-0000-4000-8000-000000000003',
  enrollment: '13000000-0000-4000-8000-000000000004',
  cycle: '13000000-0000-4000-8000-000000000005',
  subject: '13000000-0000-4000-8000-000000000006',
  group: '13000000-0000-4000-8000-000000000007',
  teacher: '13000000-0000-4000-8000-000000000008',
  period: '13000000-0000-4000-8000-000000000009',
  scheme: '13000000-0000-4000-8000-000000000010',
  criterion: '13000000-0000-4000-8000-000000000011',
  source: '13000000-0000-4000-8000-000000000012',
};

const source: Tables<'vista_desglose_calificacion'> = {
  tenant_id: ID.tenant,
  ciclo_escolar_id: ID.cycle,
  asignacion_profesor_id: ID.assignment,
  periodo_evaluacion_id: ID.period,
  inscripcion_alumno_id: ID.enrollment,
  alumno_id: ID.actor,
  criterio_evaluacion_id: ID.criterion,
  criterio_nombre: 'Actividades',
  criterio_tipo: 'actividades',
  criterio_peso: 100,
  subcriterio_evaluacion_id: null,
  subcriterio_nombre: null,
  subcriterio_tipo: null,
  peso_interno: null,
  tipo_fuente: 'automaticExercise',
  fuente_id: ID.source,
  estado: 'calificado',
  valor_fuente: 8.5,
  escala_fuente: '0-10',
  observacion: null,
  row_version: 1,
  actualizado_at: '2026-08-29T20:00:00.000Z',
};

const projectionContext = {
  assignmentId: ID.assignment,
  enrollmentId: ID.enrollment,
  cycleId: ID.cycle,
  cycleName: '2026-2027',
  subjectId: ID.subject,
  subjectName: 'Matemáticas',
  groupId: ID.group,
  groupName: '1 A',
  teacherId: ID.teacher,
  teacherName: 'Docente',
  periodId: ID.period,
  periodName: 'Primer periodo',
  periodState: 'activo',
  schemeId: ID.scheme,
  schemeVersion: 2,
  passingGrade: 6,
  displayDecimals: 1 as const,
};

function projected() {
  return projectAcademicResult({ context: projectionContext, rows: [source], latestClosure: null });
}

function managementRow(overrides: Partial<AcademicTenantStudentResultDto> = {}): AcademicTenantStudentResultDto {
  return {
    ...projected(),
    studentId: ID.actor,
    studentName: 'Ramírez Ana',
    enrollmentCode: 'M-001',
    ...overrides,
  };
}

function repository(overrides: Partial<AcademicResultsRepository> = {}): AcademicResultsRepository {
  return {
    listMyResults: async () => ({
      items: [], page: 1, pageSize: 25, total: 0, totalPages: 0,
      hasPreviousPage: false, hasNextPage: false,
      cycles: [], periods: [], generatedAt: '',
    }),
    listTenantResults: async () => ({
      context: {
        assignmentId: ID.assignment, cycleId: ID.cycle, cycleName: '', cycleState: '',
        subjectId: ID.subject, subjectName: '', groupId: ID.group, groupName: '',
        teacherId: ID.teacher, teacherName: '', active: true, periods: [],
      },
      periodId: ID.period, periodName: '', periodState: 'activo', closureVersion: null,
      results: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false },
      summary: { visibleStudents: 0, withGrade: 0, complete: 0, missing: 0, provisional: 0, final: 0, reopened: 0, average: null, captureProgressPercent: 0 },
      generatedAt: '',
    }),
    exportTenantResults: async () => ({ filename: 'x.csv', mimeType: 'text/csv;charset=utf-8', content: '', rowCount: 0, byteLength: 0 }),
    ...overrides,
  };
}

function service(repo: AcademicResultsRepository, role: AcademicRepositoryContext['role']) {
  return new AcademicResultsService(repo, {
    tenantId: ID.tenant, actorId: ID.actor, role, featureEnabled: true,
  });
}

describe('Paso 13: proyección única provisional/final', () => {
  it('produce exactamente el mismo 8.5 para fila profesor/admin y fila alumno', () => {
    const admin = projectAcademicResult({ context: projectionContext, rows: [source], latestClosure: null });
    const studentSource: Tables<'vista_calificaciones_alumno'> = { ...source };
    const student = projectAcademicResult({ context: projectionContext, rows: [studentSource], latestClosure: null });
    const directEngine = calculateAcademicGrade(rowsToCalculationInput([source], {
      periodState: 'activo', displayDecimals: 1, roundingMode: 'half_up',
    }));
    expect(admin.displayGrade).toBe('8.5');
    expect(student).toEqual(admin);
    expect(student.displayGrade).toBe(directEngine.displayGrade);
  });

  it('usa el snapshot inmutable al cerrar y vuelve al cálculo vivo al reabrir', () => {
    const breakdown = calculateAcademicGrade(rowsToCalculationInput([source], {
      periodState: 'cerrado', displayDecimals: 1, roundingMode: 'half_up',
    }));
    const final = projectAcademicResult({
      context: { ...projectionContext, periodState: 'cerrado' }, rows: [source],
      latestClosure: {
        estado: 'cerrado', version_cierre: 3, resultado_exacto: 9.75,
        resultado_visual: 9.8, breakdown: breakdown as unknown as Json,
        closed_at: '2026-10-31T12:00:00Z', esquema_version: 2,
      },
    });
    const reopened = projectAcademicResult({
      context: projectionContext, rows: [source],
      latestClosure: {
        estado: 'reabierto', version_cierre: 4, resultado_exacto: 9.75,
        resultado_visual: 9.8, breakdown: breakdown as unknown as Json,
        closed_at: '2026-11-01T12:00:00Z', esquema_version: 2,
      },
    });
    expect(final).toMatchObject({ publicationState: 'final', displayGrade: '9.8', closureVersion: 3, complete: true });
    expect(reopened).toMatchObject({ publicationState: 'reopened', displayGrade: '8.5', closureVersion: 4 });
  });

  it('resume sólo resultados canónicos y no aplica una fórmula heredada', () => {
    const first = projected();
    const second = { ...first, exactGrade: '7.5000', displayGrade: '7.5', complete: false };
    expect(averageAcademicResults([first, second], 2)).toBe('8.00');
    expect(summarizeTenantResults([first, second])).toMatchObject({
      visibleStudents: 2, withGrade: 2, complete: 1, missing: 1, average: '8.00',
    });
  });

  it('retira fórmulas duplicadas de dashboards y conecta las rutas canónicas', () => {
    const studentDashboard = readFileSync('src/app/dashboard/alumno/page.tsx', 'utf8');
    const subjects = readFileSync('src/app/dashboard/alumno/materias/page.tsx', 'utf8');
    const auditPage = readFileSync('src/app/dashboard/admin/auditoria/page.tsx', 'utf8');
    const auditActions = readFileSync('src/lib/actions/auditoria.ts', 'utf8');
    expect(studentDashboard).toContain('loadMyAcademicResultsAction');
    expect(subjects).toContain('loadMyAcademicResultsAction');
    expect(auditPage).toContain('AcademicTenantResultsPage');
    expect(`${studentDashboard}\n${subjects}\n${auditPage}\n${auditActions}`)
      .not.toMatch(/promedioAcumulado|sumaCalificaciones|getRendimientoAlumnos|promedioGeneral/);
  });
});

describe('Paso 13: autorización y no enumeración', () => {
  it('el alumno sólo puede pedir “mis resultados” y el actor llega desde sesión', async () => {
    const listMyResults = vi.fn<AcademicResultsRepository['listMyResults']>(async () => ({
      items: [], page: 1, pageSize: 25, total: 0, totalPages: 0,
      hasPreviousPage: false, hasNextPage: false,
      cycles: [], periods: [], generatedAt: '',
    }));
    const instance = service(repository({ listMyResults }), 'alumno');
    await expect(instance.listMyResults({})).resolves.toBeDefined();
    expect(listMyResults).toHaveBeenCalledWith({
      tenantId: ID.tenant, actorId: ID.actor, role: 'alumno',
    }, { page: 1, pageSize: 25 });
    await expect(instance.listMyResults({ studentId: 'otro' })).rejects.toBeDefined();
    expect(listMyResults).toHaveBeenCalledOnce();
  });

  it('impide a alumno/profesor supervisar o exportar y a admin consultar “mis notas”', async () => {
    const listTenantResults = vi.fn<AcademicResultsRepository['listTenantResults']>();
    const exportTenantResults = vi.fn<AcademicResultsRepository['exportTenantResults']>();
    const repo = repository({ listTenantResults, exportTenantResults });
    const scope = { assignmentId: ID.assignment, periodId: ID.period, page: 1, pageSize: 25 };
    await expect(service(repo, 'alumno').listTenantResults(scope)).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(service(repo, 'profesor').exportTenantResults(scope)).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(service(repo, 'admin').listMyResults()).rejects.toMatchObject({ kind: 'forbidden' });
    expect(listTenantResults).not.toHaveBeenCalled();
    expect(exportTenantResults).not.toHaveBeenCalled();
  });

  it('rechaza tenant/actor inyectados antes del repositorio', async () => {
    const listTenantResults = vi.fn<AcademicResultsRepository['listTenantResults']>();
    const instance = service(repository({ listTenantResults }), 'superuser');
    await expect(instance.listTenantResults({
      assignmentId: ID.assignment, periodId: ID.period, page: 1, pageSize: 25,
      tenantId: 'tenant-ajeno',
    })).rejects.toBeDefined();
    expect(listTenantResults).not.toHaveBeenCalled();
  });
});

describe('Paso 13: exportación en memoria', () => {
  it('genera CSV con BOM, 0–10 y neutraliza fórmulas sin URL pública', () => {
    const csv = createAcademicResultsCsv({
      rows: [managementRow({ studentName: '=HIPERVINCULO("https://evil")' })],
      subjectName: 'Matemáticas', periodName: 'Primer periodo',
    });
    expect(csv.filename).toBe('resultados-matematicas-primer-periodo.csv');
    expect(csv.content.startsWith('\uFEFF')).toBe(true);
    expect(csv.content).toContain("'=HIPERVINCULO");
    expect(csv.content).toContain('Calificación 0-10');
    expect(csv).not.toHaveProperty('url');
    expect(csv.byteLength).toBeLessThanOrEqual(1_048_576);
  });

  it('falla cerrado cuando excede el máximo de filas', () => {
    const rows = Array.from({ length: ACADEMIC_RESULTS_EXPORT_MAX_ROWS + 1 }, (_, index) =>
      managementRow({ enrollmentId: `${ID.enrollment}-${index}` })
    );
    expect(() => createAcademicResultsCsv({ rows, subjectName: 'Materia', periodName: 'Periodo' }))
      .toThrow();
  });
});
