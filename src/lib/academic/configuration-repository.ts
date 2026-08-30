import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@/lib/database.types';
import type {
  AcademicConfigurationDto,
  AcademicConfigurationMutationDto,
  AcademicCriterionConfigurationDto,
  AcademicSchemeConfigurationDto,
  AcademicSchemeVersionMutationDto,
} from './configuration-dto';
import type {
  AcademicActivateSchemeInput,
  AcademicCopySchemeInput,
  AcademicCriterionMutationInput,
  AcademicCycleMutationInput,
  AcademicPeriodMutationInput,
  AcademicSchemeMutationInput,
  AcademicSubcriterionMutationInput,
} from './configuration-validators';
import { AcademicApplicationError, mapSupabaseAcademicError } from './errors';
import type { AcademicRepositoryContext } from './repository';

function databaseFailure(error: unknown): never {
  throw mapSupabaseAcademicError(error);
}

function assertMutationRow<T extends { id: string; updated_at: string }>(
  row: T | null,
): AcademicConfigurationMutationDto {
  if (!row) throw new AcademicApplicationError('conflict');
  return { id: row.id, updatedAt: row.updated_at };
}

export class SupabaseAcademicConfigurationRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async load(context: AcademicRepositoryContext): Promise<AcademicConfigurationDto> {
    const tenant = context.tenantId;
    const assignmentsQuery = this.client.from('asignaciones_profesor').select('*')
      .eq('tenant_id', tenant).eq('activo', true).order('id');
    const teachersQuery = this.client.from('profiles').select('id, nombre, apellidos')
      .eq('tenant_id', tenant).eq('rol', 'profesor');
    if (context.role === 'profesor') {
      assignmentsQuery.eq('profesor_id', context.actorId);
      teachersQuery.eq('id', context.actorId);
    }
    const [
      cyclesResult, periodsResult, assignmentsResult, levelsResult, careersResult,
      gradesResult, groupsResult, subjectsResult, teachersResult, schemesResult,
      criteriaResult, subcriteriaResult,
    ] = await Promise.all([
      this.client.from('ciclos_escolares').select('*').eq('tenant_id', tenant).order('fecha_inicio', { ascending: false }),
      this.client.from('periodos_evaluacion').select('*').eq('tenant_id', tenant).order('orden'),
      assignmentsQuery,
      this.client.from('niveles').select('id, nombre').eq('tenant_id', tenant),
      this.client.from('carreras').select('id, nombre').eq('tenant_id', tenant),
      this.client.from('grados').select('id, nombre').eq('tenant_id', tenant),
      this.client.from('grupos').select('id, nombre').eq('tenant_id', tenant),
      this.client.from('materias').select('id, nombre').eq('tenant_id', tenant),
      teachersQuery,
      this.client.from('esquemas_evaluacion').select('*').eq('tenant_id', tenant).order('created_at', { ascending: false }),
      this.client.from('criterios_evaluacion').select('*').eq('tenant_id', tenant).order('orden'),
      this.client.from('subcriterios_evaluacion').select('*').eq('tenant_id', tenant).order('orden'),
    ]);
    const error = [
      cyclesResult, periodsResult, assignmentsResult, levelsResult, careersResult,
      gradesResult, groupsResult, subjectsResult, teachersResult, schemesResult,
      criteriaResult, subcriteriaResult,
    ].find((result) => result.error)?.error;
    if (error) databaseFailure(error);

    const nameMap = (rows: Array<{ id: string; nombre: string }> | null) =>
      new Map((rows ?? []).map((row) => [row.id, row.nombre]));
    const levels = nameMap(levelsResult.data);
    const careers = nameMap(careersResult.data);
    const grades = nameMap(gradesResult.data);
    const groups = nameMap(groupsResult.data);
    const subjects = nameMap(subjectsResult.data);
    const teachers = new Map((teachersResult.data ?? []).map((row) => [
      row.id,
      [row.nombre, row.apellidos].filter(Boolean).join(' '),
    ]));

    const subcriteriaByCriterion = new Map<string, AcademicCriterionConfigurationDto['subcriteria']>();
    for (const row of subcriteriaResult.data ?? []) {
      const items = subcriteriaByCriterion.get(row.criterio_evaluacion_id) ?? [];
      items.push({
        id: row.id,
        criterionId: row.criterio_evaluacion_id,
        name: row.nombre,
        type: row.tipo as 'directo' | 'actividades' | 'participacion',
        internalWeight: row.peso_interno,
        order: row.orden,
        configuration: row.configuracion,
        active: row.activo,
        updatedAt: row.updated_at,
      });
      subcriteriaByCriterion.set(row.criterio_evaluacion_id, items);
    }
    const criteriaByScheme = new Map<string, AcademicCriterionConfigurationDto[]>();
    for (const row of criteriaResult.data ?? []) {
      const items = criteriaByScheme.get(row.esquema_evaluacion_id) ?? [];
      items.push({
        id: row.id,
        schemeId: row.esquema_evaluacion_id,
        name: row.nombre,
        type: row.tipo as AcademicCriterionConfigurationDto['type'],
        weight: row.peso,
        order: row.orden,
        active: row.activo,
        updatedAt: row.updated_at,
        subcriteria: subcriteriaByCriterion.get(row.id) ?? [],
      });
      criteriaByScheme.set(row.esquema_evaluacion_id, items);
    }

    return {
      cycles: (cyclesResult.data ?? []).map((row) => ({
        id: row.id, name: row.nombre, startsOn: row.fecha_inicio, endsOn: row.fecha_fin,
        state: row.estado as AcademicConfigurationDto['cycles'][number]['state'],
        timezone: row.zona_horaria, updatedAt: row.updated_at,
      })),
      periods: (periodsResult.data ?? []).map((row) => ({
        id: row.id, cycleId: row.ciclo_escolar_id, name: row.nombre, order: row.orden,
        startsOn: row.fecha_inicio, endsOn: row.fecha_fin,
        semanticColor: row.color_semantico as AcademicConfigurationDto['periods'][number]['semanticColor'],
        state: row.estado as AcademicConfigurationDto['periods'][number]['state'],
        lockedAt: row.locked_at, updatedAt: row.updated_at,
      })),
      assignments: (assignmentsResult.data ?? []).map((row) => ({
        id: row.id, cycleId: row.ciclo_escolar_id,
        levelId: row.nivel_id, levelName: levels.get(row.nivel_id) ?? '',
        careerId: row.carrera_id, careerName: careers.get(row.carrera_id) ?? '',
        gradeId: row.grado_id, gradeName: grades.get(row.grado_id) ?? '',
        groupId: row.grupo_id, groupName: groups.get(row.grupo_id) ?? '',
        subjectId: row.materia_id, subjectName: subjects.get(row.materia_id) ?? '',
        teacherId: row.profesor_id, teacherName: teachers.get(row.profesor_id) ?? '',
      })),
      schemes: (schemesResult.data ?? []).map((row): AcademicSchemeConfigurationDto => ({
        id: row.id, cycleId: row.ciclo_escolar_id, assignmentId: row.asignacion_profesor_id,
        periodId: row.periodo_evaluacion_id, name: row.nombre, scale: '0-10',
        passingGrade: row.calificacion_aprobatoria,
        displayDecimals: row.decimales_mostrados as 0 | 1 | 2,
        roundingMode: 'half_up', missingRule: 'zero_on_close', missingValue: 0,
        excusedRule: 'exclude', state: row.estado as AcademicSchemeConfigurationDto['state'],
        version: row.version, copiedFromId: row.copiado_desde_id, updatedAt: row.updated_at,
        criteria: criteriaByScheme.get(row.id) ?? [],
      })),
    };
  }

  async saveCycle(context: AcademicRepositoryContext, input: AcademicCycleMutationInput) {
    if (!input.id) {
      const { data, error } = await this.client.from('ciclos_escolares').insert({
        tenant_id: context.tenantId, created_by: context.actorId, nombre: input.name,
        fecha_inicio: input.startsOn, fecha_fin: input.endsOn, estado: input.state,
        zona_horaria: input.timezone,
      }).select('id, updated_at').single();
      if (error) databaseFailure(error);
      return assertMutationRow(data);
    }
    const { data, error } = await this.client.from('ciclos_escolares').update({
      nombre: input.name, fecha_inicio: input.startsOn, fecha_fin: input.endsOn,
      estado: input.state, zona_horaria: input.timezone,
    }).eq('tenant_id', context.tenantId).eq('id', input.id)
      .eq('updated_at', input.expectedUpdatedAt!).select('id, updated_at').maybeSingle();
    if (error) databaseFailure(error);
    return assertMutationRow(data);
  }

  async savePeriod(context: AcademicRepositoryContext, input: AcademicPeriodMutationInput) {
    if (!input.id) {
      const { data, error } = await this.client.from('periodos_evaluacion').insert({
        tenant_id: context.tenantId, created_by: context.actorId,
        ciclo_escolar_id: input.cycleId, nombre: input.name, orden: input.order,
        fecha_inicio: input.startsOn, fecha_fin: input.endsOn,
        color_semantico: input.semanticColor, estado: input.state,
      }).select('id, updated_at').single();
      if (error) databaseFailure(error);
      return assertMutationRow(data);
    }
    const { data, error } = await this.client.from('periodos_evaluacion').update({
      nombre: input.name, orden: input.order, fecha_inicio: input.startsOn,
      fecha_fin: input.endsOn, color_semantico: input.semanticColor, estado: input.state,
    }).eq('tenant_id', context.tenantId).eq('ciclo_escolar_id', input.cycleId)
      .eq('id', input.id).eq('updated_at', input.expectedUpdatedAt!)
      .select('id, updated_at').maybeSingle();
    if (error) databaseFailure(error);
    return assertMutationRow(data);
  }

  async saveScheme(context: AcademicRepositoryContext, input: AcademicSchemeMutationInput) {
    if (!input.id) {
      const { data, error } = await this.client.from('esquemas_evaluacion').insert({
        tenant_id: context.tenantId, created_by: context.actorId,
        ciclo_escolar_id: input.cycleId, asignacion_profesor_id: input.assignmentId,
        periodo_evaluacion_id: input.periodId, nombre: input.name,
        calificacion_aprobatoria: input.passingGrade,
        decimales_mostrados: input.displayDecimals,
      }).select('id, updated_at').single();
      if (error) databaseFailure(error);
      return assertMutationRow(data);
    }
    const { data, error } = await this.client.from('esquemas_evaluacion').update({
      nombre: input.name, calificacion_aprobatoria: input.passingGrade,
      decimales_mostrados: input.displayDecimals,
    }).eq('tenant_id', context.tenantId).eq('id', input.id)
      .eq('updated_at', input.expectedUpdatedAt!).select('id, updated_at').maybeSingle();
    if (error) databaseFailure(error);
    return assertMutationRow(data);
  }

  async saveCriterion(context: AcademicRepositoryContext, input: AcademicCriterionMutationInput) {
    if (!input.id) {
      const { data, error } = await this.client.from('criterios_evaluacion').insert({
        tenant_id: context.tenantId, created_by: context.actorId,
        esquema_evaluacion_id: input.schemeId, nombre: input.name, tipo: input.type,
        peso: input.weight, orden: input.order, activo: input.active,
      }).select('id, updated_at').single();
      if (error) databaseFailure(error);
      return assertMutationRow(data);
    }
    const { data, error } = await this.client.from('criterios_evaluacion').update({
      nombre: input.name, tipo: input.type, peso: input.weight,
      orden: input.order, activo: input.active,
    }).eq('tenant_id', context.tenantId).eq('esquema_evaluacion_id', input.schemeId)
      .eq('id', input.id).eq('updated_at', input.expectedUpdatedAt!)
      .select('id, updated_at').maybeSingle();
    if (error) databaseFailure(error);
    return assertMutationRow(data);
  }

  async saveSubcriterion(context: AcademicRepositoryContext, input: AcademicSubcriterionMutationInput) {
    const configuration = input.configuration as Json;
    if (!input.id) {
      const { data, error } = await this.client.from('subcriterios_evaluacion').insert({
        tenant_id: context.tenantId, created_by: context.actorId,
        criterio_evaluacion_id: input.criterionId, nombre: input.name, tipo: input.type,
        peso_interno: input.internalWeight, orden: input.order,
        configuracion: configuration, activo: input.active,
      }).select('id, updated_at').single();
      if (error) databaseFailure(error);
      return assertMutationRow(data);
    }
    const { data, error } = await this.client.from('subcriterios_evaluacion').update({
      nombre: input.name, tipo: input.type, peso_interno: input.internalWeight,
      orden: input.order, configuracion: configuration, activo: input.active,
    }).eq('tenant_id', context.tenantId).eq('criterio_evaluacion_id', input.criterionId)
      .eq('id', input.id).eq('updated_at', input.expectedUpdatedAt!)
      .select('id, updated_at').maybeSingle();
    if (error) databaseFailure(error);
    return assertMutationRow(data);
  }

  async activateScheme(
    _context: AcademicRepositoryContext,
    input: AcademicActivateSchemeInput,
  ): Promise<AcademicSchemeVersionMutationDto> {
    const { data, error } = await this.client.rpc('activar_esquema_evaluacion', {
      target_scheme_id: input.schemeId,
      expected_scheme_version: input.expectedVersion,
    });
    if (error) databaseFailure(error);
    const row = data?.[0];
    if (!row) throw new AcademicApplicationError('not_found');
    return { schemeId: row.esquema_id, state: row.estado as 'activo', version: row.version };
  }

  async copyScheme(
    _context: AcademicRepositoryContext,
    input: AcademicCopySchemeInput,
  ): Promise<AcademicSchemeVersionMutationDto> {
    const { data, error } = await this.client.rpc('copiar_esquema_evaluacion', {
      source_scheme_id: input.schemeId,
      expected_source_version: input.expectedVersion,
      new_scheme_name: input.name,
    });
    if (error) databaseFailure(error);
    const row = data?.[0];
    if (!row) throw new AcademicApplicationError('not_found');
    return {
      schemeId: row.esquema_id,
      state: row.estado as AcademicSchemeVersionMutationDto['state'],
      version: row.version,
    };
  }
}
