'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, CheckCircle2, Download, RefreshCw, RotateCcw } from 'lucide-react';

import {
  exportAcademicTenantResultsAction,
  listAcademicContextAction,
  loadAcademicTenantResultsAction,
} from '@/lib/actions/calificaciones';
import type { AcademicContextDto } from '@/lib/academic/dto';
import type { AcademicTenantResultsDto } from '@/lib/academic/results-dto';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

type ContextState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: AcademicContextDto[] };
type ResultsState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: AcademicTenantResultsDto };

export function AcademicTenantResultsPage({
  embedded = false,
  initialContexts,
  initialData,
}: {
  embedded?: boolean;
  initialContexts?: AcademicContextDto[];
  initialData?: AcademicTenantResultsDto;
}) {
  const [contexts, setContexts] = useState<ContextState>(initialContexts
    ? { status: 'ready', items: initialContexts }
    : { status: 'loading' });
  const [results, setResults] = useState<ResultsState>(initialData
    ? { status: 'ready', data: initialData }
    : { status: 'idle' });
  const [cycleId, setCycleId] = useState(initialData?.context.cycleId ?? '');
  const [groupId, setGroupId] = useState(initialData?.context.groupId ?? '');
  const [assignmentId, setAssignmentId] = useState(initialData?.context.assignmentId ?? '');
  const [periodId, setPeriodId] = useState(initialData?.periodId ?? '');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (initialContexts) return;
    void (async () => {
      const response = await listAcademicContextAction({ page: 1, pageSize: 50 });
      if (!response.ok) setContexts({ status: 'error', message: response.error.message });
      else setContexts({ status: 'ready', items: response.data.items });
    })();
  }, [initialContexts]);

  const contextItems = contexts.status === 'ready' ? contexts.items : [];
  const cycles = useMemo(() => [...new Map(contextItems.map((item) => [item.cycleId, item.cycleName])).entries()], [contextItems]);
  const groups = useMemo(() => [...new Map(contextItems
    .filter((item) => item.cycleId === cycleId)
    .map((item) => [item.groupId, item.groupName])).entries()], [contextItems, cycleId]);
  const assignments = useMemo(() => contextItems.filter((item) =>
    item.cycleId === cycleId && item.groupId === groupId
  ), [contextItems, cycleId, groupId]);
  const selectedContext = contextItems.find((item) => item.assignmentId === assignmentId);

  const load = async (requestedPage = page) => {
    if (!assignmentId || !periodId) return;
    setResults({ status: 'loading' });
    const response = await loadAcademicTenantResultsAction({
      assignmentId, periodId, page: requestedPage, pageSize: 25,
    });
    if (!response.ok) {
      setResults({ status: 'error', message: response.error.message });
      return;
    }
    setPage(requestedPage);
    setResults({ status: 'ready', data: response.data });
  };

  useEffect(() => {
    if (initialData) return;
    if (assignmentId && periodId) void load(1);
    else setResults({ status: 'idle' });
    // The selected scope is the complete dependency; `load` is intentionally not stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, periodId, initialData]);

  const exportCsv = async () => {
    if (!assignmentId || !periodId) return;
    setExporting(true);
    const response = await exportAcademicTenantResultsAction({ assignmentId, periodId });
    setExporting(false);
    if (!response.ok) {
      setResults({ status: 'error', message: response.error.message });
      return;
    }
    const blob = new Blob([response.data.content], { type: response.data.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = response.data.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const data = results.status === 'ready' ? results.data : null;
  return (
    <section className={cn('w-full space-y-6', !embedded && 'mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8')} aria-labelledby="tenant-results-title">
      {!embedded && (
        <header className="border-b border-border/60 pb-6">
          <h1 id="tenant-results-title" className="flex items-center gap-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
            <BarChart3 className="size-8" aria-hidden="true" /> Resultados académicos
          </h1>
          <p className="mt-2 text-sm font-medium text-muted-foreground">Supervisión tenant-safe por ciclo, grupo, materia y periodo.</p>
        </header>
      )}
      {embedded && <h2 id="tenant-results-title" className="sr-only">Resultados académicos canónicos</h2>}

      {contexts.status === 'loading' && <StateMessage loading message="Cargando estructura académica…" />}
      {contexts.status === 'error' && <StateMessage error message={contexts.message} />}

      {contexts.status === 'ready' && (
        <div className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-2 xl:grid-cols-4" aria-label="Filtros jerárquicos">
          <SelectField label="Ciclo escolar" value={cycleId} onChange={(value) => { setCycleId(value); setGroupId(''); setAssignmentId(''); setPeriodId(''); }}>
            <option value="">Selecciona ciclo</option>
            {cycles.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </SelectField>
          <SelectField label="Grupo" value={groupId} disabled={!cycleId} onChange={(value) => { setGroupId(value); setAssignmentId(''); setPeriodId(''); }}>
            <option value="">Selecciona grupo</option>
            {groups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </SelectField>
          <SelectField label="Materia y profesor" value={assignmentId} disabled={!groupId} onChange={(value) => { setAssignmentId(value); setPeriodId(''); }}>
            <option value="">Selecciona materia</option>
            {assignments.map((item) => <option key={item.assignmentId} value={item.assignmentId}>{item.subjectName} · {item.teacherName}</option>)}
          </SelectField>
          <SelectField label="Periodo" value={periodId} disabled={!assignmentId} onChange={setPeriodId}>
            <option value="">Selecciona periodo</option>
            {selectedContext?.periods.map((period) => <option key={period.id} value={period.id}>{period.name} · {period.state}</option>)}
          </SelectField>
        </div>
      )}

      {results.status === 'idle' && contexts.status === 'ready' && (
        <div className="rounded-2xl border-2 border-dashed bg-muted/20 p-12 text-center" data-testid="tenant-results-idle">
          <BarChart3 className="mx-auto mb-3 size-12 text-muted-foreground/40" aria-hidden="true" />
          <p className="font-bold">Selecciona ciclo, grupo, materia y periodo</p>
          <p className="mt-1 text-sm text-muted-foreground">El alcance completo evita mezclar grupos o materias con nombres iguales.</p>
        </div>
      )}
      {results.status === 'loading' && <StateMessage loading message="Calculando resultados con el motor canónico…" />}
      {results.status === 'error' && <StateMessage error message={results.message} />}

      {data && (
        <>
          <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-black text-foreground">{data.context.subjectName} · {data.context.groupName}</p>
              <p className="text-sm text-muted-foreground">{data.context.cycleName} · {data.periodName} · {data.context.teacherName}</p>
              {data.closureVersion !== null && <p className="mt-1 text-xs font-semibold text-primary">Última versión de cierre: {data.closureVersion}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 size-4" aria-hidden="true" />Actualizar</Button>
              <Button onClick={() => void exportCsv()} disabled={exporting || data.results.total === 0}>
                <Download className="mr-2 size-4" aria-hidden="true" />{exporting ? 'Preparando…' : 'Exportar CSV seguro'}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Resumen del alcance">
            <Metric label="Alumnos" value={data.summary.visibleStudents} />
            <Metric label="Promedio 0–10" value={data.summary.average ?? '—'} />
            <Metric label="Completos" value={data.summary.complete} />
            <Metric label="Faltantes" value={data.summary.missing} />
            <Metric label="Captura" value={`${data.summary.captureProgressPercent}%`} />
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm" data-testid="tenant-results-table">
            {data.results.items.length === 0 ? (
              <div className="p-12 text-center"><p className="font-bold">No hay alumnos activos en este alcance</p><p className="mt-1 text-sm text-muted-foreground">No se generó ni exportó información vacía.</p></div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr><th className="px-5 py-4">Alumno</th><th className="px-4 py-4">Estado</th><th className="px-4 py-4">Calificación</th><th className="px-4 py-4">Captura</th><th className="px-5 py-4">Desglose propio</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.results.items.map((row) => <ResultRow key={row.enrollmentId} row={row} />)}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y md:hidden">
                  {data.results.items.map((row) => <ResultCard key={row.enrollmentId} row={row} />)}
                </div>
              </>
            )}
          </div>

          {data.results.totalPages > 1 && (
            <nav className="flex items-center justify-between" aria-label="Paginación de resultados">
              <Button variant="outline" disabled={!data.results.hasPreviousPage} onClick={() => void load(page - 1)}>Anterior</Button>
              <span className="text-sm font-semibold">Página {data.results.page} de {data.results.totalPages}</span>
              <Button variant="outline" disabled={!data.results.hasNextPage} onClick={() => void load(page + 1)}>Siguiente</Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

function StateMessage({ message, loading = false, error = false }: { message: string; loading?: boolean; error?: boolean }) {
  return <div className={cn('rounded-2xl border bg-card p-8 text-center', error && 'border-destructive/30 bg-destructive/5')} role={error ? 'alert' : 'status'} aria-busy={loading}>
    {loading ? <RefreshCw className="mx-auto mb-3 size-6 animate-spin text-primary" aria-hidden="true" /> : <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden="true" />}
    <p className="font-semibold">{message}</p>
  </div>;
}

function SelectField({ label, value, onChange, disabled = false, children }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; children: React.ReactNode }) {
  return <label className="space-y-2 text-sm font-bold"><span>{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{children}</select></label>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border bg-card p-4 text-center shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-black tabular-nums text-primary">{value}</p></div>;
}

function ResultStatus({ state, version }: { state: 'provisional' | 'final' | 'reopened'; version: number | null }) {
  if (state === 'final') return <Badge variant="outline" className="border-secondary/30 bg-secondary/10 text-secondary-foreground"><CheckCircle2 className="mr-1 size-3" />Final v{version}</Badge>;
  if (state === 'reopened') return <Badge variant="outline" className="border-accent bg-accent text-accent-foreground"><RotateCcw className="mr-1 size-3" />Reabierta v{version}</Badge>;
  return <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">Provisional</Badge>;
}

type ResultRowData = AcademicTenantResultsDto['results']['items'][number];

function Breakdown({ row }: { row: ResultRowData }) {
  return <details className="max-w-sm"><summary className="cursor-pointer font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{row.criteria.length} criterios</summary><div className="mt-2 space-y-1 rounded-lg border bg-background p-3">{row.criteria.length === 0 ? <p className="text-xs text-muted-foreground">Sin criterios computables.</p> : row.criteria.map((criterion) => <div key={criterion.criterionId} className="flex justify-between gap-4 text-xs"><span className="truncate">{criterion.label}</span><span className="font-black tabular-nums">{criterion.canonicalGrade ?? '—'}</span></div>)}</div></details>;
}

function ResultRow({ row }: { row: ResultRowData }) {
  return <tr><td className="px-5 py-4"><p className="font-bold">{row.studentName}</p><p className="text-xs text-muted-foreground">{row.enrollmentCode ?? 'Sin matrícula'}</p></td><td className="px-4 py-4"><ResultStatus state={row.publicationState} version={row.closureVersion} /></td><td className="px-4 py-4 text-xl font-black tabular-nums">{row.displayGrade ?? '—'} <span className="text-xs text-muted-foreground">/10</span></td><td className="min-w-40 px-4 py-4"><div className="flex justify-between text-xs"><span>{row.resolvedSourceCount}/{row.sourceCount}</span><span>{row.progressPercent}%</span></div><Progress aria-label={`Captura de ${row.studentName}: ${row.progressPercent}%`} className="mt-2" value={row.progressPercent} /></td><td className="px-5 py-4"><Breakdown row={row} /></td></tr>;
}

function ResultCard({ row }: { row: ResultRowData }) {
  return <article className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{row.studentName}</p><p className="text-xs text-muted-foreground">{row.enrollmentCode ?? 'Sin matrícula'}</p></div><ResultStatus state={row.publicationState} version={row.closureVersion} /></div><div className="flex items-end justify-between"><p className="text-3xl font-black tabular-nums text-primary">{row.displayGrade ?? '—'} <span className="text-xs text-muted-foreground">/10</span></p><span className="text-xs font-semibold">{row.progressPercent}% capturado</span></div><Progress aria-label={`Captura de ${row.studentName}: ${row.progressPercent}%`} value={row.progressPercent} /><Breakdown row={row} /></article>;
}
