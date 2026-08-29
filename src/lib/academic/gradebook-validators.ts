import { z } from 'zod';

const uuid = z.string().uuid();

export const academicGradebookWorkspaceQuerySchema = z.object({
  assignmentId: uuid,
  periodId: uuid,
}).strict();

export type AcademicGradebookWorkspaceQueryInput = z.output<
  typeof academicGradebookWorkspaceQuerySchema
>;
