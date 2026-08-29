import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

import type { AcademicRepositoryContext } from './repository';
import { AcademicApplicationError, mapSupabaseAcademicError } from './errors';
import type {
  AcademicGradebookCellDto,
  AcademicGradebookColumnDto,
  AcademicGradebookWorkspaceDto,
  AcademicGradeSourceType,
  AcademicGradeState,
} from './gradebook-dto';
import {
  ACADEMIC_GRADEBOOK_MAX_CELLS,
  ACADEMIC_GRADEBOOK_MAX_STUDENTS,
} from './gradebook-dto';
import type { AcademicGradebookWorkspaceQueryInput } from './gradebook-validators';

export interface AcademicGradebookRepository {
  loadWorkspace(
    context: AcademicRepositoryContext,
    input: AcademicGradebookWorkspaceQueryInput,
  ): Promise<AcademicGradebookWorkspaceDto>;
}
function fail(error: unknown): never {
  throw mapSupabaseAcademicError(error);
}

function directColumnId(criterionId: string, subcriterionId: string | null): string {
  return `direct:${criterionId}:${subcriterionId ?? 'root'}`;
}

function participationColumnId(criterionId: string, subcriterionId: string | null): string {
  return `participation:${criterionId}:${subcriterionId ?? 'root'}`;
}

function exerciseColumnId(exerciseId: string): string {
  return `exercise:${exerciseId}`;
}

function asSourceType(value: string | null): AcademicGradeSourceType | null {
  if (
    value === 'directCriterion'
    || value === 'automaticExercise'
    || value === 'descriptiveSubmission'
    || value === 'participation'
  ) return value;
  return null;
}

function asGradeState(value: string | null): AcademicGradeState {
  const allowed: ReadonlySet<string> = new Set([
    'sin_capturar', 'pendiente', 'entregado', 'tardio',
    'no_entregado', 'justificado', 'calificado',
  ]);
  return value && allowed.has(value) ? value as AcademicGradeState : 'sin_capturar';
}

export class SupabaseAcademicGradebookRepository implements AcademicGradebookRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async loadWorkspace(
    context: AcademicRepositoryContext,
    input: AcademicGradebookWorkspaceQueryInput,
  ): Promise<AcademicGradebookWorkspaceDto> {
    let assignmentQuery = this.client
      .from('asignaciones_profesor')
      .select('id, ciclo_escolar_id, materia_id, grupo_id, profesor_id, activo')
      .eq('tenant_id', context.tenantId)
      .eq('id', input.assignmentId)
      .eq('activo', true);
    if (context.role === 'profesor') {
      assignmentQuery = assignmentQuery.eq('profesor_id', context.actorId);
    }
    const assignmentResult = await assignmentQuery.maybeSingle();
    if (assignmentResult.error) fail(assignmentResult.error);
    const assignment = assignmentResult.data;
    if (!assignment) throw new AcademicApplicationError('not_found');

    const [cycleResult, periodResult, subjectResult, groupResult, teacherResult] = await Promise.all([
      this.client.from('ciclos_escolares').select('id, nombre, estado')
        .eq('tenant_id', context.tenantId).eq('id', assignment.ciclo_escolar_id).maybeSingle(),
      this.client.from('periodos_evaluacion')
        .select('id, nombre, fecha_inicio, fecha_fin, orden, estado, ciclo_escolar_id')
        .eq('tenant_id', context.tenantId).eq('id', input.periodId)
        .eq('ciclo_escolar_id', assignment.ciclo_escolar_id).maybeSingle(),
      this.client.from('materias').select('id, nombre')
        .eq('tenant_id', context.tenantId).eq('id', assignment.materia_id).maybeSingle(),
      this.client.from('grupos').select('id, nombre')
        .eq('tenant_id', context.tenantId).eq('id', assignment.grupo_id).maybeSingle(),
      this.client.from('profiles').select('id, nombre, apellidos')
        .eq('tenant_id', context.tenantId).eq('id', assignment.profesor_id).maybeSingle(),
    ]);
    const baseError = cycleResult.error ?? periodResult.error ?? subjectResult.error
      ?? groupResult.error ?? teacherResult.error;
    if (baseError) fail(baseError);
    if (!cycleResult.data || !periodResult.data) throw new AcademicApplicationError('not_found');

    const schemeResult = await this.client.from('esquemas_evaluacion')
      .select('id, nombre, version, calificacion_aprobatoria, decimales_mostrados')
      .eq('tenant_id', context.tenantId)
      .eq('asignacion_profesor_id', assignment.id)
      .eq('periodo_evaluacion_id', input.periodId)
      .eq('estado', 'activo')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (schemeResult.error) fail(schemeResult.error);

    const enrollmentsResult = await this.client.from('inscripciones_alumno')
      .select('id, alumno_id', { count: 'exact' })
      .eq('tenant_id', context.tenantId)
      .eq('ciclo_escolar_id', assignment.ciclo_escolar_id)
      .eq('grupo_id', assignment.grupo_id)
      .eq('activo', true)
      .order('id')
      .limit(ACADEMIC_GRADEBOOK_MAX_STUDENTS);
    if (enrollmentsResult.error) fail(enrollmentsResult.error);
    const enrollments = enrollmentsResult.data ?? [];
    const enrollmentIds = enrollments.map((row) => row.id);
    const studentIds = enrollments.map((row) => row.alumno_id);

    const profilesResult = studentIds.length === 0
      ? { data: [], error: null }
      : await this.client.from('profiles')
        .select('id, nombre, apellidos, matricula')
        .eq('tenant_id', context.tenantId)
        .in('id', studentIds);
    if (profilesResult.error) fail(profilesResult.error);
    const profiles = new Map((profilesResult.data ?? []).map((row) => [row.id, row]));

    const scheme = schemeResult.data;
    if (!scheme) {
      return {
        context: {
          assignmentId: assignment.id,
          cycleId: cycleResult.data.id,
          cycleName: cycleResult.data.nombre,
          cycleState: cycleResult.data.estado,
          subjectId: assignment.materia_id,
          subjectName: subjectResult.data?.nombre ?? '',
          groupId: assignment.grupo_id,
          groupName: groupResult.data?.nombre ?? '',
          teacherId: assignment.profesor_id,
          teacherName: [teacherResult.data?.nombre, teacherResult.data?.apellidos].filter(Boolean).join(' '),
          active: assignment.activo,
          periods: [{
            id: periodResult.data.id,
            name: periodResult.data.nombre,
            startsOn: periodResult.data.fecha_inicio,
            endsOn: periodResult.data.fecha_fin,
            order: periodResult.data.orden,
            state: periodResult.data.estado,
          }],
        },
        scheme: null,
        periodState: periodResult.data.estado,
        closed: periodResult.data.estado === 'cerrado',
        students: enrollments.map((row) => {
          const profile = profiles.get(row.alumno_id);
          return {
            enrollmentId: row.id,
            studentId: row.alumno_id,
            fullName: [profile?.apellidos, profile?.nombre].filter(Boolean).join(' ') || 'Alumno sin nombre',
            enrollmentCode: profile?.matricula ?? null,
          };
        }),
        columns: [], cells: [], studentCount: enrollmentsResult.count ?? enrollments.length,
        truncated: (enrollmentsResult.count ?? 0) > ACADEMIC_GRADEBOOK_MAX_STUDENTS,
        loadedAt: new Date().toISOString(),
      };
    }

    const [criteriaResult, linksResult, rowsResult, closureResult] = await Promise.all([
      this.client.from('criterios_evaluacion').select('*')
        .eq('tenant_id', context.tenantId).eq('esquema_evaluacion_id', scheme.id)
        .eq('activo', true).order('orden'),
      this.client.from('vinculos_evaluacion_ejercicio')
        .select('id, ejercicio_id, criterio_evaluacion_id, subcriterio_evaluacion_id, origen')
        .eq('tenant_id', context.tenantId).eq('asignacion_profesor_id', assignment.id)
        .eq('periodo_evaluacion_id', input.periodId).eq('activo', true),
      enrollmentIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : this.client.from('vista_libreta_profesor').select('*')
          .eq('tenant_id', context.tenantId)
          .eq('asignacion_profesor_id', assignment.id)
          .eq('periodo_evaluacion_id', input.periodId)
          .in('inscripcion_alumno_id', enrollmentIds)
          .limit(ACADEMIC_GRADEBOOK_MAX_CELLS),
      this.client.from('cierres_calificaciones').select('estado, version_cierre')
        .eq('tenant_id', context.tenantId).eq('asignacion_id', assignment.id)
        .eq('periodo_id', input.periodId).order('version_cierre', { ascending: false }).limit(1),
    ]);
    const workspaceError = criteriaResult.error ?? linksResult.error ?? rowsResult.error
      ?? closureResult.error;
    if (workspaceError) fail(workspaceError);

    const criteria = criteriaResult.data ?? [];
    const criterionIds = criteria.map((row) => row.id);
    const subcriteriaResult = criterionIds.length === 0
      ? { data: [], error: null }
      : await this.client.from('subcriterios_evaluacion').select('*')
        .eq('tenant_id', context.tenantId).in('criterio_evaluacion_id', criterionIds)
        .eq('activo', true).order('orden');
    if (subcriteriaResult.error) fail(subcriteriaResult.error);
    const subcriteria = subcriteriaResult.data ?? [];
    const subcriteriaByCriterion = new Map<string, typeof subcriteria>();
    for (const item of subcriteria) {
      const list = subcriteriaByCriterion.get(item.criterio_evaluacion_id) ?? [];
      list.push(item);
      subcriteriaByCriterion.set(item.criterio_evaluacion_id, list);
    }

    const links = linksResult.data ?? [];
    const exerciseIds = [...new Set(links.map((link) => link.ejercicio_id))];
    const exercisesResult = exerciseIds.length === 0
      ? { data: [], error: null }
      : await this.client.from('ejercicios').select('id, titulo')
        .eq('tenant_id', context.tenantId).in('id', exerciseIds);
    if (exercisesResult.error) fail(exercisesResult.error);
    const exerciseNames = new Map((exercisesResult.data ?? []).map((row) => [row.id, row.titulo]));
    const linksByExercise = new Map(links.map((row) => [row.ejercicio_id, row]));

    const sourceIds = (rowsResult.data ?? [])
      .map((row) => row.fuente_id)
      .filter((id): id is string => Boolean(id));
    const resultsResult = sourceIds.length === 0
      ? { data: [], error: null }
      : await this.client.from('resultados_ejercicios').select('id, ejercicio_id')
        .eq('tenant_id', context.tenantId).in('id', sourceIds);
    if (resultsResult.error) fail(resultsResult.error);
    const exerciseBySource = new Map((resultsResult.data ?? []).map((row) => [row.id, row.ejercicio_id]));

    const criterionById = new Map(criteria.map((row) => [row.id, row]));
    const subcriterionById = new Map(subcriteria.map((row) => [row.id, row]));
    const columns: AcademicGradebookColumnDto[] = [];
    for (const criterion of criteria) {
      const children = subcriteriaByCriterion.get(criterion.id) ?? [];
      const directChildren = children.filter((item) => item.tipo === 'directo');
      const participationChildren = children.filter((item) => item.tipo === 'participacion');
      if (criterion.tipo === 'directo' && children.length === 0) {
        columns.push({
          id: directColumnId(criterion.id, null), label: criterion.nombre,
          criterionName: criterion.nombre, subcriterionName: null,
          criterionId: criterion.id, subcriterionId: null,
          sourceType: 'directCriterion', exerciseId: null, editable: true,
          scale: '0-10', order: criterion.orden * 1_000,
        });
      }
      for (const child of directChildren) {
        columns.push({
          id: directColumnId(criterion.id, child.id), label: child.nombre,
          criterionName: criterion.nombre, subcriterionName: child.nombre,
          criterionId: criterion.id, subcriterionId: child.id,
          sourceType: 'directCriterion', exerciseId: null, editable: true,
          scale: '0-10', order: criterion.orden * 1_000 + child.orden,
        });
      }
      if (criterion.tipo === 'participacion' && children.length === 0) {
        columns.push({
          id: participationColumnId(criterion.id, null), label: criterion.nombre,
          criterionName: criterion.nombre, subcriterionName: null,
          criterionId: criterion.id, subcriterionId: null,
          sourceType: 'participation', exerciseId: null, editable: false,
          scale: '0-1', order: criterion.orden * 1_000,
        });
      }
      for (const child of participationChildren) {
        columns.push({
          id: participationColumnId(criterion.id, child.id), label: child.nombre,
          criterionName: criterion.nombre, subcriterionName: child.nombre,
          criterionId: criterion.id, subcriterionId: child.id,
          sourceType: 'participation', exerciseId: null, editable: false,
          scale: '0-1', order: criterion.orden * 1_000 + child.orden,
        });
      }
    }
    for (const link of links) {
      const sourceType = asSourceType(link.origen);
      const criterion = criterionById.get(link.criterio_evaluacion_id);
      if (!sourceType || sourceType === 'directCriterion' || sourceType === 'participation' || !criterion) continue;
      const subcriterion = link.subcriterio_evaluacion_id
        ? subcriterionById.get(link.subcriterio_evaluacion_id) : undefined;
      columns.push({
        id: exerciseColumnId(link.ejercicio_id),
        label: exerciseNames.get(link.ejercicio_id) ?? 'Actividad evaluable',
        criterionName: criterion.nombre,
        subcriterionName: subcriterion?.nombre ?? null,
        criterionId: criterion.id,
        subcriterionId: subcriterion?.id ?? null,
        sourceType,
        exerciseId: link.ejercicio_id,
        editable: true,
        scale: '0-10',
        order: criterion.orden * 1_000 + (subcriterion?.orden ?? 0) + 500,
      });
    }
    columns.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'es'));
    const columnById = new Map(columns.map((column) => [column.id, column]));

    const cells: AcademicGradebookCellDto[] = [];
    for (const row of rowsResult.data ?? []) {
      if (!row.inscripcion_alumno_id || !row.criterio_evaluacion_id) continue;
      const sourceType = asSourceType(row.tipo_fuente);
      if (!sourceType) continue;
      let columnId: string;
      if (sourceType === 'directCriterion') {
        columnId = directColumnId(row.criterio_evaluacion_id, row.subcriterio_evaluacion_id);
      } else if (sourceType === 'participation') {
        columnId = participationColumnId(row.criterio_evaluacion_id, row.subcriterio_evaluacion_id);
      } else {
        const exerciseId = row.fuente_id ? exerciseBySource.get(row.fuente_id) : null;
        if (!exerciseId || !linksByExercise.has(exerciseId)) continue;
        columnId = exerciseColumnId(exerciseId);
      }
      const column = columnById.get(columnId);
      if (!column) continue;
      cells.push({
        enrollmentId: row.inscripcion_alumno_id,
        columnId,
        sourceId: row.fuente_id,
        sourceType,
        criterionId: row.criterio_evaluacion_id,
        subcriterionId: row.subcriterio_evaluacion_id,
        state: asGradeState(row.estado),
        grade: row.valor_fuente,
        observation: row.observacion,
        rowVersion: row.row_version ?? 0,
        updatedAt: row.actualizado_at,
        editable: column.editable && sourceType !== 'participation',
      });
    }

    const latestClosure = closureResult.data?.[0];
    const closed = periodResult.data.estado === 'cerrado' || latestClosure?.estado === 'cerrado';
    const teacher = teacherResult.data;
    return {
      context: {
        assignmentId: assignment.id,
        cycleId: cycleResult.data.id,
        cycleName: cycleResult.data.nombre,
        cycleState: cycleResult.data.estado,
        subjectId: assignment.materia_id,
        subjectName: subjectResult.data?.nombre ?? '',
        groupId: assignment.grupo_id,
        groupName: groupResult.data?.nombre ?? '',
        teacherId: assignment.profesor_id,
        teacherName: [teacher?.nombre, teacher?.apellidos].filter(Boolean).join(' '),
        active: assignment.activo,
        periods: [{
          id: periodResult.data.id, name: periodResult.data.nombre,
          startsOn: periodResult.data.fecha_inicio, endsOn: periodResult.data.fecha_fin,
          order: periodResult.data.orden, state: periodResult.data.estado,
        }],
      },
      scheme: {
        id: scheme.id, name: scheme.nombre, version: scheme.version,
        passingGrade: scheme.calificacion_aprobatoria,
        displayDecimals: scheme.decimales_mostrados as 0 | 1 | 2,
      },
      periodState: periodResult.data.estado,
      closed,
      students: enrollments.map((row) => {
        const profile = profiles.get(row.alumno_id);
        return {
          enrollmentId: row.id,
          studentId: row.alumno_id,
          fullName: [profile?.apellidos, profile?.nombre].filter(Boolean).join(' ') || 'Alumno sin nombre',
          enrollmentCode: profile?.matricula ?? null,
        };
      }),
      columns,
      cells,
      studentCount: enrollmentsResult.count ?? enrollments.length,
      truncated: (enrollmentsResult.count ?? 0) > ACADEMIC_GRADEBOOK_MAX_STUDENTS,
      loadedAt: new Date().toISOString(),
    };
  }
}
