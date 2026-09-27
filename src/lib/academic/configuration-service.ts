import type {
  AcademicConfigurationDto,
  AcademicConfigurationDeletionDto,
  AcademicConfigurationMutationDto,
  AcademicSchemeVersionMutationDto,
} from './configuration-dto';
import { SupabaseAcademicConfigurationRepository } from './configuration-repository';
import {
  academicActivateSchemeSchema,
  academicDistributeSchemeSchema,
  academicCopySchemeSchema,
  academicDeleteCriterionSchema,
  academicDeleteSubcriterionSchema,
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

  async deleteSubcriterion(input: unknown): Promise<AcademicConfigurationDeletionDto> {
    this.authorizeConfiguration();
    return this.repository.deleteSubcriterion(
      this.repositoryContext(),
      academicDeleteSubcriterionSchema.parse(input),
    );
  }

  async deleteCriterion(input: unknown): Promise<AcademicConfigurationDeletionDto> {
    this.authorizeConfiguration();
    return this.repository.deleteCriterion(
      this.repositoryContext(), academicDeleteCriterionSchema.parse(input),
    );
  }

  async activateScheme(input: unknown): Promise<AcademicSchemeVersionMutationDto> {
    this.authorizeConfiguration();
    return this.repository.activateScheme(this.repositoryContext(), academicActivateSchemeSchema.parse(input));
  }

  async copyScheme(input: unknown): Promise<AcademicSchemeVersionMutationDto> {
    this.authorizeConfiguration();
    return this.repository.copyScheme(this.repositoryContext(), academicCopySchemeSchema.parse(input));
  }

  async distributeScheme(input: unknown) {
    this.authorizeConfiguration();
    if (this.context.role !== 'profesor') throw new AcademicApplicationError('forbidden');
    const request = academicDistributeSchemeSchema.parse(input);
    const context = this.repositoryContext();
    const data = await this.repository.load(context);
    const source = data.schemes.find((scheme) => scheme.id === request.schemeId);
    if (!source || source.state !== 'activo' || source.version !== request.expectedVersion) throw new AcademicApplicationError('conflict');
    const own = data.assignments.filter((assignment) => assignment.teacherId === context.actorId && assignment.cycleId === source.cycleId);
    if (!own.some((assignment) => assignment.id === source.assignmentId) || request.assignmentIds.some((id) => !own.some((assignment) => assignment.id === id))) throw new AcademicApplicationError('forbidden');
    const results: { assignmentId: string; applied: boolean; message: string }[] = [];
    for (const assignmentId of request.assignmentIds) {
      if (assignmentId === source.assignmentId) continue;
      try {
        const applied = await this.repository.applyTeacherCriteriaToAssignment(
          source.id, source.version, assignmentId,
        );
        results.push({
          assignmentId, applied: true,
          message: applied.mode === 'reweighted'
            ? `Porcentajes de ${applied.criterionCount} criterio(s) actualizados. Las notas originales se conservan y el periodo activo se recalcula al consultar.`
            : `${applied.criterionCount} criterio(s) aplicados en esta materia. No se copiaron calificaciones.`,
        });
      } catch (error) {
        results.push({
          assignmentId, applied: false,
          message: error instanceof Error ? error.message : 'No se pudo aplicar la configuración. Los criterios de esta materia no cambiaron.',
        });
      }
    }
    return { results };
  }
}
