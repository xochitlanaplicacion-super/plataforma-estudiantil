'use server';

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
