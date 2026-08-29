'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, LockKeyhole, Plus, Save } from 'lucide-react';

import {
  loadAcademicConfigurationAction,
  saveAcademicCycleAction,
  saveAcademicPeriodAction,
} from '@/lib/actions/calificaciones';
import type {
  AcademicConfigurationDto,
  AcademicCycleState,
  AcademicCycleConfigurationDto,
  AcademicPeriodConfigurationDto,
} from '@/lib/academic/configuration-dto';
import type { AcademicActionResult } from '@/lib/academic/dto';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AcademicConfigurationHeader, AcademicConfirmDialog, AcademicErrorState,
  AcademicFeedback, AcademicLoadingState, fieldClassName,
} from './AcademicConfigurationUi';

type LoadState = { kind: 'loading' }
  | { kind: 'ready'; data: AcademicConfigurationDto }
  | { kind: 'failed'; result: Extract<AcademicActionResult<AcademicConfigurationDto>, { ok: false }> };
type Feedback = null | { kind: 'saving' | 'success' | 'error' | 'conflict'; message: string };
type CycleDraft = {
  id?: string; expectedUpdatedAt?: string; name: string; startsOn: string; endsOn: string;
  state: AcademicCycleState; timezone: string;
};
type PeriodDraft = {
  id?: string; expectedUpdatedAt?: string; cycleId: string; name: string; order: number;
  startsOn: string; endsOn: string;
  semanticColor: AcademicPeriodConfigurationDto['semanticColor'];
  state: 'borrador' | 'activo';
};

const emptyCycle: CycleDraft = {
  id: undefined as string | undefined, expectedUpdatedAt: undefined as string | undefined,
  name: '', startsOn: '', endsOn: '', state: 'borrador' as const,
  timezone: 'America/Mexico_City',
};
const emptyPeriod: PeriodDraft = {
  id: undefined as string | undefined, expectedUpdatedAt: undefined as string | undefined,
  cycleId: '', name: '', order: 1, startsOn: '', endsOn: '',
  semanticColor: 'primary' as const, state: 'borrador' as const,
};

function cycleForm(row: AcademicCycleConfigurationDto) {
  return {
    id: row.id, expectedUpdatedAt: row.updatedAt, name: row.name,
    startsOn: row.startsOn, endsOn: row.endsOn, state: row.state,
    timezone: row.timezone,
  };
}
function periodForm(row: AcademicPeriodConfigurationDto) {
  return {
    id: row.id, expectedUpdatedAt: row.updatedAt, cycleId: row.cycleId,
    name: row.name, order: row.order, startsOn: row.startsOn, endsOn: row.endsOn,
    semanticColor: row.semanticColor,
    state: row.state === 'cerrado' ? 'borrador' as const : row.state,
  };
}

export function AcademicCyclesPeriodsPage() {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [cycleDraft, setCycleDraft] = useState<CycleDraft>(emptyCycle);
  const [periodDraft, setPeriodDraft] = useState<PeriodDraft>(emptyPeriod);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmation, setConfirmation] = useState<'cycle' | 'period' | null>(null);

  const load = useCallback(async (preferred?: { cycleId?: string; periodId?: string }) => {
    setLoadState({ kind: 'loading' });
    const result = await loadAcademicConfigurationAction();
    if (!result.ok) {
      setLoadState({ kind: 'failed', result });
      return;
    }
    setLoadState({ kind: 'ready', data: result.data });
    const cycle = result.data.cycles.find((item) => item.id === preferred?.cycleId)
      ?? result.data.cycles.find((item) => item.state === 'activo')
      ?? result.data.cycles[0];
    if (cycle) {
      setSelectedCycleId(cycle.id);
      setCycleDraft(cycleForm(cycle));
      const period = result.data.periods.find((item) => item.id === preferred?.periodId && item.cycleId === cycle.id)
        ?? result.data.periods.find((item) => item.cycleId === cycle.id && item.state === 'activo')
        ?? result.data.periods.find((item) => item.cycleId === cycle.id);
      if (period) {
        setSelectedPeriodId(period.id);
        setPeriodDraft(periodForm(period));
      } else {
        setSelectedPeriodId('');
        setPeriodDraft({ ...emptyPeriod, cycleId: cycle.id, startsOn: cycle.startsOn, endsOn: cycle.endsOn });
      }
    } else {
      setSelectedCycleId('');
      setSelectedPeriodId('');
      setCycleDraft(emptyCycle);
      setPeriodDraft(emptyPeriod);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const data = loadState.kind === 'ready' ? loadState.data : null;
  const periods = useMemo(
    () => data?.periods.filter((period) => period.cycleId === selectedCycleId) ?? [],
    [data, selectedCycleId],
  );
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId);
  const periodReadOnly = selectedPeriod?.state === 'cerrado';

  function chooseCycle(id: string) {
    const cycle = data?.cycles.find((item) => item.id === id);
    if (!cycle) return;
    setSelectedCycleId(id);
    setCycleDraft(cycleForm(cycle));
    const period = data?.periods.find((item) => item.cycleId === id && item.state === 'activo')
      ?? data?.periods.find((item) => item.cycleId === id);
    if (period) {
      setSelectedPeriodId(period.id);
      setPeriodDraft(periodForm(period));
    } else {
      setSelectedPeriodId('');
      setPeriodDraft({ ...emptyPeriod, cycleId: id, startsOn: cycle.startsOn, endsOn: cycle.endsOn });
    }
    setFeedback(null);
  }

  async function saveCycle() {
    setConfirmation(null);
    setFeedback({ kind: 'saving', message: 'Guardando ciclo…' });
    const result = await saveAcademicCycleAction(cycleDraft);
    if (!result.ok) {
      setFeedback({ kind: result.status === 'conflict' ? 'conflict' : 'error', message: result.error.message });
      return;
    }
    setFeedback({ kind: 'success', message: 'Ciclo guardado y verificado.' });
    await load({ cycleId: result.data.id });
  }

  async function savePeriod() {
    setConfirmation(null);
    setFeedback({ kind: 'saving', message: 'Guardando periodo…' });
    const result = await saveAcademicPeriodAction(periodDraft);
    if (!result.ok) {
      setFeedback({ kind: result.status === 'conflict' ? 'conflict' : 'error', message: result.error.message });
      return;
    }
    setFeedback({ kind: 'success', message: 'Periodo guardado y verificado.' });
    await load({ cycleId: periodDraft.cycleId, periodId: result.data.id });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AcademicConfigurationHeader current="cycles" />
      {loadState.kind === 'loading' ? <AcademicLoadingState /> : null}
      {loadState.kind === 'failed' ? (
        <AcademicErrorState status={loadState.result.status} error={loadState.result.error} onRetry={() => void load()} />
      ) : null}
      {data ? (
        <>
          {data.cycles.length === 0 ? (
            <Card>
              <CardHeader><CardTitle>Comienza con el ciclo escolar</CardTitle><CardDescription>El ciclo contiene todos los periodos de evaluación de la institución.</CardDescription></CardHeader>
              <CardContent><Button onClick={() => setCycleDraft(emptyCycle)}><Plus />Crear primer ciclo</Button></CardContent>
            </Card>
          ) : null}
          <AcademicFeedback state={feedback} />
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><CardTitle className="flex items-center gap-2"><CalendarDays aria-hidden="true" />Ciclo escolar</CardTitle><CardDescription>Fechas maestras y estado institucional.</CardDescription></div>
                  <Button type="button" variant="outline" onClick={() => { setSelectedCycleId(''); setCycleDraft(emptyCycle); }}><Plus />Nuevo</Button>
                </div>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setConfirmation('cycle'); }}>
                  {data.cycles.length > 0 ? <div className="space-y-2"><Label htmlFor="cycle-selector">Ciclo a editar</Label><select id="cycle-selector" className={fieldClassName} value={selectedCycleId} onChange={(event) => chooseCycle(event.target.value)}><option value="">Nuevo ciclo</option>{data.cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name} — {cycle.state}</option>)}</select></div> : null}
                  <div className="space-y-2"><Label htmlFor="cycle-name">Nombre</Label><Input id="cycle-name" required maxLength={120} value={cycleDraft.name} onChange={(event) => setCycleDraft((draft) => ({ ...draft, name: event.target.value }))} /></div>
                  <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="cycle-start">Inicio</Label><Input id="cycle-start" type="date" required value={cycleDraft.startsOn} onChange={(event) => setCycleDraft((draft) => ({ ...draft, startsOn: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="cycle-end">Fin</Label><Input id="cycle-end" type="date" required value={cycleDraft.endsOn} onChange={(event) => setCycleDraft((draft) => ({ ...draft, endsOn: event.target.value }))} /></div></div>
                  <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="cycle-state">Estado</Label><select id="cycle-state" className={fieldClassName} value={cycleDraft.state} onChange={(event) => setCycleDraft((draft) => ({ ...draft, state: event.target.value as typeof draft.state }))}><option value="borrador">Borrador</option><option value="activo">Activo</option><option value="cerrado">Cerrado</option><option value="archivado">Archivado</option></select></div><div className="space-y-2"><Label htmlFor="cycle-timezone">Zona horaria</Label><Input id="cycle-timezone" required value={cycleDraft.timezone} onChange={(event) => setCycleDraft((draft) => ({ ...draft, timezone: event.target.value }))} /></div></div>
                  <Button type="submit" disabled={!cycleDraft.name || !cycleDraft.startsOn || !cycleDraft.endsOn}><Save />Guardar ciclo</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Periodos de evaluación</CardTitle><CardDescription>No pueden solaparse y deben quedar dentro del ciclo.</CardDescription></div><Button type="button" variant="outline" disabled={!selectedCycleId} onClick={() => { const cycle = data.cycles.find((item) => item.id === selectedCycleId); setSelectedPeriodId(''); setPeriodDraft({ ...emptyPeriod, cycleId: selectedCycleId, order: periods.length + 1, startsOn: cycle?.startsOn ?? '', endsOn: cycle?.endsOn ?? '' }); }}><Plus />Nuevo</Button></div>
              </CardHeader>
              <CardContent>
                {!selectedCycleId ? <p className="text-sm text-muted-foreground">Guarda o selecciona un ciclo para configurar sus periodos.</p> : (
                  <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setConfirmation('period'); }}>
                    {periods.length > 0 ? <div className="space-y-2"><Label htmlFor="period-selector">Periodo a editar</Label><select id="period-selector" className={fieldClassName} value={selectedPeriodId} onChange={(event) => { const period = periods.find((item) => item.id === event.target.value); setSelectedPeriodId(event.target.value); if (period) setPeriodDraft(periodForm(period)); }}><option value="">Nuevo periodo</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.order}. {period.name} — {period.state}</option>)}</select></div> : <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Todavía no hay periodos. Completa el formulario para crear el primero.</p>}
                    {periodReadOnly ? <p role="status" className="flex items-center gap-2 rounded-md border p-3 text-sm"><LockKeyhole className="size-4" aria-hidden="true" />Periodo cerrado: su configuración es de sólo lectura.</p> : null}
                    <div className="space-y-2"><Label htmlFor="period-name">Nombre</Label><Input id="period-name" required disabled={periodReadOnly} value={periodDraft.name} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, name: event.target.value }))} /></div>
                    <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="period-order">Orden</Label><Input id="period-order" type="number" min={1} max={99} required disabled={periodReadOnly} value={periodDraft.order} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, order: Number(event.target.value) }))} /></div><div className="space-y-2"><Label htmlFor="period-start">Inicio</Label><Input id="period-start" type="date" required disabled={periodReadOnly} value={periodDraft.startsOn} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, startsOn: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="period-end">Fin</Label><Input id="period-end" type="date" required disabled={periodReadOnly} value={periodDraft.endsOn} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, endsOn: event.target.value }))} /></div></div>
                    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="period-state">Estado</Label><select id="period-state" className={fieldClassName} disabled={periodReadOnly} value={periodDraft.state} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, state: event.target.value as typeof draft.state }))}><option value="borrador">Borrador</option><option value="activo">Activo</option></select></div><div className="space-y-2"><Label htmlFor="period-token">Token visual</Label><select id="period-token" className={fieldClassName} disabled={periodReadOnly} value={periodDraft.semanticColor} onChange={(event) => setPeriodDraft((draft) => ({ ...draft, semanticColor: event.target.value as typeof draft.semanticColor }))}><option value="primary">Primario</option><option value="secondary">Secundario</option><option value="accent">Acento</option><option value="muted">Neutro</option></select></div></div>
                    <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={periodReadOnly || !periodDraft.name}><Save />Guardar periodo</Button>{selectedPeriod ? <Badge variant="outline">{selectedPeriod.state}</Badge> : null}</div>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
      <AcademicConfirmDialog open={confirmation === 'cycle'} onOpenChange={(open) => !open && setConfirmation(null)} onConfirm={() => void saveCycle()} title="Confirmar cambios del ciclo" description="Cambiar fechas o estado puede afectar los periodos y el cálculo institucional. La operación sólo se confirma si persiste en la base del tenant." />
      <AcademicConfirmDialog open={confirmation === 'period'} onOpenChange={(open) => !open && setConfirmation(null)} onConfirm={() => void savePeriod()} title="Confirmar cambios del periodo" description="Las fechas, el orden y el estado delimitan la captura y cálculo de calificaciones. Los cambios se validarán contra el ciclo y otros periodos." />
    </div>
  );
}
