'use client';

import Link from 'next/link';
import { ArrowRight, ClipboardList, X } from 'lucide-react';

interface FilterPendingOrdersReminderProps {
  count: number;
  onDismiss: () => void;
}

export function FilterPendingOrdersReminder({ count, onDismiss }: FilterPendingOrdersReminderProps) {
  if (count < 1) return null;

  return (
    <aside
      aria-label="Recordatorio de órdenes de salida pendientes"
      className="filter-pending-reminder fixed right-3 z-[120] w-[min(19rem,calc(100vw-1.5rem))] sm:right-5"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.25rem)' }}
    >
      <span aria-hidden="true" className="filter-pending-thread absolute right-12 top-0 h-6 w-px bg-[#a94724]" />
      <span
        aria-hidden="true"
        className="filter-pending-pin absolute right-[43px] top-0 h-2 w-2 rounded-full border border-[#913917] bg-[#ffcd73] shadow-sm"
      />
      <div className="filter-pending-card relative mt-5 overflow-hidden rounded-xl border border-[#a94724] bg-[#fff8ed] text-[#542413] shadow-[0_12px_28px_rgba(77,31,14,0.28)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#d24a2f] via-[#ee8b30] to-[#f5b948]" />
        <div className="flex items-start gap-2.5 px-3.5 pb-3 pt-4">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#b63e29] text-white">
            <ClipboardList className="h-[19px] w-[19px]" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="pr-5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#a04425]">Atención en Filtro</p>
            <p className="mt-0.5 text-sm font-semibold leading-snug">
              <span className="text-lg font-extrabold tabular-nums text-[#a52e20]">{count}</span>{' '}
              {count === 1 ? 'orden pendiente' : 'órdenes pendientes'}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar recordatorio de órdenes pendientes"
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#7c422c] transition-colors hover:bg-[#f6e2d2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94724]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="border-t border-[#f0d7c1] px-3.5 py-2">
          <Link
            href="/dashboard/filtro"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-bold text-[#9c3021] transition-colors hover:bg-[#f6e2d2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94724]"
          >
            Ir a órdenes <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <style jsx>{`
        .filter-pending-reminder {
          animation: filter-pending-arrive 650ms cubic-bezier(0.2, 1.2, 0.35, 1) both;
        }
        .filter-pending-card {
          transform-origin: 82% -14px;
          animation: filter-pending-swing 5s ease-in-out 650ms infinite;
        }
        @keyframes filter-pending-arrive {
          from { opacity: 0; transform: translateY(-28px); }
          65% { opacity: 1; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes filter-pending-swing {
          0%, 100% { transform: rotate(0); }
          25% { transform: rotate(0.7deg); }
          75% { transform: rotate(-0.7deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .filter-pending-reminder,
          .filter-pending-card { animation: none; }
        }
      `}</style>
    </aside>
  );
}
