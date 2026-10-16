// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCount: vi.fn() }));
vi.mock('@/lib/actions/filter-preregistrations', () => ({ getFilterPendingOrderCount: mocks.getCount }));

import { FilterPendingOrdersReminderController } from '@/components/filter/FilterPendingOrdersReminderController';

beforeEach(() => { mocks.getCount.mockReset(); });
afterEach(cleanup);

describe('recordatorio de órdenes pendientes', () => {
  it('muestra el conteo, permite cerrarlo y reaparece si llegan más órdenes', async () => {
    mocks.getCount.mockResolvedValue({ success: true, count: 2 });
    render(<FilterPendingOrdersReminderController />);

    const reminder = await screen.findByRole('complementary', { name: 'Recordatorio de órdenes de salida pendientes' });
    expect(reminder).toHaveTextContent('2 órdenes pendientes');
    expect(screen.getByRole('link', { name: 'Ir a órdenes' })).toHaveAttribute('href', '/dashboard/filtro');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar recordatorio de órdenes pendientes' }));
    expect(screen.queryByRole('complementary', { name: 'Recordatorio de órdenes de salida pendientes' })).not.toBeInTheDocument();

    mocks.getCount.mockResolvedValue({ success: true, count: 3 });
    fireEvent(window, new Event('filter-pending-orders-changed'));
    await waitFor(() => expect(screen.getByRole('complementary', { name: 'Recordatorio de órdenes de salida pendientes' })).toHaveTextContent('3 órdenes pendientes'));
  });

  it('no ocupa pantalla cuando no hay órdenes pendientes', async () => {
    mocks.getCount.mockResolvedValue({ success: true, count: 0 });
    render(<FilterPendingOrdersReminderController />);
    await waitFor(() => expect(mocks.getCount).toHaveBeenCalled());
    expect(screen.queryByRole('complementary', { name: 'Recordatorio de órdenes de salida pendientes' })).not.toBeInTheDocument();
  });
});
