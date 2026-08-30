import type {
  AcademicConfigurationDto,
  AcademicConfigurationMutationDto,
  AcademicSchemeVersionMutationDto,
} from './configuration-dto';
import { SupabaseAcademicConfigurationRepository } from './configuration-repository';
import {
  academicActivateSchemeSchema,
  academicCopySchemeSchema,
  academicCriterionMutationSchema,
  academicCycleMutationSchema,
  academicPeriodMutationSchema,
  academicSchemeMutationSchema,
  academicSubcriterionMutationSchema,
} from './configuration-validators';
import { AcademicApplicationError } from './errors';
import type { AcademicServiceContext } from './service';

export class AcademicConfigurationService {
  constructor(
    private readonly repository: SupabaseAcademicConfigurationRepository,
    private readonly context: AcademicServiceContext,
  ) {}

  private authorizeConfiguration(): void {
    if (!this.context.featureEnabled) throw new AcademicApplicationError('disabled');
    if (!['superuser', 'admin', 'profesor'].includes(this.context.role)) {
      throw new AcademicApplicationError('forbidden');
    }
  }

  private authorizeAdministration(): void {
    this.authorizeConfiguration();
    if (this.context.role !== 'superuser' && this.context.role !== 'admin') {
      throw new AcademicApplicationError('forbidden');
    }
  }

  private repositoryContext() {
    return {
      tenantId: this.context.tenantId,
      actorId: this.context.actorId,
      role: this.context.role,
    };
  }

  async load(): Promise<AcademicConfigurationDto> {
    this.authorizeConfiguration();
    return this.repository.load(this.repositoryContext());
  }

  async saveCycle(input: unknown): Promise<AcademicConfigurationMutationDto> {
    this.authorizeAdministration();
    return this.repository.saveCycle(this.repositoryContext(), academicCycleMutationSchema.parse(input));
  }

  async savePeriod(input: unknown): Promise<AcademicConfigurationMutationDto> {
    this.authorizeAdministration();
    return this.repository.savePeriod(this.repositoryContext(), academicPeriodMutationSchema.parse(input));
  }

  async saveScheme(input: unknown): Promise<AcademicConfigurationMutationDto> {
    this.authorizeConfiguration();
    return this.repository.saveScheme(this.repositoryContext(), academicSchemeMutationSchema.parse(input));
  }

  async saveCriterion(input: unknown): Promise<AcademicConfigurationMutationDto> {
    this.authorizeConfiguration();
    return this.repository.saveCriterion(this.repositoryContext(), academicCriterionMutationSchema.parse(input));
  }

  async saveSubcriterion(input: unknown): Promise<AcademicConfigurationMutationDto> {
    this.authorizeConfiguration();
    return this.repository.saveSubcriterion(this.repositoryContext(), academicSubcriterionMutationSchema.parse(input));
  }

  async activateScheme(input: unknown): Promise<AcademicSchemeVersionMutationDto> {
    this.authorizeConfiguration();
    return this.repository.activateScheme(this.repositoryContext(), academicActivateSchemeSchema.parse(input));
  }

  async copyScheme(input: unknown): Promise<AcademicSchemeVersionMutationDto> {
    this.authorizeConfiguration();
    return this.repository.copyScheme(this.repositoryContext(), academicCopySchemeSchema.parse(input));
  }
}
