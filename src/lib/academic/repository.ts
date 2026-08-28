import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodType } from 'zod';

import type { Database, Json } from '@/lib/database.types';

import type {
  AcademicAuditDto,
  AcademicBreakdownRowDto,
  AcademicCalculatedResultDto,
  AcademicClosurePreviewDto,
  AcademicClosureResultDto,
  AcademicContextDto,
  AcademicGradebookRowDto,
  AcademicMutationResultDto,
  AcademicPageDto,
  AcademicPageRequest,
  AcademicStudentGradeRowDto,
  AcademicApplicationRole,
} from './dto';
import { AcademicApplicationError, mapSupabaseAcademicError } from './errors';
import type {
  AcademicAuditQueryInput,
  AcademicBreakdownQueryInput,
  AcademicClosureCommandInput,
  AcademicScopeQueryInput,
  AcademicStudentGradesQueryInput,
  EditAcademicGradesInput,
} from './validators';
import {
  academicCalculatedResultSchema,
  academicClosurePreviewSchema,
  academicClosureResultSchema,
  academicMutationResultSchema,
} from './validators';

export interface AcademicRepositoryContext {
  tenantId: string;
  actorId: string;
  role: AcademicApplicationRole;
}
export interface AcademicRepository {
  listContext(
    context: AcademicRepositoryContext,
    page: AcademicPageRequest,
  ): Promise<AcademicPageDto<AcademicContextDto>>;
  listGradebook(
    context: AcademicRepositoryContext,
    input: AcademicScopeQueryInput,
  ): Promise<AcademicPageDto<AcademicGradebookRowDto>>;
  listBreakdown(
    context: AcademicRepositoryContext,
    input: AcademicBreakdownQueryInput,
  ): Promise<AcademicPageDto<AcademicBreakdownRowDto>>;
  listStudentGrades(
    context: AcademicRepositoryContext,
    input: AcademicStudentGradesQueryInput,
  ): Promise<AcademicPageDto<AcademicStudentGradeRowDto>>;
  listAudit(
    context: AcademicRepositoryContext,
    input: AcademicAuditQueryInput,
  ): Promise<AcademicPageDto<AcademicAuditDto>>;
  calculateResult(
    context: AcademicRepositoryContext,
    input: AcademicBreakdownQueryInput,
  ): Promise<AcademicCalculatedResultDto>;
  previewClosure(
    context: AcademicRepositoryContext,
    input: Pick<AcademicScopeQueryInput, 'assignmentId' | 'periodId'>,
  ): Promise<AcademicClosurePreviewDto>;
  editGrades(
    context: AcademicRepositoryContext,
    input: EditAcademicGradesInput,
  ): Promise<AcademicMutationResultDto>;
  closeGrades(
    context: AcademicRepositoryContext,
    input: AcademicClosureCommandInput,
  ): Promise<AcademicClosureResultDto>;
  reopenGrades(
    context: AcademicRepositoryContext,
    input: AcademicClosureCommandInput,
  ): Promise<AcademicClosureResultDto>;
}

function toRange(page: AcademicPageRequest): { from: number; to: number } {
  const from = (page.page - 1) * page.pageSize;
  return { from, to: from + page.pageSize - 1 };
}

function toPage<T>(items: T[], count: number | null, page: AcademicPageRequest): AcademicPageDto<T> {
  const total = count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / page.pageSize);
  return {
    items,
    page: page.page,
    pageSize: page.pageSize,
    total,
    totalPages,
    hasPreviousPage: page.page > 1,
    hasNextPage: page.page < totalPages,
  };
}

function throwDatabaseError(error: unknown): never {
  throw mapSupabaseAcademicError(error);
}

function parseDatabaseContract<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AcademicApplicationError('unexpected', { cause: parsed.error });
  }
  return parsed.data;
}

function jsonPayload(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export class SupabaseAcademicRepository implements AcademicRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async listContext(
    context: AcademicRepositoryContext,
    page: AcademicPageRequest,
  ): Promise<AcademicPageDto<AcademicContextDto>> {
    const { from, to } = toRange(page);
    let assignmentsQuery = this.client
      .from('asignaciones_profesor')
      .select(
        'id, ciclo_escolar_id, materia_id, grupo_id, profesor_id, activo',
        { count: 'exact' },
      )
      .eq('tenant_id', context.tenantId)
      .eq('activo', true);
    if (context.role === 'profesor') {
      assignmentsQuery = assignmentsQuery.eq('profesor_id', context.actorId);
    }
    const assignmentsResult = await assignmentsQuery.order('id').range(from, to);
    if (assignmentsResult.error) throwDatabaseError(assignmentsResult.error);
    const assignments = assignmentsResult.data ?? [];
    if (assignments.length === 0) {
      return toPage([], assignmentsResult.count, page);
    }

    const cycleIds = [...new Set(assignments.map((row) => row.ciclo_escolar_id))];
    const subjectIds = [...new Set(assignments.map((row) => row.materia_id))];
    const groupIds = [...new Set(assignments.map((row) => row.grupo_id))];
    const teacherIds = [...new Set(assignments.map((row) => row.profesor_id))];
    const [cyclesResult, periodsResult, subjectsResult, groupsResult, teachersResult] = await Promise.all([
      this.client
        .from('ciclos_escolares')
        .select('id, nombre, estado')
        .eq('tenant_id', context.tenantId)
        .in('id', cycleIds),
      this.client
        .from('periodos_evaluacion')
        .select('id, ciclo_escolar_id, nombre, fecha_inicio, fecha_fin, orden, estado')
        .eq('tenant_id', context.tenantId)
        .in('ciclo_escolar_id', cycleIds)
        .order('orden')
        .limit(page.pageSize * 20),
      this.client
        .from('materias')
        .select('id, nombre')
        .eq('tenant_id', context.tenantId)
        .in('id', subjectIds),
      this.client
        .from('grupos')
        .select('id, nombre')
        .eq('tenant_id', context.tenantId)
        .in('id', groupIds),
      this.client
        .from('profiles')
        .select('id, nombre, apellidos')
        .eq('tenant_id', context.tenantId)
        .in('id', teacherIds),
    ]);
    const firstError = cyclesResult.error
      ?? periodsResult.error
      ?? subjectsResult.error
      ?? groupsResult.error
      ?? teachersResult.error;
    if (firstError) throwDatabaseError(firstError);

    const cyclesById = new Map((cyclesResult.data ?? []).map((row) => [row.id, row]));
    const subjectsById = new Map((subjectsResult.data ?? []).map((row) => [row.id, row]));
    const groupsById = new Map((groupsResult.data ?? []).map((row) => [row.id, row]));
    const teachersById = new Map((teachersResult.data ?? []).map((row) => [row.id, row]));
    const periodsByCycle = new Map<string, AcademicContextDto['periods']>();
    for (const period of periodsResult.data ?? []) {
      const periods = periodsByCycle.get(period.ciclo_escolar_id) ?? [];
      periods.push({
        id: period.id,
        name: period.nombre,
        startsOn: period.fecha_inicio,
        endsOn: period.fecha_fin,
        order: period.orden,
        state: period.estado,
      });
      periodsByCycle.set(period.ciclo_escolar_id, periods);
    }

    const items = assignments.map((assignment): AcademicContextDto => {
      const cycle = cyclesById.get(assignment.ciclo_escolar_id);
      const subject = subjectsById.get(assignment.materia_id);
      const group = groupsById.get(assignment.grupo_id);
      const teacher = teachersById.get(assignment.profesor_id);
      return {
        assignmentId: assignment.id,
        cycleId: assignment.ciclo_escolar_id,
        cycleName: cycle?.nombre ?? '',
        cycleState: cycle?.estado ?? '',
        subjectId: assignment.materia_id,
        subjectName: subject?.nombre ?? '',
        groupId: assignment.grupo_id,
        groupName: group?.nombre ?? '',
        teacherId: assignment.profesor_id,
        teacherName: [teacher?.nombre, teacher?.apellidos].filter(Boolean).join(' '),
        active: assignment.activo,
        periods: periodsByCycle.get(assignment.ciclo_escolar_id) ?? [],
      };
    });
    return toPage(items, assignmentsResult.count, page);
  }

  async listGradebook(
    context: AcademicRepositoryContext,
    input: AcademicScopeQueryInput,
  ): Promise<AcademicPageDto<AcademicGradebookRowDto>> {
    const { from, to } = toRange(input);
    const { data, error, count } = await this.client
      .from('vista_libreta_profesor')
      .select('*', { count: 'exact' })
      .eq('tenant_id', context.tenantId)
      .eq('asignacion_profesor_id', input.assignmentId)
      .eq('periodo_evaluacion_id', input.periodId)
      .order('inscripcion_alumno_id')
      .order('criterio_evaluacion_id')
      .order('fuente_id')
      .range(from, to);
    if (error) throwDatabaseError(error);
    return toPage(data ?? [], count, input);
  }

  async listBreakdown(
    context: AcademicRepositoryContext,
    input: AcademicBreakdownQueryInput,
  ): Promise<AcademicPageDto<AcademicBreakdownRowDto>> {
    const { from, to } = toRange(input);
    const { data, error, count } = await this.client
      .from('vista_desglose_calificacion')
      .select('*', { count: 'exact' })
      .eq('tenant_id', context.tenantId)
      .eq('asignacion_profesor_id', input.assignmentId)
      .eq('inscripcion_alumno_id', input.enrollmentId)
      .eq('periodo_evaluacion_id', input.periodId)
      .order('criterio_evaluacion_id')
      .order('subcriterio_evaluacion_id')
      .order('fuente_id')
      .range(from, to);
    if (error) throwDatabaseError(error);
    return toPage(data ?? [], count, input);
  }

  async listStudentGrades(
    context: AcademicRepositoryContext,
    input: AcademicStudentGradesQueryInput,
  ): Promise<AcademicPageDto<AcademicStudentGradeRowDto>> {
    const { from, to } = toRange(input);
    let query = this.client
      .from('vista_calificaciones_alumno')
      .select('*', { count: 'exact' })
      .eq('tenant_id', context.tenantId)
      .eq('alumno_id', context.actorId);
    if (input.periodId) query = query.eq('periodo_evaluacion_id', input.periodId);
    const { data, error, count } = await query
      .order('periodo_evaluacion_id')
      .order('criterio_evaluacion_id')
      .order('fuente_id')
      .range(from, to);
    if (error) throwDatabaseError(error);
    return toPage(data ?? [], count, input);
  }

  async listAudit(
    context: AcademicRepositoryContext,
    input: AcademicAuditQueryInput,
  ): Promise<AcademicPageDto<AcademicAuditDto>> {
    const { from, to } = toRange(input);
    let query = this.client
      .from('auditoria')
      .select('id, accion, entidad, entidad_id, user_id, created_at, detalles', { count: 'exact' })
      .eq('tenant_id', context.tenantId)
      .like('accion', 'academic.%');
    if (input.correlationId) {
      query = query.contains('detalles', { correlationId: input.correlationId });
    }
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) throwDatabaseError(error);
    const items = (data ?? []).map((row): AcademicAuditDto => ({
      id: row.id,
      action: row.accion,
      entity: row.entidad,
      entityId: row.entidad_id,
      actorId: row.user_id,
      createdAt: row.created_at,
      details: row.detalles,
    }));
    return toPage(items, count, input);
  }

  async calculateResult(
    _context: AcademicRepositoryContext,
    input: AcademicBreakdownQueryInput,
  ): Promise<AcademicCalculatedResultDto> {
    const { data, error } = await this.client.rpc('calcular_resultado_academico', {
      p_asignacion_id: input.assignmentId,
      p_inscripcion_id: input.enrollmentId,
      p_periodo_id: input.periodId,
    });
    if (error) throwDatabaseError(error);
    return parseDatabaseContract(academicCalculatedResultSchema, data);
  }

  async previewClosure(
    _context: AcademicRepositoryContext,
    input: Pick<AcademicScopeQueryInput, 'assignmentId' | 'periodId'>,
  ): Promise<AcademicClosurePreviewDto> {
    const { data, error } = await this.client.rpc('previsualizar_cierre_calificaciones', {
      p_asignacion_id: input.assignmentId,
      p_periodo_id: input.periodId,
    });
    if (error) throwDatabaseError(error);
    return parseDatabaseContract(academicClosurePreviewSchema, data);
  }

  async editGrades(
    _context: AcademicRepositoryContext,
    input: EditAcademicGradesInput,
  ): Promise<AcademicMutationResultDto> {
    const { data, error } = await this.client.rpc('editar_calificaciones_academicas', {
      p_asignacion_id: input.assignmentId,
      p_periodo_id: input.periodId,
      p_items: jsonPayload(input.items),
      p_motivo: input.reason,
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: input.correlationId ?? null,
    });
    if (error) throwDatabaseError(error);
    return parseDatabaseContract(academicMutationResultSchema, data);
  }

  async closeGrades(
    _context: AcademicRepositoryContext,
    input: AcademicClosureCommandInput,
  ): Promise<AcademicClosureResultDto> {
    const { data, error } = await this.client.rpc('cerrar_calificaciones_academicas', {
      p_asignacion_id: input.assignmentId,
      p_periodo_id: input.periodId,
      p_motivo: input.reason,
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: input.correlationId ?? null,
    });
    if (error) throwDatabaseError(error);
    return parseDatabaseContract(academicClosureResultSchema, data);
  }

  async reopenGrades(
    _context: AcademicRepositoryContext,
    input: AcademicClosureCommandInput,
  ): Promise<AcademicClosureResultDto> {
    const { data, error } = await this.client.rpc('reabrir_calificaciones_academicas', {
      p_asignacion_id: input.assignmentId,
      p_periodo_id: input.periodId,
      p_motivo: input.reason,
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: input.correlationId ?? null,
    });
    if (error) throwDatabaseError(error);
    return parseDatabaseContract(academicClosureResultSchema, data);
  }
}
