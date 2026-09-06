'use server';

import { z } from 'zod';

import {
  createAcademicActionHandlers,
  type AcademicActionHandlers,
} from '@/lib/academic/action-handler';
import type {
  AcademicActionResult,
  AcademicAuditDto,
  AcademicBreakdownRowDto,
  AcademicCalculatedResultDto,
  AcademicClosurePreviewDto,
  AcademicClosureResultDto,
  AcademicContextDto,
  AcademicGradebookRowDto,
  AcademicMutationResultDto,
  AcademicPageDto,
  AcademicStudentGradeRowDto,
} from '@/lib/academic/dto';
import type {
  AcademicConfigurationDto,
  AcademicConfigurationDeletionDto,
  AcademicConfigurationMutationDto,
  AcademicSchemeVersionMutationDto,
} from '@/lib/academic/configuration-dto';
import { SupabaseAcademicConfigurationRepository } from '@/lib/academic/configuration-repository';
import { AcademicConfigurationService } from '@/lib/academic/configuration-service';
import { academicFailureResult, academicSuccessResult } from '@/lib/academic/errors';
import {
  isAcademicGradingV2Enabled,
  type AcademicRolloutMode,
} from '@/lib/academic/feature-flags';
import { SupabaseAcademicRepository } from '@/lib/academic/repository';
import {
  revalidateAcademicConfigurationRoutes,
  revalidateAcademicRoutes,
} from '@/lib/academic/revalidation';
import { AcademicService } from '@/lib/academic/service';
import type { AcademicGradebookWorkspaceDto } from '@/lib/academic/gradebook-dto';
import { SupabaseAcademicGradebookRepository } from '@/lib/academic/gradebook-repository';
import { AcademicGradebookService } from '@/lib/academic/gradebook-service';
import type {
  AcademicResultsExportDto,
  AcademicStudentResultsDto,
  AcademicTenantResultsDto,
} from '@/lib/academic/results-dto';
import { SupabaseAcademicResultsRepository } from '@/lib/academic/results-repository';
import { AcademicResultsService } from '@/lib/academic/results-service';
import { requireTenantSession } from '@/lib/tenant/context';

type TenantSession = Awaited<ReturnType<typeof requireTenantSession>>;

export interface TeacherMobileCaptureSettingDto {
  criterionId: string;
  minimumGrade: number;
  increment: 0.1 | 0.5 | 1;
  qrReader: boolean;
  confirmBeforeSave: boolean;
}

export interface TeacherQrBatchDto {
  institution: { name: string; logoUrl: string | null; primaryColor: string };
  cycleName: string;
  periodName: string;
  assignment: { id: string; subjectName: string; groupName: string };
  students: { enrollmentId: string; name: string; enrollmentCode: string | null; token: string }[];
}

export interface TeacherProvisionalLinksDto {
  provisionals: { id: string; name: string; createdAt: string; captureCount: number }[];
  candidates: { enrollmentId: string; name: string; enrollmentCode: string | null }[];
}

const teacherMobileCaptureSettingSchema = z.object({
  criterionId: z.string().uuid(),
  minimumGrade: z.number().int().min(0).max(10),
  increment: z.union([z.literal(0.1), z.literal(0.5), z.literal(1)]),
  qrReader: z.boolean(),
  confirmBeforeSave: z.boolean(),
});

const teacherMobileContextQrSchema = z.object({
  tenant: z.object({
    name: z.string(),
    logoUrl: z.string().nullable().optional(),
    primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  }),
  cycle: z.object({ name: z.string() }),
  period: z.object({ name: z.string() }),
  assignments: z.array(z.object({
    id: z.string().uuid(),
    subjectName: z.string(),
    groupName: z.string(),
    students: z.array(z.object({
      enrollmentId: z.string().uuid(),
      name: z.string(),
      enrollmentCode: z.string().nullable().optional(),
    })),
  })),
});

const teacherQrTokensSchema = z.array(z.object({
  enrollmentId: z.string().uuid(),
  token: z.string().uuid(),
}));

const teacherProvisionalLinksSchema = z.object({
  provisionals: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    createdAt: z.string(),
    captureCount: z.number().int().nonnegative(),
  })),
  candidates: z.array(z.object({
    enrollmentId: z.string().uuid(),
    name: z.string(),
    enrollmentCode: z.string().nullable().optional(),
  })),
});

export async function loadTeacherProvisionalLinksAction(assignmentIdInput: unknown): Promise<AcademicActionResult<TeacherProvisionalLinksDto>> {
  try {
    const assignmentId = z.string().uuid().parse(assignmentIdInput);
    const session = await requireTenantSession(['profesor']);
    const { data, error } = await session.supabase.rpc('obtener_vinculaciones_provisionales_docente', {
      p_asignacion_id: assignmentId,
    });
    if (error) throw error;
    const parsed = teacherProvisionalLinksSchema.parse(data);
    return academicSuccessResult({
      provisionals: parsed.provisionals,
      candidates: parsed.candidates.map((candidate) => ({ ...candidate, enrollmentCode: candidate.enrollmentCode ?? null })),
    }, { empty: parsed.provisionals.length === 0 });
  } catch (error) {
    return academicFailureResult(error);
  }
}

export async function linkTeacherProvisionalStudentAction(input: unknown): Promise<AcademicActionResult<{ provisionalId: string; enrollmentId: string; migratedCaptures: number }>> {
  try {
    const parsed = z.object({ provisionalId: z.string().uuid(), enrollmentId: z.string().uuid() }).parse(input);
    const session = await requireTenantSession(['profesor']);
    const { data, error } = await session.supabase.rpc('vincular_alumno_provisional_docente', {
      p_alumno_provisional_id: parsed.provisionalId,
      p_inscripcion_id: parsed.enrollmentId,
    });
    if (error) throw error;
    const result = z.object({
      provisionalId: z.string().uuid(),
      enrollmentId: z.string().uuid(),
      migratedCaptures: z.number().int().nonnegative(),
    }).parse(data);
    revalidateAcademicConfigurationRoutes();
    revalidateAcademicRoutes({ assignmentId: '', periodId: '' });
    return academicSuccessResult(result);
  } catch (error) {
    return academicFailureResult(error);
  }
}

export async function loadTeacherQrBatchAction(assignmentIdInput: unknown): Promise<AcademicActionResult<TeacherQrBatchDto>> {
  try {
    const assignmentId = z.string().uuid().parse(assignmentIdInput);
    const session = await requireTenantSession(['profesor']);
    const [{ data: contextData, error: contextError }, { data: tokenData, error: tokenError }] = await Promise.all([
      session.supabase.rpc('obtener_contexto_docente_movil'),
      session.supabase.rpc('obtener_qrs_docente_movil', { p_asignacion_id: assignmentId }),
    ]);
    if (contextError) throw contextError;
    if (tokenError) throw tokenError;
    const context = teacherMobileContextQrSchema.parse(contextData);
    const tokens = teacherQrTokensSchema.parse(tokenData);
    const assignment = context.assignments.find((row) => row.id === assignmentId);
    if (!assignment) throw new Error('La materia seleccionada no pertenece al profesor o al ciclo activo.');
    const tokenByEnrollment = new Map(tokens.map((row) => [row.enrollmentId, row.token]));
    const students = assignment.students.flatMap((student) => {
      const token = tokenByEnrollment.get(student.enrollmentId);
      return token ? [{
        enrollmentId: student.enrollmentId,
        name: student.name,
        enrollmentCode: student.enrollmentCode ?? null,
        token,
      }] : [];
    });
    return academicSuccessResult({
      institution: {
        name: context.tenant.name,
        logoUrl: context.tenant.logoUrl ?? null,
        primaryColor: context.tenant.primaryColor ?? '#00b894',
      },
      cycleName: context.cycle.name,
      periodName: context.period.name,
      assignment: {
        id: assignment.id,
        subjectName: assignment.subjectName,
        groupName: assignment.groupName,
      },
      students,
    }, { empty: students.length === 0 });
  } catch (error) {
    return academicFailureResult(error);
  }
}

export async function loadTeacherMobileCaptureSettingsAction(): Promise<AcademicActionResult<TeacherMobileCaptureSettingDto[]>> {
  try {
    const session = await requireTenantSession(['profesor']);
    const { data, error } = await session.supabase
      .from('configuracion_captura_docente')
      .select('criterio_evaluacion_id,calificacion_minima,incremento,lector_qr,confirmar_antes_guardar')
      .eq('tenant_id', session.tenantId)
      .eq('profesor_id', session.user.id);
    if (error) throw error;
    const settings = (data ?? []).map((row) => ({
      criterionId: row.criterio_evaluacion_id,
      minimumGrade: row.calificacion_minima,
      increment: Number(row.incremento) as 0.1 | 0.5 | 1,
      qrReader: row.lector_qr,
      confirmBeforeSave: row.confirmar_antes_guardar,
    }));
    return academicSuccessResult(settings, { empty: settings.length === 0 });
  } catch (error) {
    return academicFailureResult(error);
  }
}

export async function saveTeacherMobileCaptureSettingAction(input: unknown): Promise<AcademicActionResult<TeacherMobileCaptureSettingDto>> {
  try {
    const parsed = teacherMobileCaptureSettingSchema.parse(input);
    const session = await requireTenantSession(['profesor']);
    const { data, error } = await session.supabase
      .from('configuracion_captura_docente')
      .upsert({
        tenant_id: session.tenantId,
        profesor_id: session.user.id,
        criterio_evaluacion_id: parsed.criterionId,
        calificacion_minima: parsed.minimumGrade,
        incremento: parsed.increment,
        lector_qr: parsed.qrReader,
        confirmar_antes_guardar: parsed.confirmBeforeSave,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,profesor_id,criterio_evaluacion_id' })
      .select('criterio_evaluacion_id,calificacion_minima,incremento,lector_qr,confirmar_antes_guardar')
      .single();
    if (error) throw error;
    revalidateAcademicConfigurationRoutes();
    return academicSuccessResult({
      criterionId: data.criterio_evaluacion_id,
      minimumGrade: data.calificacion_minima,
      increment: Number(data.incremento) as 0.1 | 0.5 | 1,
      qrReader: data.lector_qr,
      confirmBeforeSave: data.confirmar_antes_guardar,
    });
  } catch (error) {
    return academicFailureResult(error);
  }
}

async function resolveAcademicFeatureForSession(session: TenantSession): Promise<boolean> {
  const { data, error } = await session.admin
    .from('tenant_academic_rollout')
    .select('mode')
    .eq('tenant_id', session.tenantId)
    .maybeSingle();
  const rolloutMode = !error && (data?.mode === 'legacy'
    || data?.mode === 'dual'
    || data?.mode === 'canonical')
    ? data.mode as AcademicRolloutMode
    : null;

  return isAcademicGradingV2Enabled(
    { tenantId: session.tenantId, tenantSlug: session.tenant.slug },
    {
      ACADEMIC_GRADING_V2_ENABLED: process.env.ACADEMIC_GRADING_V2_ENABLED,
      ACADEMIC_GRADING_V2_TENANTS: process.env.ACADEMIC_GRADING_V2_TENANTS,
    },
    rolloutMode,
  );
}

async function createAcademicServiceForRequest(): Promise<AcademicService> {
  const session = await requireTenantSession();
  const repository = new SupabaseAcademicRepository(session.supabase);
  return new AcademicService(repository, {
    tenantId: session.tenantId,
    actorId: session.user.id,
    role: session.profile.rol,
    featureEnabled: await resolveAcademicFeatureForSession(session),
  });
}

async function createAcademicConfigurationServiceForRequest(): Promise<AcademicConfigurationService> {
  const session = await requireTenantSession();
  const repository = new SupabaseAcademicConfigurationRepository(session.supabase);
  return new AcademicConfigurationService(repository, {
    tenantId: session.tenantId,
    actorId: session.user.id,
    role: session.profile.rol,
    featureEnabled: await resolveAcademicFeatureForSession(session),
  });
}

async function createAcademicGradebookServiceForRequest(): Promise<AcademicGradebookService> {
  const session = await requireTenantSession(['profesor']);
  const repository = new SupabaseAcademicGradebookRepository(session.supabase);
  return new AcademicGradebookService(repository, {
    tenantId: session.tenantId,
    actorId: session.user.id,
    role: session.profile.rol,
    featureEnabled: await resolveAcademicFeatureForSession(session),
  });
}

async function createAcademicResultsServiceForRequest(): Promise<AcademicResultsService> {
  const session = await requireTenantSession();
  const repository = new SupabaseAcademicResultsRepository(session.supabase);
  return new AcademicResultsService(repository, {
    tenantId: session.tenantId,
    actorId: session.user.id,
    role: session.profile.rol,
    featureEnabled: await resolveAcademicFeatureForSession(session),
  });
}

async function executeConfiguration<T>(
  operation: (service: AcademicConfigurationService) => Promise<T>,
  options: { revalidate?: boolean; empty?: (value: T) => boolean } = {},
): Promise<AcademicActionResult<T>> {
  try {
    const service = await createAcademicConfigurationServiceForRequest();
    const data = await operation(service);
    if (options.revalidate) revalidateAcademicConfigurationRoutes();
    return academicSuccessResult(data, { empty: options.empty?.(data) ?? false });
  } catch (error) {
    return academicFailureResult(error);
  }
}
const actions: AcademicActionHandlers = createAcademicActionHandlers({
  createService: createAcademicServiceForRequest,
  revalidate: revalidateAcademicRoutes,
});

export async function listAcademicContextAction(
  input: unknown = {},
): Promise<AcademicActionResult<AcademicPageDto<AcademicContextDto>>> {
  return actions.listContext(input);
}

export async function listAcademicGradebookAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicPageDto<AcademicGradebookRowDto>>> {
  return actions.listGradebook(input);
}

export async function listAcademicBreakdownAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicPageDto<AcademicBreakdownRowDto>>> {
  return actions.listBreakdown(input);
}

export async function listMyAcademicGradesAction(
  input: unknown = {},
): Promise<AcademicActionResult<AcademicPageDto<AcademicStudentGradeRowDto>>> {
  return actions.listMyGrades(input);
}

export async function listAcademicAuditAction(
  input: unknown = {},
): Promise<AcademicActionResult<AcademicPageDto<AcademicAuditDto>>> {
  return actions.listAudit(input);
}

export async function calculateAcademicResultAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicCalculatedResultDto>> {
  return actions.calculateResult(input);
}

export async function previewAcademicClosureAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicClosurePreviewDto>> {
  return actions.previewClosure(input);
}

export async function saveAcademicGradesAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicMutationResultDto>> {
  return actions.editGrades(input);
}

export async function closeAcademicGradesAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicClosureResultDto>> {
  return actions.closeGrades(input);
}

export async function reopenAcademicGradesAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicClosureResultDto>> {
  return actions.reopenGrades(input);
}

export async function loadAcademicGradebookWorkspaceAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicGradebookWorkspaceDto>> {
  try {
    const service = await createAcademicGradebookServiceForRequest();
    const data = await service.loadWorkspace(input);
    return academicSuccessResult(data, {
      empty: data.students.length === 0 || data.columns.length === 0,
    });
  } catch (error) {
    return academicFailureResult(error);
  }
}

export async function loadMyAcademicResultsAction(
  input: unknown = {},
): Promise<AcademicActionResult<AcademicStudentResultsDto>> {
  try {
    const service = await createAcademicResultsServiceForRequest();
    const data = await service.listMyResults(input);
    return academicSuccessResult(data, { empty: data.items.length === 0 });
  } catch (error) {
    return academicFailureResult(error);
  }
}

export async function loadAcademicTenantResultsAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicTenantResultsDto>> {
  try {
    const service = await createAcademicResultsServiceForRequest();
    const data = await service.listTenantResults(input);
    return academicSuccessResult(data, { empty: data.results.items.length === 0 });
  } catch (error) {
    return academicFailureResult(error);
  }
}

export async function exportAcademicTenantResultsAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicResultsExportDto>> {
  try {
    const service = await createAcademicResultsServiceForRequest();
    const data = await service.exportTenantResults(input);
    return academicSuccessResult(data, { empty: data.rowCount === 0 });
  } catch (error) {
    return academicFailureResult(error);
  }
}

export async function loadAcademicConfigurationAction(): Promise<AcademicActionResult<AcademicConfigurationDto>> {
  return executeConfiguration(
    (service) => service.load(),
    { empty: (configuration) => configuration.cycles.length === 0 },
  );
}

export async function saveAcademicCycleAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicConfigurationMutationDto>> {
  return executeConfiguration((service) => service.saveCycle(input), { revalidate: true });
}

export async function saveAcademicPeriodAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicConfigurationMutationDto>> {
  return executeConfiguration((service) => service.savePeriod(input), { revalidate: true });
}

export async function saveAcademicSchemeAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicConfigurationMutationDto>> {
  return executeConfiguration((service) => service.saveScheme(input), { revalidate: true });
}

export async function saveAcademicCriterionAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicConfigurationMutationDto>> {
  return executeConfiguration((service) => service.saveCriterion(input), { revalidate: true });
}

export async function saveAcademicSubcriterionAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicConfigurationMutationDto>> {
  return executeConfiguration((service) => service.saveSubcriterion(input), { revalidate: true });
}

export async function deleteAcademicSubcriterionAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicConfigurationDeletionDto>> {
  return executeConfiguration((service) => service.deleteSubcriterion(input), { revalidate: true });
}

export async function activateAcademicSchemeAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicSchemeVersionMutationDto>> {
  return executeConfiguration((service) => service.activateScheme(input), { revalidate: true });
}

export async function copyAcademicSchemeAction(
  input: unknown,
): Promise<AcademicActionResult<AcademicSchemeVersionMutationDto>> {
  return executeConfiguration((service) => service.copyScheme(input), { revalidate: true });
}

export async function distributeAcademicSchemeAction(input: unknown) {
  return executeConfiguration((service) => service.distributeScheme(input), { revalidate: true });
}
