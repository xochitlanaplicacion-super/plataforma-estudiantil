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
import { isAcademicGradingV2Enabled } from '@/lib/academic/feature-flags';
import { SupabaseAcademicRepository } from '@/lib/academic/repository';
import { revalidateAcademicRoutes } from '@/lib/academic/revalidation';
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
