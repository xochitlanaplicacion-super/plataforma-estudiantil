import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@/lib/database.types';

import type { AcademicPageDto } from './dto';
import { AcademicApplicationError, mapSupabaseAcademicError } from './errors';
import type { AcademicRepositoryContext } from './repository';
import type {
  AcademicResultsExportDto,
  AcademicStudentResultDto,
  AcademicStudentResultsDto,
  AcademicTenantResultsDto,
  AcademicTenantStudentResultDto,
} from './results-dto';
import {
  ACADEMIC_RESULTS_MAX_SOURCE_ROWS,
  ACADEMIC_RESULTS_MAX_STUDENTS,
} from './results-dto';
import { createAcademicResultsCsv } from './results-export';
import {
  projectAcademicResult,
  summarizeTenantResults,
  type AcademicResultProjectionContext,
} from './results-projector';
import type {
  AcademicStudentResultsQueryInput,
  AcademicTenantResultsExportInput,
  AcademicTenantResultsQueryInput,
} from './results-validators';

type StudentSourceRow = Tables<'vista_calificaciones_alumno'>;
type ManagementSourceRow = Tables<'vista_desglose_calificacion'>;
type ClosureRow = Tables<'cierres_calificaciones'>;

interface AssignmentRow {
  id: string;
  ciclo_escolar_id: string;
  materia_id: string;
  grupo_id: string;
  profesor_id: string;
  activo: boolean;
}

interface EnrollmentRow {
  id: string;
  alumno_id: string;
  ciclo_escolar_id: string;
  grupo_id: string;
}

interface PeriodRow {
  id: string;
  ciclo_escolar_id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  orden: number;
  estado: string;
}

interface SchemeRow {
  id: string;
  asignacion_profesor_id: string;
  periodo_evaluacion_id: string;
  version: number;
  calificacion_aprobatoria: number;
  decimales_mostrados: number;
  estado: string;
}

interface NamedRow { id: string; nombre: string }
interface TeacherRow { id: string; nombre: string; apellidos: string }
interface StudentProfileRow extends TeacherRow { matricula: string | null }

export interface AcademicResultsRepository {
  listMyResults(
    context: AcademicRepositoryContext,
    input: AcademicStudentResultsQueryInput,
  ): Promise<AcademicStudentResultsDto>;
  listTenantResults(
    context: AcademicRepositoryContext,
    input: AcademicTenantResultsQueryInput,
  ): Promise<AcademicTenantResultsDto>;
  exportTenantResults(
    context: AcademicRepositoryContext,
    input: AcademicTenantResultsExportInput,
  ): Promise<AcademicResultsExportDto>;
}

function fail(error: unknown): never {
  throw mapSupabaseAcademicError(error);
}

function bounded<T>(rows: readonly T[], maximum: number, message: string): readonly T[] {
  if (rows.length > maximum) throw new AcademicApplicationError('conflict', { cause: new Error(message) });
  return rows;
}

function key(...values: Array<string | null>): string {
  return values.join(':');
}

function asDecimals(value: number): 0 | 1 | 2 {
  if (value === 0 || value === 1 || value === 2) return value;
  throw new AcademicApplicationError('unexpected');
}

function latestClosures(rows: readonly ClosureRow[]): Map<string, ClosureRow> {
  const result = new Map<string, ClosureRow>();
  for (const row of rows) {
    const scope = key(row.inscripcion_id, row.asignacion_id, row.periodo_id);
    const current = result.get(scope);
    if (!current || row.version_cierre > current.version_cierre) result.set(scope, row);
  }
  return result;
}

function groupSources<T extends StudentSourceRow | ManagementSourceRow>(
  rows: readonly T[],
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.inscripcion_alumno_id || !row.asignacion_profesor_id || !row.periodo_evaluacion_id) continue;
    const scope = key(row.inscripcion_alumno_id, row.asignacion_profesor_id, row.periodo_evaluacion_id);
    const list = result.get(scope) ?? [];
    list.push(row);
    result.set(scope, list);
  }
  return result;
}

function pageOf<T>(items: readonly T[], page: number, pageSize: number): AcademicPageDto<T> {
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize;
  return {
    items: items.slice(from, from + pageSize),
    page,
    pageSize,
    total,
    totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
    hasNextPage: page < totalPages,
  };
}

function projectContext(input: {
  assignment: AssignmentRow;
  enrollment: EnrollmentRow;
  period: PeriodRow;
  scheme: SchemeRow;
  cycle: NamedRow | undefined;
  subject: NamedRow | undefined;
  group: NamedRow | undefined;
  teacher: TeacherRow | undefined;
}): AcademicResultProjectionContext {
  return {
    assignmentId: input.assignment.id,
    enrollmentId: input.enrollment.id,
    cycleId: input.assignment.ciclo_escolar_id,
    cycleName: input.cycle?.nombre ?? 'Ciclo sin nombre',
    subjectId: input.assignment.materia_id,
    subjectName: input.subject?.nombre ?? 'Materia sin nombre',
    groupId: input.assignment.grupo_id,
    groupName: input.group?.nombre ?? 'Grupo sin nombre',
    teacherId: input.assignment.profesor_id,
    teacherName: [input.teacher?.nombre, input.teacher?.apellidos].filter(Boolean).join(' ') || 'Profesor sin nombre',
    periodId: input.period.id,
    periodName: input.period.nombre,
    periodState: input.period.estado,
    schemeId: input.scheme.id,
    schemeVersion: input.scheme.version,
    passingGrade: input.scheme.calificacion_aprobatoria,
    displayDecimals: asDecimals(input.scheme.decimales_mostrados),
  };
}

export class SupabaseAcademicResultsRepository implements AcademicResultsRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async listMyResults(
    context: AcademicRepositoryContext,
    input: AcademicStudentResultsQueryInput,
  ): Promise<AcademicStudentResultsDto> {
    let enrollmentQuery = this.client.from('inscripciones_alumno')
      .select('id, alumno_id, ciclo_escolar_id, grupo_id')
      .eq('tenant_id', context.tenantId)
      .eq('alumno_id', context.actorId)
      .eq('activo', true)
      .order('id')
      .limit(51);
    if (input.cycleId) enrollmentQuery = enrollmentQuery.eq('ciclo_escolar_id', input.cycleId);
    const enrollmentResult = await enrollmentQuery;
    if (enrollmentResult.error) fail(enrollmentResult.error);
    const enrollments = bounded(
      enrollmentResult.data ?? [], 50,
      'La consulta del alumno excede el límite de matrículas activas.',
    ) as readonly EnrollmentRow[];
    if (enrollments.length === 0) {
      return {
        ...pageOf([], input.page, input.pageSize),
        cycles: [], periods: [], generatedAt: new Date().toISOString(),
      };
    }

    const cycleIds = [...new Set(enrollments.map((row) => row.ciclo_escolar_id))];
    const groupIds = [...new Set(enrollments.map((row) => row.grupo_id))];
    const assignmentResult = await this.client.from('asignaciones_profesor')
      .select('id, ciclo_escolar_id, materia_id, grupo_id, profesor_id, activo')
      .eq('tenant_id', context.tenantId)
      .eq('activo', true)
      .in('ciclo_escolar_id', cycleIds)
      .in('grupo_id', groupIds)
      .order('id')
      .limit(ACADEMIC_RESULTS_MAX_STUDENTS + 1);
    if (assignmentResult.error) fail(assignmentResult.error);
    const assignments = bounded(
      assignmentResult.data ?? [], ACADEMIC_RESULTS_MAX_STUDENTS,
      'Las asignaciones visibles exceden el límite seguro.',
    ).filter((assignment) => enrollments.some((enrollment) =>
      enrollment.ciclo_escolar_id === assignment.ciclo_escolar_id
      && enrollment.grupo_id === assignment.grupo_id
    )) as readonly AssignmentRow[];
    if (assignments.length === 0) {
      return {
        ...pageOf([], input.page, input.pageSize),
        cycles: [], periods: [], generatedAt: new Date().toISOString(),
      };
    }

    const assignmentIds = assignments.map((row) => row.id);
    const [periodResult, schemeResult, cycleResult, subjectResult, groupResult, teacherResult] = await Promise.all([
      this.client.from('periodos_evaluacion')
        .select('id, ciclo_escolar_id, nombre, fecha_inicio, fecha_fin, orden, estado')
        .eq('tenant_id', context.tenantId).in('ciclo_escolar_id', cycleIds).order('orden').limit(500),
      this.client.from('esquemas_evaluacion')
        .select('id, asignacion_profesor_id, periodo_evaluacion_id, version, calificacion_aprobatoria, decimales_mostrados, estado')
        .eq('tenant_id', context.tenantId).eq('estado', 'activo')
        .in('asignacion_profesor_id', assignmentIds).limit(500),
      this.client.from('ciclos_escolares').select('id, nombre')
        .eq('tenant_id', context.tenantId).in('id', cycleIds),
      this.client.from('materias').select('id, nombre')
        .eq('tenant_id', context.tenantId).in('id', [...new Set(assignments.map((row) => row.materia_id))]),
      this.client.from('grupos').select('id, nombre')
        .eq('tenant_id', context.tenantId).in('id', groupIds),
      this.client.from('profiles').select('id, nombre, apellidos')
        .eq('tenant_id', context.tenantId).in('id', [...new Set(assignments.map((row) => row.profesor_id))]),
    ]);
    const metadataError = periodResult.error ?? schemeResult.error ?? cycleResult.error
      ?? subjectResult.error ?? groupResult.error ?? teacherResult.error;
    if (metadataError) fail(metadataError);
    const periods = (periodResult.data ?? []) as PeriodRow[];
    const schemes = (schemeResult.data ?? []) as SchemeRow[];
    const selectedPeriods = input.periodId
      ? periods.filter((period) => period.id === input.periodId)
      : periods;
    const scopes = schemes.flatMap((scheme) => {
      const assignment = assignments.find((row) => row.id === scheme.asignacion_profesor_id);
      const period = selectedPeriods.find((row) => row.id === scheme.periodo_evaluacion_id);
      const enrollment = assignment && enrollments.find((row) =>
        row.ciclo_escolar_id === assignment.ciclo_escolar_id && row.grupo_id === assignment.grupo_id
      );
      return assignment && period && enrollment ? [{ assignment, period, enrollment, scheme }] : [];
    });
    if (scopes.length === 0) {
      return {
        ...pageOf([], input.page, input.pageSize),
        cycles: (cycleResult.data ?? []).map((row) => ({ id: row.id, name: row.nombre })),
        periods: periods.map((row) => ({ id: row.id, cycleId: row.ciclo_escolar_id, name: row.nombre, state: row.estado })),
        generatedAt: new Date().toISOString(),
      };
    }

    const enrollmentIds = [...new Set(scopes.map((scope) => scope.enrollment.id))];
    const periodIds = [...new Set(scopes.map((scope) => scope.period.id))];
    const [sourcesResult, closuresResult] = await Promise.all([
      this.client.from('vista_calificaciones_alumno').select('*')
        .eq('tenant_id', context.tenantId).eq('alumno_id', context.actorId)
        .in('asignacion_profesor_id', assignmentIds)
        .in('periodo_evaluacion_id', periodIds)
        .order('criterio_evaluacion_id').order('fuente_id')
        .limit(ACADEMIC_RESULTS_MAX_SOURCE_ROWS + 1),
      this.client.from('cierres_calificaciones').select('*')
        .eq('tenant_id', context.tenantId)
        .in('inscripcion_id', enrollmentIds)
        .in('asignacion_id', assignmentIds)
        .in('periodo_id', periodIds)
        .order('version_cierre', { ascending: false })
        .limit(ACADEMIC_RESULTS_MAX_SOURCE_ROWS + 1),
    ]);
    const dataError = sourcesResult.error ?? closuresResult.error;
    if (dataError) fail(dataError);
    const sources = bounded(
      sourcesResult.data ?? [], ACADEMIC_RESULTS_MAX_SOURCE_ROWS,
      'Las fuentes del alumno exceden el límite seguro.',
    ) as readonly StudentSourceRow[];
    const closures = bounded(
      closuresResult.data ?? [], ACADEMIC_RESULTS_MAX_SOURCE_ROWS,
      'El historial de cierres excede el límite seguro.',
    ) as readonly ClosureRow[];
    const groupedSources = groupSources(sources);
    const latest = latestClosures(closures);
    const cycles = new Map((cycleResult.data ?? []).map((row) => [row.id, row]));
    const subjects = new Map((subjectResult.data ?? []).map((row) => [row.id, row]));
    const groups = new Map((groupResult.data ?? []).map((row) => [row.id, row]));
    const teachers = new Map((teacherResult.data ?? []).map((row) => [row.id, row]));
    const items: AcademicStudentResultDto[] = scopes.map((scope) => {
      const scopeKey = key(scope.enrollment.id, scope.assignment.id, scope.period.id);
      return projectAcademicResult({
        context: projectContext({
          ...scope,
          cycle: cycles.get(scope.assignment.ciclo_escolar_id),
          subject: subjects.get(scope.assignment.materia_id),
          group: groups.get(scope.assignment.grupo_id),
          teacher: teachers.get(scope.assignment.profesor_id),
        }),
        rows: groupedSources.get(scopeKey) ?? [],
        latestClosure: latest.get(scopeKey) ?? null,
      });
    }).sort((a, b) =>
      a.cycleName.localeCompare(b.cycleName, 'es')
      || a.periodName.localeCompare(b.periodName, 'es')
      || a.subjectName.localeCompare(b.subjectName, 'es')
    );
    return {
      ...pageOf(items, input.page, input.pageSize),
      cycles: (cycleResult.data ?? []).map((row) => ({ id: row.id, name: row.nombre })),
      periods: periods.map((row) => ({ id: row.id, cycleId: row.ciclo_escolar_id, name: row.nombre, state: row.estado })),
      generatedAt: new Date().toISOString(),
    };
  }

  private async tenantProjection(
    context: AcademicRepositoryContext,
    input: AcademicTenantResultsExportInput,
  ): Promise<{
    context: AcademicTenantResultsDto['context'];
    period: PeriodRow;
    rows: AcademicTenantStudentResultDto[];
  }> {
    const assignmentResult = await this.client.from('asignaciones_profesor')
      .select('id, ciclo_escolar_id, materia_id, grupo_id, profesor_id, activo')
      .eq('tenant_id', context.tenantId).eq('id', input.assignmentId).eq('activo', true).maybeSingle();
    if (assignmentResult.error) fail(assignmentResult.error);
    if (!assignmentResult.data) throw new AcademicApplicationError('not_found');
    const assignment = assignmentResult.data as AssignmentRow;
    const [periodResult, schemeResult, cycleResult, subjectResult, groupResult, teacherResult, enrollmentResult] = await Promise.all([
      this.client.from('periodos_evaluacion')
        .select('id, ciclo_escolar_id, nombre, fecha_inicio, fecha_fin, orden, estado')
        .eq('tenant_id', context.tenantId).eq('id', input.periodId)
        .eq('ciclo_escolar_id', assignment.ciclo_escolar_id).maybeSingle(),
      this.client.from('esquemas_evaluacion')
        .select('id, asignacion_profesor_id, periodo_evaluacion_id, version, calificacion_aprobatoria, decimales_mostrados, estado')
        .eq('tenant_id', context.tenantId).eq('asignacion_profesor_id', assignment.id)
        .eq('periodo_evaluacion_id', input.periodId).eq('estado', 'activo')
        .order('version', { ascending: false }).limit(1).maybeSingle(),
      this.client.from('ciclos_escolares').select('id, nombre')
        .eq('tenant_id', context.tenantId).eq('id', assignment.ciclo_escolar_id).maybeSingle(),
      this.client.from('materias').select('id, nombre')
        .eq('tenant_id', context.tenantId).eq('id', assignment.materia_id).maybeSingle(),
      this.client.from('grupos').select('id, nombre')
        .eq('tenant_id', context.tenantId).eq('id', assignment.grupo_id).maybeSingle(),
      this.client.from('profiles').select('id, nombre, apellidos')
        .eq('tenant_id', context.tenantId).eq('id', assignment.profesor_id).maybeSingle(),
      this.client.from('inscripciones_alumno').select('id, alumno_id, ciclo_escolar_id, grupo_id')
        .eq('tenant_id', context.tenantId).eq('ciclo_escolar_id', assignment.ciclo_escolar_id)
        .eq('grupo_id', assignment.grupo_id).eq('activo', true).order('id')
        .limit(ACADEMIC_RESULTS_MAX_STUDENTS + 1),
    ]);
    const metadataError = periodResult.error ?? schemeResult.error ?? cycleResult.error
      ?? subjectResult.error ?? groupResult.error ?? teacherResult.error ?? enrollmentResult.error;
    if (metadataError) fail(metadataError);
    if (!periodResult.data || !schemeResult.data || !cycleResult.data) {
      throw new AcademicApplicationError('not_found');
    }
    const period = periodResult.data as PeriodRow;
    const scheme = schemeResult.data as SchemeRow;
    const enrollments = bounded(
      enrollmentResult.data ?? [], ACADEMIC_RESULTS_MAX_STUDENTS,
      'El grupo excede el límite seguro de 200 alumnos.',
    ) as readonly EnrollmentRow[];
    const enrollmentIds = enrollments.map((row) => row.id);
    const studentIds = enrollments.map((row) => row.alumno_id);
    const [profilesResult, sourcesResult, closuresResult] = await Promise.all([
      studentIds.length === 0 ? Promise.resolve({ data: [], error: null })
        : this.client.from('profiles').select('id, nombre, apellidos, matricula')
          .eq('tenant_id', context.tenantId).in('id', studentIds),
      enrollmentIds.length === 0 ? Promise.resolve({ data: [], error: null })
        : this.client.from('vista_desglose_calificacion').select('*')
          .eq('tenant_id', context.tenantId).eq('asignacion_profesor_id', assignment.id)
          .eq('periodo_evaluacion_id', period.id).in('inscripcion_alumno_id', enrollmentIds)
          .order('inscripcion_alumno_id').order('criterio_evaluacion_id').order('fuente_id')
          .limit(ACADEMIC_RESULTS_MAX_SOURCE_ROWS + 1),
      enrollmentIds.length === 0 ? Promise.resolve({ data: [], error: null })
        : this.client.from('cierres_calificaciones').select('*')
          .eq('tenant_id', context.tenantId).eq('asignacion_id', assignment.id)
          .eq('periodo_id', period.id).in('inscripcion_id', enrollmentIds)
          .order('version_cierre', { ascending: false })
          .limit(ACADEMIC_RESULTS_MAX_SOURCE_ROWS + 1),
    ]);
    const dataError = profilesResult.error ?? sourcesResult.error ?? closuresResult.error;
    if (dataError) fail(dataError);
    const sources = bounded(
      sourcesResult.data ?? [], ACADEMIC_RESULTS_MAX_SOURCE_ROWS,
      'Las fuentes del grupo exceden el límite seguro.',
    ) as readonly ManagementSourceRow[];
    const closures = bounded(
      closuresResult.data ?? [], ACADEMIC_RESULTS_MAX_SOURCE_ROWS,
      'El historial de cierres del grupo excede el límite seguro.',
    ) as readonly ClosureRow[];
    const profiles = new Map((profilesResult.data ?? []).map((row) => [row.id, row as StudentProfileRow]));
    const groupedSources = groupSources(sources);
    const latest = latestClosures(closures);
    const rows = enrollments.map((enrollment): AcademicTenantStudentResultDto => {
      const scopeKey = key(enrollment.id, assignment.id, period.id);
      const profile = profiles.get(enrollment.alumno_id);
      return {
        ...projectAcademicResult({
          context: projectContext({
            assignment, enrollment, period, scheme,
            cycle: cycleResult.data ?? undefined,
            subject: subjectResult.data ?? undefined,
            group: groupResult.data ?? undefined,
            teacher: teacherResult.data ?? undefined,
          }),
          rows: groupedSources.get(scopeKey) ?? [],
          latestClosure: latest.get(scopeKey) ?? null,
        }),
        studentId: enrollment.alumno_id,
        studentName: [profile?.apellidos, profile?.nombre].filter(Boolean).join(' ') || 'Alumno sin nombre',
        enrollmentCode: profile?.matricula ?? null,
      };
    }).sort((a, b) => a.studentName.localeCompare(b.studentName, 'es'));
    return {
      context: {
        assignmentId: assignment.id,
        cycleId: assignment.ciclo_escolar_id,
        cycleName: cycleResult.data.nombre,
        cycleState: '',
        subjectId: assignment.materia_id,
        subjectName: subjectResult.data?.nombre ?? 'Materia sin nombre',
        groupId: assignment.grupo_id,
        groupName: groupResult.data?.nombre ?? 'Grupo sin nombre',
        teacherId: assignment.profesor_id,
        teacherName: [teacherResult.data?.nombre, teacherResult.data?.apellidos].filter(Boolean).join(' ') || 'Profesor sin nombre',
        active: assignment.activo,
        periods: [{
          id: period.id,
          name: period.nombre,
          startsOn: period.fecha_inicio,
          endsOn: period.fecha_fin,
          order: period.orden,
          state: period.estado,
        }],
      },
      period,
      rows,
    };
  }

  async listTenantResults(
    context: AcademicRepositoryContext,
    input: AcademicTenantResultsQueryInput,
  ): Promise<AcademicTenantResultsDto> {
    const projection = await this.tenantProjection(context, input);
    const closureVersion = projection.rows.reduce<number | null>((latest, row) => {
      if (row.closureVersion === null) return latest;
      return latest === null ? row.closureVersion : Math.max(latest, row.closureVersion);
    }, null);
    return {
      context: projection.context,
      periodId: projection.period.id,
      periodName: projection.period.nombre,
      periodState: projection.period.estado,
      closureVersion,
      results: pageOf(projection.rows, input.page, input.pageSize),
      summary: summarizeTenantResults(projection.rows),
      generatedAt: new Date().toISOString(),
    };
  }

  async exportTenantResults(
    context: AcademicRepositoryContext,
    input: AcademicTenantResultsExportInput,
  ): Promise<AcademicResultsExportDto> {
    const projection = await this.tenantProjection(context, input);
    return createAcademicResultsCsv({
      rows: projection.rows,
      subjectName: projection.context.subjectName,
      periodName: projection.period.nombre,
    });
  }
}
