import { calendarDateFromDeadline, dateInTenantTimezone } from '@/lib/service-countdown';

type DatedActivity = {
  fecha_entrega?: string | null;
  haEntregado?: boolean;
};

export function isDeliveredStudentResult(result: {
  estado?: string | null;
  calificacion?: number | null;
} | null | undefined) {
  if (!result) return false;
  if (['entregado', 'tardio', 'calificado'].includes(result.estado || '')) return true;
  // Las filas antiguas pueden carecer de estado, pero una nota 0 también es válida.
  return result.estado == null && result.calificacion != null;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

/** Cuenta únicamente actividades con límite en la semana civil del plantel. */
export function getStudentWeeklyProgress(
  activities: DatedActivity[],
  now: Date,
  timezone: string,
) {
  const today = dateInTenantTimezone(now, timezone);
  const [year, month, day] = today.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekStart = addDays(today, -((weekday + 6) % 7));
  const weekEnd = addDays(weekStart, 6);
  const dueThisWeek = activities.filter((activity) => {
    if (!activity.fecha_entrega) return false;
    const dueDate = calendarDateFromDeadline(activity.fecha_entrega, timezone);
    return dueDate >= weekStart && dueDate <= weekEnd;
  });

  return {
    weekStart,
    weekEnd,
    completed: dueThisWeek.filter((activity) => activity.haEntregado).length,
    total: dueThisWeek.length,
  };
}
