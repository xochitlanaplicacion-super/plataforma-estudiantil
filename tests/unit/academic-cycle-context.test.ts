import { describe, expect, it } from 'vitest';
import { buildAcademicContextIndicator } from '@/lib/academic-grading/cycle-context';

const cycle = {
  id: 'cycle-test',
  name: '2026-2027',
  startsOn: '2026-08-31',
  endsOn: '2027-07-16',
  timezone: 'America/Mexico_City',
  state: 'activo' as const,
};

describe('indicador de contexto académico', () => {
  it('marca coherencia cuando cada alumno activo tiene matrícula activa', () => {
    expect(buildAcademicContextIndicator(cycle, {
      activeStudents: 12,
      activeEnrollments: 12,
      activeAssignments: 4,
    })).toMatchObject({ isCoherent: true, activeAssignments: 4 });
  });

  it('detecta una diferencia sin ocultarla', () => {
    expect(buildAcademicContextIndicator(cycle, {
      activeStudents: 12,
      activeEnrollments: 11,
      activeAssignments: 4,
    }).isCoherent).toBe(false);
  });

  it('normaliza conteos nulos y exige ciclo para declarar coherencia', () => {
    expect(buildAcademicContextIndicator(null, {
      activeStudents: null,
      activeEnrollments: null,
      activeAssignments: null,
    })).toEqual({
      cycle: null,
      activeStudents: 0,
      activeEnrollments: 0,
      activeAssignments: 0,
      isCoherent: false,
    });
  });
});
