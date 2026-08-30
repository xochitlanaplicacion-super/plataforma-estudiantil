import { z } from 'zod';

import { academicPageSchema } from './validators';

const uuid = z.string().uuid();

export const academicStudentResultsQuerySchema = academicPageSchema.extend({
  cycleId: uuid.optional(),
  periodId: uuid.optional(),
}).strict();

export const academicTenantResultsQuerySchema = academicPageSchema.extend({
  assignmentId: uuid,
  periodId: uuid,
}).strict();

export const academicTenantResultsExportSchema = z.object({
  assignmentId: uuid,
  periodId: uuid,
}).strict();

export type AcademicStudentResultsQueryInput = z.output<typeof academicStudentResultsQuerySchema>;
export type AcademicTenantResultsQueryInput = z.output<typeof academicTenantResultsQuerySchema>;
export type AcademicTenantResultsExportInput = z.output<typeof academicTenantResultsExportSchema>;
