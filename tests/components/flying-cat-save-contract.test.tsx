// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  save: vi.fn(), toast: vi.fn(), refresh: vi.fn(), push: vi.fn(),
  completion: undefined as undefined | ((score: number, total: number, details?: any[]) => Promise<any>),
}));
vi.mock('@/lib/actions/alumno', () => ({ saveExerciseResult: mocks.save }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('@/components/shared/ActivityPreview', () => ({ ActivityPreview: (props: any) => {
  mocks.completion = props.onComplete;
  return <div>Actividad de prueba</div>;
} }));

import ClientStudentPlayer from '@/app/dashboard/alumno/ejercicios/[id]/ClientStudentPlayer';

beforeEach(() => {
  mocks.save.mockReset(); mocks.completion = undefined;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => cleanup());

describe('Flying Cat save acknowledgment', () => {
  it('propagates a rejected database result and permits an explicit retry of the same completed run', async () => {
    mocks.save.mockResolvedValueOnce({ error: 'No hay conexión con la base de datos' })
      .mockResolvedValueOnce({ success: true, data: { calificacion: 8 }, leaderboard: null });
    render(<ClientStudentPlayer exercise={{ id: 'flight', tipo: 'flying_cat' }} />);

    await act(async () => {
      await expect(mocks.completion!(4, 5, [])).rejects.toThrow('No hay conexión con la base de datos');
    });
    await act(async () => {
      await expect(mocks.completion!(4, 5, [])).resolves.toBeNull();
    });
    expect(mocks.save).toHaveBeenCalledTimes(2);
    const requestKey = mocks.save.mock.calls[0][5];
    expect(requestKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mocks.save).toHaveBeenLastCalledWith('flight', 4, 5, 80, [], requestKey);
    expect(mocks.save.mock.calls[1][5]).toBe(requestKey);
  });

  it('also propagates unexpected connection failures instead of showing a false success', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Network failure'));
    render(<ClientStudentPlayer exercise={{ id: 'flight', tipo: 'flying_cat' }} />);
    await act(async () => {
      await expect(mocks.completion!(1, 1)).rejects.toThrow('Network failure');
    });
  });

  it('returns an explicit practice-only acknowledgment for an expired exercise', async () => {
    mocks.save.mockResolvedValueOnce({ success: true, isExpired: true, message: 'La actividad está vencida; no se guardó la nota.' });
    render(<ClientStudentPlayer exercise={{ id: 'flight', tipo: 'flying_cat' }} />);
    await act(async () => {
      await expect(mocks.completion!(1, 1)).resolves.toEqual({
        practice: true, message: 'La actividad está vencida; no se guardó la nota.',
      });
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('preserves the previous callback contract of existing iframe games', async () => {
    mocks.save.mockResolvedValueOnce({ error: 'Network failure' });
    render(<ClientStudentPlayer exercise={{ id: 'race', tipo: 'parkour_race' }} />);
    await act(async () => {
      await expect(mocks.completion!(1, 1)).resolves.toBeNull();
    });
    expect(mocks.save).toHaveBeenCalledWith('race', 1, 1, 100, undefined);
  });

  it('does not claim to save another attempt when the database kept an already locked grade', async () => {
    mocks.save.mockResolvedValueOnce({ success: true, isLocked: true, data: { calificacion: 10, bloqueado: true } });
    render(<ClientStudentPlayer exercise={{ id: 'flight', tipo: 'flying_cat' }} />);
    await act(async () => {
      await expect(mocks.completion!(1, 2)).resolves.toEqual({
        practice: true, message: expect.stringContaining('no guardó un nuevo intento'),
      });
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
