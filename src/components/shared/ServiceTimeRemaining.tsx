'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock3, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  calculatePlatformServiceCountdown,
  type PlatformServiceSummary,
} from '@/lib/service-countdown';

function twoDigits(value: number) {
  return String(value).padStart(2, '0');
}

export function ServiceTimeRemaining({ service }: { service: PlatformServiceSummary }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    const refreshService = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const interval = window.setInterval(refreshService, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', refreshService);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshService);
    };
  }, [router]);

  const countdown = useMemo(
    () => now ? calculatePlatformServiceCountdown(service, now) : null,
    [service, now]
  );
  const tone = !countdown
    ? 'neutral'
    : countdown.status !== 'active' || countdown.days < 3
      ? 'danger'
      : countdown.days < 11
        ? 'warning'
        : countdown.days < 16
          ? 'caution'
          : 'healthy';
  const toneClasses = {
    neutral: ['border-slate-200 bg-slate-50/90', 'bg-slate-100 text-slate-600', 'text-slate-800'],
    healthy: ['border-emerald-200 bg-emerald-50/90', 'bg-emerald-100 text-emerald-700', 'text-emerald-900'],
    caution: ['border-yellow-200 bg-yellow-50/90', 'bg-yellow-100 text-yellow-700', 'text-yellow-900'],
    warning: ['border-orange-200 bg-orange-50/90', 'bg-orange-100 text-orange-700', 'text-orange-900'],
    danger: ['border-red-200 bg-red-50/90', 'bg-red-100 text-red-700', 'text-red-900'],
  }[tone];
  const expiration = countdown?.endDate?.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: service.timezone || 'America/Mexico_City',
  });

  return (
    <section
      aria-label="Tiempo restante de servicio"
      className={cn(
        'mb-5 flex flex-col gap-2 rounded-2xl border px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between',
        toneClasses[0]
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn('rounded-xl p-2', toneClasses[1])}>
          {!countdown || countdown.status === 'active' ? <Clock3 className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Tiempo restante de servicio</p>
          <p className={cn('truncate text-sm font-bold', toneClasses[2])}>
            {!countdown && 'Calculando vigencia…'}
            {countdown?.status === 'suspended' && 'Servicio suspendido'}
            {countdown?.status === 'expired' && 'Servicio vencido'}
            {countdown?.status === 'no-date' && 'Servicio activo · fecha de vencimiento no configurada'}
            {countdown?.status === 'active' && expiration && `Vence el ${expiration}`}
          </p>
        </div>
      </div>
      {countdown?.status === 'active' && (
        <div className="whitespace-nowrap text-right font-black tabular-nums text-slate-900" aria-live="off">
          <span className="text-lg">{countdown.days}</span>
          <span className="mx-1 text-[10px] uppercase tracking-wider text-slate-500">días</span>
          <span className="text-base">{twoDigits(countdown.hours)}:{twoDigits(countdown.minutes)}:{twoDigits(countdown.seconds)}</span>
        </div>
      )}
    </section>
  );
}
