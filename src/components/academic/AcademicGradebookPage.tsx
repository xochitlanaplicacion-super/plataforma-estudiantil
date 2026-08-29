'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, LoaderCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  calculateAcademicResultAction, listAcademicContextAction,
  loadAcademicGradebookWorkspaceAction, saveAcademicGradesAction,
} from '@/lib/actions/calificaciones';
import type { AcademicActionResult, AcademicContextDto, AcademicPageDto } from '@/lib/academic/dto';
import type { AcademicGradebookWorkspaceDto } from '@/lib/academic/gradebook-dto';
import { AcademicErrorState, AcademicLoadingState } from './AcademicConfigurationUi';
import { GradebookEditor } from './GradebookEditor';

type ContextResult = AcademicActionResult<AcademicPageDto<AcademicContextDto>>;

export function AcademicGradebookPage() {
  const [contexts, setContexts] = useState<ContextResult | null>(null);
  const [workspace, setWorkspace] = useState<AcademicActionResult<AcademicGradebookWorkspaceDto> | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [cycleId, setCycleId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [assignmentId, setAssignmentId] = useState('');

  async function loadContexts() {
    setContexts(null);
    const result = await listAcademicContextAction({ page: 1, pageSize: 50 });
    setContexts(result);
    if (result.ok && result.data.items.length > 0) {
      const first = result.data.items[0];
      setCycleId(first.cycleId);
      setAssignmentId(first.assignmentId);
      setPeriodId(first.periods[0]?.id ?? '');
    }
  }

  useEffect(() => { void loadContexts(); }, []);

  const availableContexts = contexts?.ok ? contexts.data.items : [];
  const cycles = useMemo(() => [...new Map(availableContexts.map((item) => [
    item.cycleId, { id: item.cycleId, name: item.cycleName },
  ])).values()], [availableContexts]);
  const assignments = availableContexts.filter((item) => item.cycleId === cycleId);
  const periods = [...new Map(assignments.flatMap((item) => item.periods).map((period) => [period.id, period])).values()];

  async function loadWorkspace() {
    if (!assignmentId || !periodId) return null;
    setWorkspaceLoading(true);
    const result = await loadAcademicGradebookWorkspaceAction({ assignmentId, periodId });
    setWorkspace(result);
    setWorkspaceLoading(false);
    return result;
  }

  if (!contexts) return <AcademicLoadingState label="Cargando asignaciones del profesor…" />;
  if (!contexts.ok) return <AcademicErrorState status={contexts.status} error={contexts.error} onRetry={() => void loadContexts()} />;

  return (
    <main className="mx-auto max-w-[96rem] space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Evaluación académica</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl"><BookOpenCheck aria-hidden="true" />Libreta de calificaciones</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Selecciona un alcance completo. Los cambios permanecen locales hasta presionar Guardar lote.</p>
      </header>
      <Card>
        <CardHeader><CardTitle>Contexto obligatorio</CardTitle><CardDescription>El encabezado de la libreta conservará visibles ciclo, periodo, materia y grupo.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 lg:grid-cols-[1fr_1fr_2fr_auto]">
          <div className="space-y-2"><Label>Ciclo</Label><Select value={cycleId} onValueChange={(value) => { setCycleId(value); const next = availableContexts.find((item) => item.cycleId === value); setAssignmentId(next?.assignmentId ?? ''); setPeriodId(next?.periods[0]?.id ?? ''); setWorkspace(null); }}><SelectTrigger aria-label="Ciclo escolar"><SelectValue placeholder="Selecciona ciclo" /></SelectTrigger><SelectContent>{cycles.map((cycle) => <SelectItem key={cycle.id} value={cycle.id}>{cycle.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Periodo</Label><Select value={periodId} onValueChange={(value) => { setPeriodId(value); setWorkspace(null); }}><SelectTrigger aria-label="Periodo de evaluación"><SelectValue placeholder="Selecciona periodo" /></SelectTrigger><SelectContent>{periods.map((period) => <SelectItem key={period.id} value={period.id}>{period.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Asignación</Label><Select value={assignmentId} onValueChange={(value) => { setAssignmentId(value); setWorkspace(null); }}><SelectTrigger aria-label="Asignación docente"><SelectValue placeholder="Selecciona materia y grupo" /></SelectTrigger><SelectContent>{assignments.map((assignment) => <SelectItem key={assignment.assignmentId} value={assignment.assignmentId}>{assignment.subjectName} · Grupo {assignment.groupName}</SelectItem>)}</SelectContent></Select></div>
          <Button className="self-end" disabled={!cycleId || !periodId || !assignmentId || workspaceLoading} onClick={() => void loadWorkspace()}>{workspaceLoading ? <LoaderCircle className="animate-spin" /> : null}Abrir libreta</Button>
        </CardContent>
      </Card>

      {contexts.status === 'empty' && <Card><CardHeader><CardTitle>Sin asignaciones vigentes</CardTitle><CardDescription>Cuando administración asigne una materia activa, aparecerá en este selector.</CardDescription></CardHeader></Card>}
      {workspaceLoading && <AcademicLoadingState label="Cargando alumnos y criterios de la libreta…" />}
      {workspace && !workspace.ok && <AcademicErrorState status={workspace.status} error={workspace.error} onRetry={() => void loadWorkspace()} />}
      {workspace?.ok && (
        <GradebookEditor
          workspace={workspace.data}
          onReload={async () => loadAcademicGradebookWorkspaceAction({ assignmentId, periodId })}
          onSave={saveAcademicGradesAction}
          onBreakdown={(enrollmentId) => calculateAcademicResultAction({ assignmentId, periodId, enrollmentId, page: 1, pageSize: 50 })}
        />
      )}
    </main>
  );
}
