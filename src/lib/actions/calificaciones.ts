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
  AcademicConfigurationMutationDto,
  AcademicSchemeVersionMutationDto,
} from '@/lib/academic/configuration-dto';
import { SupabaseAcademicConfigurationRepository } from '@/lib/academic/configuration-repository';
import { AcademicConfigurationService } from '@/lib/academic/configuration-service';
import { academicFailureResult, academicSuccessResult } from '@/lib/academic/errors';
import { isAcademicGradingV2Enabled } from '@/lib/academic/feature-flags';
import { SupabaseAcademicRepository } from '@/lib/academic/repository';
import {
  revalidateAcademicConfigurationRoutes,
  revalidateAcademicRoutes,
} from '@/lib/academic/revalidation';
import { AcademicService } from '@/lib/academic/service';
import { requireTenantSession } from '@/lib/tenant/context';

async function createAcademicServiceForRequest(): Promise<AcademicService> {
  const session = await requireTenantSession();
  const repository = new SupabaseAcademicRepository(session.supabase);
  return new AcademicService(repository, {
    tenantId: session.tenantId,
    actorId: session.user.id,
    role: session.profile.rol,
    featureEnabled: isAcademicGradingV2Enabled(
      { tenantId: session.tenantId, tenantSlug: session.tenant.slug },
      {
        ACADEMIC_GRADING_V2_ENABLED: process.env.ACADEMIC_GRADING_V2_ENABLED,
        ACADEMIC_GRADING_V2_TENANTS: process.env.ACADEMIC_GRADING_V2_TENANTS,
      },
    ),
  });
}

async function createAcademicConfigurationServiceForRequest(): Promise<AcademicConfigurationService> {
  const session = await requireTenantSession();
  const repository = new SupabaseAcademicConfigurationRepository(session.supabase);
  return new AcademicConfigurationService(repository, {
    tenantId: session.tenantId,
    actorId: session.user.id,
    role: session.profile.rol,
    featureEnabled: isAcademicGradingV2Enabled(
      { tenantId: session.tenantId, tenantSlug: session.tenant.slug },
      {
        ACADEMIC_GRADING_V2_ENABLED: process.env.ACADEMIC_GRADING_V2_ENABLED,
        ACADEMIC_GRADING_V2_TENANTS: process.env.ACADEMIC_GRADING_V2_TENANTS,
      },
    ),
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
