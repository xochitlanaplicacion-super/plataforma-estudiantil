import type { AcademicRepositoryContext } from './repository';
import { AcademicApplicationError } from './errors';
import type { AcademicGradebookRepository } from './gradebook-repository';
import type { AcademicGradebookWorkspaceDto } from './gradebook-dto';
import { academicGradebookWorkspaceQuerySchema } from './gradebook-validators';
import { ACADEMIC_READ_TIMEOUT_MS } from './dto';

export interface AcademicGradebookServiceContext extends AcademicRepositoryContext {
  featureEnabled: boolean;
}

async function withGradebookTimeout<T>(operation: Promise<T>): Promise<T> {
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

export class AcademicGradebookService {
  constructor(
    private readonly repository: AcademicGradebookRepository,
    private readonly context: AcademicGradebookServiceContext,
  ) {}

  async loadWorkspace(input: unknown): Promise<AcademicGradebookWorkspaceDto> {
    if (!this.context.featureEnabled) throw new AcademicApplicationError('disabled');
    if (this.context.role !== 'profesor') throw new AcademicApplicationError('forbidden');
    const parsed = academicGradebookWorkspaceQuerySchema.parse(input);
    return withGradebookTimeout(this.repository.loadWorkspace({
      tenantId: this.context.tenantId,
      actorId: this.context.actorId,
      role: this.context.role,
    }, parsed));
  }
}
