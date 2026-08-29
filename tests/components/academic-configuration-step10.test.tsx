// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AcademicConfigurationDto } from '@/lib/academic/configuration-dto';

const actionMocks = vi.hoisted(() => ({
  load: vi.fn(), audit: vi.fn(), saveCycle: vi.fn(), savePeriod: vi.fn(),
  saveScheme: vi.fn(), saveCriterion: vi.fn(), saveSubcriterion: vi.fn(),
  activate: vi.fn(), copy: vi.fn(),
}));

vi.mock('@/lib/actions/calificaciones', () => ({
  loadAcademicConfigurationAction: actionMocks.load,
  listAcademicAuditAction: actionMocks.audit,
  saveAcademicCycleAction: actionMocks.saveCycle,
  saveAcademicPeriodAction: actionMocks.savePeriod,
  saveAcademicSchemeAction: actionMocks.saveScheme,
  saveAcademicCriterionAction: actionMocks.saveCriterion,
  saveAcademicSubcriterionAction: actionMocks.saveSubcriterion,
  activateAcademicSchemeAction: actionMocks.activate,
  copyAcademicSchemeAction: actionMocks.copy,
}));

import { AcademicCyclesPeriodsPage } from '@/components/academic/AcademicCyclesPeriodsPage';
import { AcademicSchemesPage } from '@/components/academic/AcademicSchemesPage';

afterEach(cleanup);

const ID = {
  cycle: '10000000-0000-4000-8000-000000000001',
  period: '10000000-0000-4000-8000-000000000002',
  assignment: '10000000-0000-4000-8000-000000000003',
  level: '10000000-0000-4000-8000-000000000004',
  career: '10000000-0000-4000-8000-000000000005',
  grade: '10000000-0000-4000-8000-000000000006',
  group: '10000000-0000-4000-8000-000000000007',
  subject: '10000000-0000-4000-8000-000000000008',
  teacher: '10000000-0000-4000-8000-000000000009',
  scheme: '10000000-0000-4000-8000-000000000010',
  criterion: '10000000-0000-4000-8000-000000000011',
};

function baseConfiguration(): AcademicConfigurationDto {
  return {
    cycles: [{ id: ID.cycle, name: '2026-2027', startsOn: '2026-08-31', endsOn: '2027-07-16', state: 'activo', timezone: 'America/Mexico_City', updatedAt: '2026-08-28T10:00:00.000Z' }],
    periods: [{ id: ID.period, cycleId: ID.cycle, name: 'Primer periodo', order: 1, startsOn: '2026-08-31', endsOn: '2026-10-30', semanticColor: 'primary', state: 'activo', lockedAt: null, updatedAt: '2026-08-28T10:00:00.000Z' }],
    assignments: [{ id: ID.assignment, cycleId: ID.cycle, levelId: ID.level, levelName: 'Secundaria', careerId: ID.career, careerName: 'Secundaria', gradeId: ID.grade, gradeName: 'Primero', groupId: ID.group, groupName: 'A', subjectId: ID.subject, subjectName: 'Matemáticas', teacherId: ID.teacher, teacherName: 'Docente de prueba' }],
    schemes: [],
  };
}

beforeEach(() => {
  actionMocks.audit.mockResolvedValue({ ok: true, status: 'empty', data: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false } });
});

describe('Paso 10: interfaz administrativa accesible', () => {
  it('presenta ciclos/periodos con teclado, tokens y cero infracciones axe críticas', async () => {
    actionMocks.load.mockResolvedValue({ ok: true, status: 'success', data: baseConfiguration() });
    const user = userEvent.setup();
    const { container } = render(<AcademicCyclesPeriodsPage />);
    await screen.findByRole('heading', { name: 'Configuración académica' });
    expect(screen.getByLabelText('Ciclo a editar')).toHaveValue(ID.cycle);
    await user.tab();
    expect(document.activeElement).not.toBe(document.body);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|hsl\(/i);
    const report = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(report.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
  }, 20_000);

  it('ejecuta borrador → criterio 100% → activación y confirma cada persistencia', async () => {
    let data = baseConfiguration();
    actionMocks.load.mockImplementation(async () => ({ ok: true, status: 'success', data }));
    actionMocks.saveScheme.mockImplementation(async (input: { name: string }) => {
      data = {
        ...data,
        schemes: [{
          id: ID.scheme, cycleId: ID.cycle, assignmentId: ID.assignment, periodId: ID.period,
          name: input.name, scale: '0-10', passingGrade: 6, displayDecimals: 1,
          roundingMode: 'half_up', missingRule: 'zero_on_close', missingValue: 0,
          excusedRule: 'exclude', state: 'borrador', version: 1, copiedFromId: null,
          updatedAt: '2026-08-28T10:01:00.000Z', criteria: [],
        }],
      };
      return { ok: true, status: 'success', data: { id: ID.scheme, updatedAt: '2026-08-28T10:01:00.000Z' } };
    });
    actionMocks.saveCriterion.mockImplementation(async (input: { name: string; weight: number }) => {
      data.schemes[0].criteria = [{
        id: ID.criterion, schemeId: ID.scheme, name: input.name, type: 'directo',
        weight: input.weight, order: 1, active: true,
        updatedAt: '2026-08-28T10:02:00.000Z', subcriteria: [],
      }];
      return { ok: true, status: 'success', data: { id: ID.criterion, updatedAt: '2026-08-28T10:02:00.000Z' } };
    });
    actionMocks.activate.mockImplementation(async () => {
      data.schemes[0].state = 'activo';
      return { ok: true, status: 'success', data: { schemeId: ID.scheme, state: 'activo', version: 1 } };
    });

    const user = userEvent.setup();
    render(<AcademicSchemesPage />);
    const name = await screen.findByLabelText('Nombre');
    await user.type(name, 'Esquema institucional');
    await user.click(screen.getByRole('button', { name: 'Guardar reglas' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar cambio' }));
    await waitFor(() => expect(actionMocks.saveScheme).toHaveBeenCalledOnce());

    const criterionName = await screen.findByLabelText('Nombre del nuevo criterio');
    await user.type(criterionName, 'Examen');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() => expect(actionMocks.saveCriterion).toHaveBeenCalledWith(expect.objectContaining({ weight: 100 })));

    const activate = await screen.findByRole('button', { name: 'Activar esquema' });
    expect(activate).toBeEnabled();
    await user.click(activate);
    await user.click(screen.getByRole('button', { name: 'Activar versión' }));
    await waitFor(() => expect(actionMocks.activate).toHaveBeenCalledWith({ schemeId: ID.scheme, expectedVersion: 1 }));
  }, 20_000);

  it('bloquea activación cuando el total no suma 100 y expone jerarquía completa', async () => {
    const data = baseConfiguration();
    data.schemes = [{
      id: ID.scheme, cycleId: ID.cycle, assignmentId: ID.assignment, periodId: ID.period,
      name: 'Borrador', scale: '0-10', passingGrade: 6, displayDecimals: 1,
      roundingMode: 'half_up', missingRule: 'zero_on_close', missingValue: 0,
      excusedRule: 'exclude', state: 'borrador', version: 1, copiedFromId: null,
      updatedAt: '2026-08-28T10:00:00.000Z', criteria: [{
        id: ID.criterion, schemeId: ID.scheme, name: 'Parcial', type: 'directo',
        weight: 80, order: 1, active: true, updatedAt: '2026-08-28T10:00:00.000Z', subcriteria: [],
      }],
    }];
    actionMocks.load.mockResolvedValue({ ok: true, status: 'success', data });
    render(<AcademicSchemesPage />);
    expect(await screen.findByLabelText('Nivel')).toBeVisible();
    expect(screen.getByLabelText('Carrera o programa')).toBeVisible();
    expect(screen.getByLabelText('Grado')).toBeVisible();
    expect(screen.getByLabelText('Grupo')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Activar esquema' })).toBeDisabled();
    expect(screen.getByLabelText('estado del total de ponderaciones')).toHaveTextContent('80.0000%');
  }, 20_000);
});
