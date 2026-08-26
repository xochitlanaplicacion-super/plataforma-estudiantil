import { assertGrade10 } from './scale';
import type { InstitutionalGradingRules } from './contracts';

export const INITIAL_ACADEMIC_CYCLE = Object.freeze({
  name: '2026–2027',
  startDate: '2026-08-31',
  endDate: '2027-07-16',
  timeZone: 'America/Mexico_City',
  periods: Object.freeze([
    Object.freeze({ order: 1, name: 'Periodo 1', startDate: '2026-08-31', endDate: '2026-11-27' }),
    Object.freeze({ order: 2, name: 'Periodo 2', startDate: '2026-11-28', endDate: '2027-03-12' }),
    Object.freeze({ order: 3, name: 'Periodo 3', startDate: '2027-03-13', endDate: '2027-07-16' }),
  ]),
});

export const INITIAL_GRADING_RULES: Readonly<InstitutionalGradingRules> = Object.freeze({
  passingGrade: assertGrade10(6),
  displayDecimals: 1,
  roundingMode: 'half_up',
  notSubmittedTreatment: 'zero_on_close',
  justifiedTreatment: 'exclude',
  reopenRoles: Object.freeze(['superuser', 'admin'] as const),
});
