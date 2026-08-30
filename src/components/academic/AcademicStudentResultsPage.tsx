'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpenCheck, CheckCircle2, Clock3, RefreshCw, RotateCcw } from 'lucide-react';

import { loadMyAcademicResultsAction } from '@/lib/actions/calificaciones';
import type { AcademicStudentResultsDto } from '@/lib/academic/results-dto';
import { averageAcademicResults } from '@/lib/academic/results-projector';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

type ResourceState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: AcademicStudentResultsDto };

const publication = {
  provisional: { label: 'Provisional', icon: Clock3, className: 'border-primary/30 bg-primary/10 text-primary' },
  final: { label: 'Final', icon: CheckCircle2, className: 'border-secondary/30 bg-secondary/10 text-secondary-foreground' },
  reopened: { label: 'Reabierta', icon: RotateCcw, className: 'border-accent bg-accent text-accent-foreground' },
} as const;

export function AcademicStudentResultsPage({ initialData }: { initialData?: AcademicStudentResultsDto } = {}) {
  const [state, setState] = useState<ResourceState>(initialData
    ? { status: 'ready', data: initialData }
    : { status: 'loading' });
  const [cycleId, setCycleId] = useState('all');
  const [periodId, setPeriodId] = useState('all');
  const [catalog, setCatalog] = useState(() => initialData ? {
    cycles: initialData.cycles,
    periods: initialData.periods,
  } : null);

  const load = async (page = 1, nextCycleId = cycleId, nextPeriodId = periodId) => {
    setState({ status: 'loading' });
    const result = await loadMyAcademicResultsAction({
      page,
      pageSize: 25,
      ...(nextCycleId === 'all' ? {} : { cycleId: nextCycleId }),
      ...(nextPeriodId === 'all' ? {} : { periodId: nextPeriodId }),
    });
    if (!result.ok) {
      setState({ status: 'error', message: result.error.message });
      return;
    }
    setCatalog((current) => current ?? {
      cycles: result.data.cycles,
      periods: result.data.periods,
    });
    setState({ status: 'ready', data: result.data });
  };

  useEffect(() => { if (!initialData) void load(1, 'all', 'all'); }, [initialData]);

  const data = state.status === 'ready' ? state.data : null;
  const periods = useMemo(() => catalog?.periods.filter((period) =>
    cycleId === 'all' || period.cycleId === cycleId
  ) ?? [], [catalog, cycleId]);
  const items = useMemo(() => data?.items.filter((item) =>
    (cycleId === 'all' || item.cycleId === cycleId)
    && (periodId === 'all' || item.periodId === periodId)
  ) ?? [], [cycleId, periodId, data]);
  const average = averageAcademicResults(items, 2);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-16 sm:px-6 lg:px-8" aria-labelledby="student-results-title">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 id="student-results-title" className="flex items-center gap-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
            <BookOpenCheck aria-hidden="true" className="size-8" /> Mis calificaciones
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-medium text-muted-foreground">
            Resultados en escala institucional de 0 a 10. Las notas provisionales pueden cambiar hasta que el periodo se cierre.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={state.status === 'loading'}>
          <RefreshCw aria-hidden="true" className={cn('mr-2 size-4', state.status === 'loading' && 'animate-spin')} />
          Actualizar
        </Button>
      </header>

      {state.status === 'loading' && (
        <section className="rounded-2xl border bg-card p-10 text-center" aria-live="polite" aria-busy="true">
          <RefreshCw className="mx-auto mb-3 size-7 animate-spin text-primary" aria-hidden="true" />
          <p className="font-semibold">Cargando tus resultados canónicos…</p>
        </section>
      )}

      {state.status === 'error' && (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6" role="alert">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 text-destructive" aria-hidden="true" />
            <div><h2 className="font-bold">No fue posible cargar tus calificaciones</h2><p className="mt-1 text-sm text-muted-foreground">{state.message}</p></div>
          </div>
        </section>
      )}

      {data && (
        <>
          <section className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm md:grid-cols-[1fr_1fr_auto]" aria-label="Filtros de calificaciones">
            <label className="space-y-2 text-sm font-bold">
              <span>Ciclo escolar</span>
              <select
                value={cycleId}
                onChange={(event) => {
                  const nextCycleId = event.target.value;
                  setCycleId(nextCycleId);
                  setPeriodId('all');
                  void load(1, nextCycleId, 'all');
                }}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">Todos los ciclos</option>
                {catalog?.cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm font-bold">
              <span>Periodo</span>
              <select
                value={periodId}
                onChange={(event) => {
                  const nextPeriodId = event.target.value;
                  setPeriodId(nextPeriodId);
                  void load(1, cycleId, nextPeriodId);
                }}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">Todos los periodos</option>
                {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
              </select>
            </label>
            <div className="rounded-xl bg-primary/10 px-6 py-3 text-center" aria-label="Promedio visible">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Promedio visible</p>
              <p className="text-3xl font-black tabular-nums text-primary">{average ?? '—'}</p>
              <p className="text-xs text-muted-foreground">de 10</p>
            </div>
          </section>

          {items.length === 0 ? (
            <section className="rounded-2xl border-2 border-dashed bg-muted/20 p-12 text-center" data-testid="student-results-empty">
              <BookOpenCheck className="mx-auto mb-4 size-12 text-muted-foreground/40" aria-hidden="true" />
              <h2 className="text-lg font-bold">Aún no hay resultados para este filtro</h2>
              <p className="mt-1 text-sm text-muted-foreground">Cuando exista un esquema activo y fuentes de evaluación, aparecerán aquí.</p>
            </section>
          ) : (
            <>
              <section className="grid gap-5 lg:grid-cols-2" aria-label="Resultados por materia" data-testid="student-results-list">
                {items.map((item) => {
                const status = publication[item.publicationState];
                const StatusIcon = status.icon;
                return (
                  <Card key={`${item.assignmentId}:${item.periodId}`} className="overflow-hidden border-border/70 shadow-sm">
                    <CardHeader className="space-y-3 bg-muted/20">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-xl text-foreground">{item.subjectName}</CardTitle>
                          <CardDescription>{item.cycleName} · {item.periodName} · {item.groupName}</CardDescription>
                        </div>
                        <Badge variant="outline" className={status.className}>
                          <StatusIcon className="mr-1 size-3.5" aria-hidden="true" /> {status.label}
                        </Badge>
                      </div>
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Calificación</p>
                          <p className="text-4xl font-black tabular-nums text-primary">{item.displayGrade ?? '—'}<span className="text-base text-muted-foreground"> / 10</span></p>
                        </div>
                        <p className="text-right text-xs text-muted-foreground">Profesor<br /><span className="font-semibold text-foreground">{item.teacherName}</span></p>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-5">
                      <div>
                        <div className="mb-2 flex justify-between text-xs font-semibold"><span>Progreso de captura</span><span>{item.progressPercent}%</span></div>
                        <Progress value={item.progressPercent} aria-label={`Progreso de captura ${item.progressPercent}%`} />
                        <p className="mt-2 text-xs text-muted-foreground">{item.resolvedSourceCount} de {item.sourceCount} fuentes resueltas</p>
                      </div>
                      {item.publicationState === 'reopened' && (
                        <p className="rounded-lg border border-accent bg-accent/40 p-3 text-xs" role="status">
                          El cierre versión {item.closureVersion} fue reabierto. La calificación mostrada vuelve a ser provisional.
                        </p>
                      )}
                      {item.publicationState === 'final' && (
                        <p className="rounded-lg border border-secondary/30 bg-secondary/10 p-3 text-xs" role="status">
                          Resultado final inmutable · cierre versión {item.closureVersion}.
                        </p>
                      )}
                      <details className="group rounded-xl border bg-background p-4">
                        <summary className="cursor-pointer font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ver desglose propio</summary>
                        <div className="mt-4 space-y-2">
                          {item.criteria.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay criterios computables.</p> : item.criteria.map((criterion) => (
                            <div key={criterion.criterionId} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg bg-muted/40 p-3 text-sm">
                              <div><p className="font-semibold">{criterion.label}</p><p className="text-xs text-muted-foreground">Peso: {criterion.originalWeight}%</p></div>
                              <div className="text-right"><p className="font-black tabular-nums">{criterion.canonicalGrade ?? '—'} / 10</p><p className="text-xs text-muted-foreground">Aporta {criterion.contributionToTotal}</p></div>
                            </div>
                          ))}
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                );
                })}
              </section>
              {data.totalPages > 1 && (
                <nav className="flex items-center justify-center gap-3" aria-label="Paginación de calificaciones">
                  <Button type="button" variant="outline" disabled={!data.hasPreviousPage} onClick={() => void load(data.page - 1)}>
                    Anterior
                  </Button>
                  <span className="text-sm font-semibold">Página {data.page} de {data.totalPages}</span>
                  <Button type="button" variant="outline" disabled={!data.hasNextPage} onClick={() => void load(data.page + 1)}>
                    Siguiente
                  </Button>
                </nav>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
