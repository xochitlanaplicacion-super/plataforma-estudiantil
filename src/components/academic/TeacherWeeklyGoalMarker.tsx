'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpenCheck, RefreshCw } from 'lucide-react';
import {
  loadMyWeeklyTeacherGoalAction,
  type MyWeeklyTeacherGoal,
} from '@/lib/actions/teacher-activity-audit';

export function TeacherWeeklyGoalMarker({ onCreate }: { onCreate: () => void }) {
  const [goal, setGoal] = useState<MyWeeklyTeacherGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await loadMyWeeklyTeacherGoalAction();
      if (result.ok) setGoal(result.data);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <section aria-label="Seguimiento semanal docente" className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <BookOpenCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <p className="text-sm font-bold text-slate-900">
            {loading ? 'Consultando tu meta semanal…' : error || !goal
              ? 'No se pudo consultar la meta semanal'
              : goal.status === 'excused'
                ? `Esta semana: ${goal.published} publicaciones · excepción autorizada`
                : goal.status === 'informational'
                  ? `Esta semana: ${goal.published} publicaciones · ${goal.nonApplicableReason ? 'meta no aplicable' : 'seguimiento inicial'}`
                  : `Esta semana: ${goal.published}/${goal.target} actividades${goal.remaining > 0 ? ` · faltan ${goal.remaining}` : ' · meta alcanzada'}`}
          </p>
          {goal && !error && !loading && (
            <p className="mt-0.5 text-xs text-slate-600">
              {goal.status === 'informational'
                ? goal.note
                : goal.status === 'excused'
                  ? 'La institución marcó esta semana como excepción; no cuenta como incumplimiento.'
                  : 'Cuenta una vez cada actividad original publicada y visible para alumnos.'}
              {' '}Entregas por revisar: {goal.pendingReviews}.
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs font-semibold">
        {error && (
          <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-1 text-slate-600 hover:underline">
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Reintentar
          </button>
        )}
        <button type="button" onClick={onCreate} className="text-emerald-800 hover:underline">
          Ir a mis materias
        </button>
      </div>
    </section>
  );
}
