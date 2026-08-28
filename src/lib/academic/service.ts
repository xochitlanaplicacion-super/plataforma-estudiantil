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
  AcademicStudentGradeRowDto,
  AcademicApplicationRole,
} from './dto';
import {
  ACADEMIC_READ_TIMEOUT_MS,
  ACADEMIC_WRITE_TIMEOUT_MS,
} from './dto';
import { AcademicApplicationError } from './errors';
import type { AcademicRepository, AcademicRepositoryContext } from './repository';
import {
  academicAuditQuerySchema,
  academicBreakdownQuerySchema,
  academicClosureCommandSchema,
  academicContextQuerySchema,
  academicScopeQuerySchema,
  academicStudentGradesQuerySchema,
  editAcademicGradesSchema,
} from './validators';

export interface AcademicServiceContext {
  tenantId: string;
  actorId: string;
  role: AcademicApplicationRole;
  featureEnabled: boolean;
}
const MANAGEMENT_ROLES: ReadonlySet<AcademicApplicationRole> = new Set([
  'superuser',
  'admin',
]);
const GRADEBOOK_ROLES: ReadonlySet<AcademicApplicationRole> = new Set([
  'superuser',
  'admin',
  'profesor',
]);

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new AcademicApplicationError('timeout')),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([operation, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class AcademicService {
  private readonly repositoryContext: AcademicRepositoryContext;

  constructor(
    private readonly repository: AcademicRepository,
    private readonly context: AcademicServiceContext,
  ) {
    this.repositoryContext = {
      tenantId: context.tenantId,
      actorId: context.actorId,
      role: context.role,
    };
  }

  private authorize(roles: ReadonlySet<AcademicApplicationRole>): void {
    if (!this.context.featureEnabled) throw new AcademicApplicationError('disabled');
    if (!roles.has(this.context.role)) throw new AcademicApplicationError('forbidden');
  }

  async listContext(input: unknown = {}): Promise<AcademicPageDto<AcademicContextDto>> {
    this.authorize(GRADEBOOK_ROLES);
    const parsed = academicContextQuerySchema.parse(input);
    return withTimeout(
      this.repository.listContext(this.repositoryContext, parsed),
      ACADEMIC_READ_TIMEOUT_MS,
    );
  }

  async listGradebook(input: unknown): Promise<AcademicPageDto<AcademicGradebookRowDto>> {
    this.authorize(GRADEBOOK_ROLES);
    const parsed = academicScopeQuerySchema.parse(input);
    return withTimeout(
      this.repository.listGradebook(this.repositoryContext, parsed),
      ACADEMIC_READ_TIMEOUT_MS,
    );
  }

  async listBreakdown(input: unknown): Promise<AcademicPageDto<AcademicBreakdownRowDto>> {
    this.authorize(GRADEBOOK_ROLES);
    const parsed = academicBreakdownQuerySchema.parse(input);
    return withTimeout(
      this.repository.listBreakdown(this.repositoryContext, parsed),
      ACADEMIC_READ_TIMEOUT_MS,
    );
  }

  async listMyGrades(input: unknown = {}): Promise<AcademicPageDto<AcademicStudentGradeRowDto>> {
    this.authorize(new Set<AcademicApplicationRole>(['alumno']));
    const parsed = academicStudentGradesQuerySchema.parse(input);
    return withTimeout(
      this.repository.listStudentGrades(this.repositoryContext, parsed),
      ACADEMIC_READ_TIMEOUT_MS,
    );
  }

  async listAudit(input: unknown = {}): Promise<AcademicPageDto<AcademicAuditDto>> {
    this.authorize(MANAGEMENT_ROLES);
    const parsed = academicAuditQuerySchema.parse(input);
    return withTimeout(
      this.repository.listAudit(this.repositoryContext, parsed),
      ACADEMIC_READ_TIMEOUT_MS,
    );
  }

  async calculateResult(input: unknown): Promise<AcademicCalculatedResultDto> {
    this.authorize(GRADEBOOK_ROLES);
    const parsed = academicBreakdownQuerySchema.parse(input);
    return withTimeout(
      this.repository.calculateResult(this.repositoryContext, parsed),
      ACADEMIC_READ_TIMEOUT_MS,
    );
  }

  async previewClosure(input: unknown): Promise<AcademicClosurePreviewDto> {
    this.authorize(MANAGEMENT_ROLES);
    const parsed = academicScopeQuerySchema.parse(input);
    return withTimeout(
      this.repository.previewClosure(this.repositoryContext, parsed),
      ACADEMIC_READ_TIMEOUT_MS,
    );
  }

  async editGrades(input: unknown): Promise<AcademicMutationResultDto> {
    this.authorize(GRADEBOOK_ROLES);
    const parsed = editAcademicGradesSchema.parse(input);
    return withTimeout(
      this.repository.editGrades(this.repositoryContext, parsed),
      ACADEMIC_WRITE_TIMEOUT_MS,
    );
  }

  async closeGrades(input: unknown): Promise<AcademicClosureResultDto> {
    this.authorize(MANAGEMENT_ROLES);
    const parsed = academicClosureCommandSchema.parse(input);
    return withTimeout(
      this.repository.closeGrades(this.repositoryContext, parsed),
      ACADEMIC_WRITE_TIMEOUT_MS,
    );
  }

  async reopenGrades(input: unknown): Promise<AcademicClosureResultDto> {
    this.authorize(MANAGEMENT_ROLES);
    const parsed = academicClosureCommandSchema.parse(input);
    return withTimeout(
      this.repository.reopenGrades(this.repositoryContext, parsed),
      ACADEMIC_WRITE_TIMEOUT_MS,
    );
  }
}
