'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { BarChart3, Medal, RefreshCw, Sparkles, Trophy } from 'lucide-react';
import { loadTeacherParticipationAction, type TeacherParticipationData } from '@/lib/actions/participaciones';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Mode = 'sobrio' | 'infantil';
type Scope = 'hoy' | 'periodo';

export function TeacherParticipationDashboard({ initialData }: { initialData: TeacherParticipationData }) {
  const [data, setData] = useState(initialData),
    [mode, setMode] = useState<Mode>('sobrio'),
    [scope, setScope] = useState<Scope>('hoy'),
    [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const ranking = useMemo(() => [...(data.summary?.students ?? [])].sort((a, b) => (scope === 'hoy' ? b.todayPoints - a.todayPoints || b.todayCount - a.todayCount : b.periodPoints - a.periodPoints || b.periodCount - a.periodCount)), [data.summary, scope]);
  const max = Math.max(1, ...ranking.map((row) => (scope === 'hoy' ? row.todayPoints : row.periodPoints)));
  const colors = mode === 'infantil' ? ['#7c3aed', '#db2777', '#ea580c', '#0891b2', '#059669'] : ['#0f766e', '#0369a1', '#1d4ed8', '#475569', '#64748b'];
  useEffect(() => {
    const saved = window.localStorage.getItem('teacher-participation-style');
    if (saved === 'sobrio' || saved === 'infantil') setMode(saved);
  }, []);
  const changeMode = (next: Mode) => {
    setMode(next);
    window.localStorage.setItem('teacher-participation-style', next);
  };
  const reload = (assignmentId: string) =>
    startTransition(async () => {
      setMessage('');
      const result = await loadTeacherParticipationAction(assignmentId);
      if (result.ok) setData(result.data);
      else setMessage(result.message);
    });
  return (
    <main className={cn('mx-auto max-w-6xl space-y-5 rounded-3xl p-1 transition-colors', mode === 'infantil' && 'bg-gradient-to-br from-violet-50 via-white to-amber-50')}>
      <header className="flex flex-col gap-4 rounded-3xl border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <BarChart3 className="size-7" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-primary">Participación diaria</p>
            <h1 className="text-3xl font-black tracking-tight">Progreso del grupo</h1>
            <p className="text-sm text-muted-foreground">Clasificación del día y acumulado del periodo activo: {data.periodName}.</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => data.selectedAssignmentId && reload(data.selectedAssignmentId)} disabled={pending}>
          <RefreshCw className={cn('mr-2 size-4', pending && 'animate-spin')} />
          Actualizar
        </Button>
      </header>
      <Card>
        <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto_auto]">
          <div>
            <label className="mb-2 block text-sm font-bold">Materia y grupo</label>
            <Select value={data.selectedAssignmentId ?? undefined} onValueChange={reload}>
              <SelectTrigger>
                <SelectValue placeholder="Sin asignaciones" />
              </SelectTrigger>
              <SelectContent>
                {data.assignments.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.subjectName} · {row.groupName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold">Periodo mostrado</p>
            <div className="flex rounded-xl border bg-muted/30 p-1">
              <button type="button" className={cn('rounded-lg px-5 py-2 text-sm font-bold', scope === 'hoy' && 'bg-primary text-primary-foreground shadow')} onClick={() => setScope('hoy')}>
                Hoy
              </button>
              <button type="button" className={cn('rounded-lg px-5 py-2 text-sm font-bold', scope === 'periodo' && 'bg-primary text-primary-foreground shadow')} onClick={() => setScope('periodo')}>
                Periodo
              </button>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold">Estilo visual</p>
            <div className="flex rounded-xl border bg-muted/30 p-1">
              <button type="button" className={cn('rounded-lg px-4 py-2 text-sm font-bold', mode === 'sobrio' && 'bg-slate-800 text-white shadow')} onClick={() => changeMode('sobrio')}>
                Sobrio
              </button>
              <button type="button" className={cn('rounded-lg px-4 py-2 text-sm font-bold', mode === 'infantil' && 'bg-violet-600 text-white shadow')} onClick={() => changeMode('infantil')}>
                Infantil
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
      {message ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          {message}
        </div>
      ) : null}
      {pending ? (
        <div className="grid min-h-64 place-items-center rounded-3xl border bg-card">
          <RefreshCw className="size-10 animate-spin text-primary" aria-label="Cargando" />
        </div>
      ) : data.summary ? (
        <>
          <section className={cn('overflow-hidden rounded-3xl p-7 text-white shadow-lg', mode === 'infantil' ? 'bg-gradient-to-r from-violet-700 via-fuchsia-600 to-orange-500' : 'bg-gradient-to-r from-slate-950 to-cyan-900')}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] opacity-80">{scope === 'hoy' ? `Resultados del ${new Date(data.summary.date + 'T12:00:00').toLocaleDateString('es-MX')}` : `Acumulado de ${data.periodName}`}</p>
                <p className="mt-2 text-5xl font-black">{ranking.reduce((total, row) => total + (scope === 'hoy' ? row.todayCount : row.periodCount), 0)}</p>
                <p className="font-bold opacity-85">participaciones registradas</p>
              </div>
              {mode === 'infantil' ? <Sparkles className="size-20 opacity-70" aria-hidden="true" /> : <Trophy className="size-20 opacity-60" aria-hidden="true" />}
            </div>
          </section>
          <section className="grid gap-3" aria-label="Clasificación de participaciones">
            {ranking.map((row, index) => {
              const points = scope === 'hoy' ? row.todayPoints : row.periodPoints,
                count = scope === 'hoy' ? row.todayCount : row.periodCount;
              return (
                <article
                  key={row.enrollmentId}
                  className={cn('flex items-center gap-4 rounded-2xl border-2 bg-card p-4 shadow-sm transition-transform', mode === 'infantil' && 'hover:-translate-y-0.5')}
                  style={{
                    borderColor: mode === 'infantil' ? colors[index % colors.length] : undefined,
                  }}
                >
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl text-xl font-black text-white" style={{ backgroundColor: colors[index % colors.length] }}>
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-black">{row.name}</h2>
                        <span className={cn('text-[10px] font-black', row.studentType === 'provisional' ? 'text-amber-700' : 'text-emerald-700')}>{row.studentType === 'provisional' ? 'PROVISIONAL' : 'REGISTRADO'}</span>
                      </div>
                      <strong>{Number(points).toFixed(1)} pts</strong>
                    </div>
                    <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(points ? 7 : 0, (points / max) * 100)}%`,
                          backgroundColor: colors[index % colors.length],
                        }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {count} participaciones · {scope === 'hoy' ? 'hoy' : `total en ${data.periodName}`}
                    </p>
                  </div>
                  {index < 3 ? <Medal className="size-8 shrink-0" style={{ color: colors[index] }} aria-label={`Posición ${index + 1}`} /> : null}
                </article>
              );
            })}
            {!ranking.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>Aún no hay alumnos para mostrar</CardTitle>
                </CardHeader>
              </Card>
            ) : null}
          </section>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No hay asignaciones activas</CardTitle>
          </CardHeader>
        </Card>
      )}
    </main>
  );
}
