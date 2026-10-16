'use client';

import { useEffect, useState } from 'react';
import { getFilterPendingOrderCount } from '@/lib/actions/filter-preregistrations';
import { FilterPendingOrdersReminder } from './FilterPendingOrdersReminder';

/** Se monta por ruta: cerrar el aviso lo oculta hasta cambiar de página o de conteo. */
export function FilterPendingOrdersReminderController() {
  const [count, setCount] = useState<number | null>(null);
  const [dismissedCount, setDismissedCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const result = await getFilterPendingOrderCount();
        if (!active || !result.success) return;
        setCount(result.count);
        setDismissedCount((previous) => previous !== null && previous !== result.count ? null : previous);
      } catch {
        // Se conserva el último conteo confirmado; la navegación sigue disponible.
      }
    };

    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 30_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('filter-pending-orders-changed', onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('filter-pending-orders-changed', onFocus);
    };
  }, []);

  if (count === null || count < 1 || dismissedCount === count) return null;
  return <FilterPendingOrdersReminder count={count} onDismiss={() => setDismissedCount(count)} />;
}
