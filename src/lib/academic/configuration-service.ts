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
      if (data.schemes.some((scheme) => scheme.assignmentId === assignmentId && scheme.periodId === source.periodId)) {
        results.push({ assignmentId, applied: false, message: 'Ya tiene un esquema. Se conserva sin cambios.' });
        continue;
      }
      let created = false;
      try {
        const scheme = await this.repository.saveScheme(context, {
          cycleId: source.cycleId, assignmentId, periodId: source.periodId,
          name: source.name, passingGrade: source.passingGrade, displayDecimals: source.displayDecimals,
        });
        created = true;
        for (const criterion of source.criteria) {
          const copy = await this.repository.saveCriterion(context, {
            schemeId: scheme.id, name: criterion.name, type: criterion.type,
            weight: criterion.weight, order: criterion.order, active: criterion.active,
          });
          for (const child of criterion.subcriteria) {
            await this.repository.saveSubcriterion(context, academicSubcriterionMutationSchema.parse({
              criterionId: copy.id, name: child.name, type: child.type,
              internalWeight: child.internalWeight, order: child.order,
              configuration: child.configuration, active: child.active,
            }));
          }
        }
        await this.repository.activateScheme(context, { schemeId: scheme.id, expectedVersion: 1 });
        results.push({ assignmentId, applied: true, message: 'Criterios guardados y activos.' });
      } catch {
        results.push({ assignmentId, applied: false, message: created
          ? 'No se completó la activación. Revisa el borrador de esta asignación antes de continuar.'
          : 'No se pudo crear el esquema. Actualiza y revisa esta asignación.' });
      }
    }
    return { results };
  }
}
