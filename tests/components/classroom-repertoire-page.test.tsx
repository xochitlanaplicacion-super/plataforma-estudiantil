// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ load: vi.fn(), session: vi.fn() }));
vi.mock('@/lib/actions/classroom-games', () => ({ loadTeacherClassroomAction: mocks.load }));
vi.mock('@/lib/tenant/context', () => ({ requireTenantSession: mocks.session }));
vi.mock('@/components/classroom-games/ClassroomGameRepertoire', () => ({
  ClassroomGameRepertoire: () => <section aria-label="Repertorio de juegos">Batalla Naval local</section>,
}));
vi.mock('@/components/classroom-games/TeacherSessionManager', () => ({
  TeacherSessionManager: ({ initialData }: { initialData: { marker: string } }) => <section aria-label="Salas y repertorio">{initialData.marker}</section>,
}));
import TeacherClassroomActivitiesPage from '@/app/dashboard/profesor/actividades-clase/page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ tenantId: 'school-a', user: { id: 'teacher-a' } });
});
afterEach(cleanup);

describe('Teacher classroom repertoire integration', () => {
  it('preserves the existing online manager and its authenticated data', async () => {
    mocks.load.mockResolvedValue({ ok: true, data: { marker: 'Existing authenticated rooms' } });
    render(await TeacherClassroomActivitiesPage());
    expect(screen.getByRole('region', { name: 'Salas y repertorio' })).toHaveTextContent('Existing authenticated rooms');
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it('keeps the local repertoire accessible to an authorized teacher if online tables fail', async () => {
    mocks.load.mockResolvedValue({ ok: false, message: 'Online classrooms unavailable' });
    render(await TeacherClassroomActivitiesPage());
    expect(mocks.session).toHaveBeenCalledWith(['profesor']);
    expect(screen.getByRole('region', { name: 'Repertorio de juegos' })).toHaveTextContent('Batalla Naval local');
    expect(screen.getByText('Online classrooms unavailable')).toBeInTheDocument();
    expect(screen.getByText(/sólo corresponde a las salas en línea/)).toBeInTheDocument();
  });

  it.each(['No autenticado', 'No autorizado', 'Institución suspendida'])('never exposes the fallback repertoire when identity validation fails: %s', async (reason) => {
    mocks.load.mockResolvedValue({ ok: false, message: 'Access denied' });
    mocks.session.mockRejectedValueOnce(new Error(reason));
    render(await TeacherClassroomActivitiesPage());
    expect(screen.queryByRole('region', { name: 'Repertorio de juegos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Salas y repertorio' })).not.toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });
});
