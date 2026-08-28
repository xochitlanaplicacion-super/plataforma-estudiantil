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
} from './dto';
import { academicFailureResult, academicSuccessResult } from './errors';
import type { AcademicService } from './service';
import {
  academicClosureCommandSchema,
  editAcademicGradesSchema,
} from './validators';

export interface AcademicActionRevalidationScope {
  assignmentId: string;
  periodId: string;
}
export interface AcademicActionDependencies {
  createService: () => Promise<AcademicService>;
  revalidate: (scope: AcademicActionRevalidationScope) => void | Promise<void>;
}

export interface AcademicActionHandlers {
  listContext(input?: unknown): Promise<AcademicActionResult<AcademicPageDto<AcademicContextDto>>>;
  listGradebook(input: unknown): Promise<AcademicActionResult<AcademicPageDto<AcademicGradebookRowDto>>>;
  listBreakdown(input: unknown): Promise<AcademicActionResult<AcademicPageDto<AcademicBreakdownRowDto>>>;
  listMyGrades(input?: unknown): Promise<AcademicActionResult<AcademicPageDto<AcademicStudentGradeRowDto>>>;
  listAudit(input?: unknown): Promise<AcademicActionResult<AcademicPageDto<AcademicAuditDto>>>;
  calculateResult(input: unknown): Promise<AcademicActionResult<AcademicCalculatedResultDto>>;
  previewClosure(input: unknown): Promise<AcademicActionResult<AcademicClosurePreviewDto>>;
  editGrades(input: unknown): Promise<AcademicActionResult<AcademicMutationResultDto>>;
  closeGrades(input: unknown): Promise<AcademicActionResult<AcademicClosureResultDto>>;
  reopenGrades(input: unknown): Promise<AcademicActionResult<AcademicClosureResultDto>>;
}

function pageIsEmpty<T>(page: AcademicPageDto<T>): boolean {
  return page.items.length === 0;
}

export function createAcademicActionHandlers(
  dependencies: AcademicActionDependencies,
): AcademicActionHandlers {
  async function execute<T>(
    operation: (service: AcademicService) => Promise<T>,
    options: { empty?: (data: T) => boolean } = {},
  ): Promise<AcademicActionResult<T>> {
    try {
      const service = await dependencies.createService();
      const data = await operation(service);
      return academicSuccessResult(data, { empty: options.empty?.(data) ?? false });
    } catch (error) {
      return academicFailureResult(error);
    }
  }

  async function revalidateValidatedScope(
    input: unknown,
    mode: 'edit' | 'closure',
  ): Promise<void> {
    const parsed = mode === 'edit'
      ? editAcademicGradesSchema.safeParse(input)
      : academicClosureCommandSchema.safeParse(input);
    if (parsed.success) {
      await dependencies.revalidate({
        assignmentId: parsed.data.assignmentId,
        periodId: parsed.data.periodId,
      });
    }
  }

  return {
    listContext: (input = {}) => execute(
      (service) => service.listContext(input),
      { empty: pageIsEmpty },
    ),
    listGradebook: (input) => execute(
      (service) => service.listGradebook(input),
      { empty: pageIsEmpty },
    ),
    listBreakdown: (input) => execute(
      (service) => service.listBreakdown(input),
      { empty: pageIsEmpty },
    ),
    listMyGrades: (input = {}) => execute(
      (service) => service.listMyGrades(input),
      { empty: pageIsEmpty },
    ),
    listAudit: (input = {}) => execute(
      (service) => service.listAudit(input),
      { empty: pageIsEmpty },
    ),
    calculateResult: (input) => execute((service) => service.calculateResult(input)),
    previewClosure: (input) => execute((service) => service.previewClosure(input)),
    editGrades: async (input) => {
      const result = await execute((service) => service.editGrades(input));
      if (result.ok) await revalidateValidatedScope(input, 'edit');
      return result;
    },
    closeGrades: async (input) => {
      const result = await execute((service) => service.closeGrades(input));
      if (result.ok) await revalidateValidatedScope(input, 'closure');
      return result;
    },
    reopenGrades: async (input) => {
      const result = await execute((service) => service.reopenGrades(input));
      if (result.ok) await revalidateValidatedScope(input, 'closure');
      return result;
    },
  };
}
