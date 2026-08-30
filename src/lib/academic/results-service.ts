import type { AcademicRepositoryContext } from './repository';
import { ACADEMIC_READ_TIMEOUT_MS } from './dto';
import { AcademicApplicationError } from './errors';
import type { AcademicResultsRepository } from './results-repository';
import type {
  AcademicResultsExportDto,
  AcademicStudentResultsDto,
  AcademicTenantResultsDto,
} from './results-dto';
import {
  academicStudentResultsQuerySchema,
  academicTenantResultsExportSchema,
  academicTenantResultsQuerySchema,
} from './results-validators';

export interface AcademicResultsServiceContext extends AcademicRepositoryContext {
  featureEnabled: boolean;
}

const MANAGEMENT_ROLES = new Set(['superuser', 'admin']);

async function withResultsTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new AcademicApplicationError('timeout')), ACADEMIC_READ_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class AcademicResultsService {
  private readonly repositoryContext: AcademicRepositoryContext;

  constructor(
    private readonly repository: AcademicResultsRepository,
    private readonly context: AcademicResultsServiceContext,
  ) {
    this.repositoryContext = {
      tenantId: context.tenantId,
      actorId: context.actorId,
      role: context.role,
    };
  }

  private enabled(): void {
    if (!this.context.featureEnabled) throw new AcademicApplicationError('disabled');
  }

  async listMyResults(input: unknown = {}): Promise<AcademicStudentResultsDto> {
    this.enabled();
    if (this.context.role !== 'alumno') throw new AcademicApplicationError('forbidden');
    const parsed = academicStudentResultsQuerySchema.parse(input);
    return withResultsTimeout(this.repository.listMyResults(this.repositoryContext, parsed));
  }

  async listTenantResults(input: unknown): Promise<AcademicTenantResultsDto> {
    this.enabled();
    if (!MANAGEMENT_ROLES.has(this.context.role)) throw new AcademicApplicationError('forbidden');
    const parsed = academicTenantResultsQuerySchema.parse(input);
    return withResultsTimeout(this.repository.listTenantResults(this.repositoryContext, parsed));
  }

  async exportTenantResults(input: unknown): Promise<AcademicResultsExportDto> {
    this.enabled();
    if (!MANAGEMENT_ROLES.has(this.context.role)) throw new AcademicApplicationError('forbidden');
    const parsed = academicTenantResultsExportSchema.parse(input);
    return withResultsTimeout(this.repository.exportTenantResults(this.repositoryContext, parsed));
  }
}
