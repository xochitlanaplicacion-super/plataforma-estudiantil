'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileClock, LoaderCircle, MessageSquareText,
  RefreshCw, Save, Search,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  AcademicActionResult, AcademicCalculatedResultDto, AcademicMutationResultDto,
} from '@/lib/academic/dto';
import type {
  AcademicGradebookCellDto, AcademicGradebookColumnDto, AcademicGradebookStudentDto,
  AcademicGradebookWorkspaceDto, AcademicGradeState,
} from '@/lib/academic/gradebook-dto';
import { ACADEMIC_MUTATION_MAX_ROWS } from '@/lib/academic/dto';
import {
  buildGradeMutationItems, defaultCellFor, gradebookCellKey,
  sortAndFilterGradebookStudents, validateGradeDraft, workspaceContainsDrafts,
  type AcademicGradeDraft, type AcademicGradeDraftMap,
} from '@/lib/academic/gradebook-client';
import type { EditAcademicGradesInput } from '@/lib/academic/validators';
import { cn } from '@/lib/utils';

interface GradebookEditorProps {
  workspace: AcademicGradebookWorkspaceDto;
  onReload: () => Promise<AcademicActionResult<AcademicGradebookWorkspaceDto>>;
  onSave: (input: EditAcademicGradesInput) => Promise<AcademicActionResult<AcademicMutationResultDto>>;
  onBreakdown: (enrollmentId: string) => Promise<AcademicActionResult<AcademicCalculatedResultDto>>;
}

interface SaveReceipt {
  correlationId: string;
  replayed: boolean;
  count: number;
  savedAt: string;
}

const STATE_OPTIONS: Array<{ value: AcademicGradeState; label: string }> = [
  { value: 'calificado', label: 'Calificado' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'entregado', label: 'Entregado' },
  { value: 'tardio', label: 'Tardío' },
  { value: 'no_entregado', label: 'No entregado' },
  { value: 'justificado', label: 'Justificado' },
  { value: 'sin_capturar', label: 'Sin capturar' },
];

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return '10000000-0000-4000-8000-000000000099';
}

function gradeInputId(row: number, column: number): string {
  return `grade-input-${row}-${column}`;
}

export function GradebookEditor({ workspace, onReload, onSave, onBreakdown }: GradebookEditorProps) {
  const [view, setView] = useState(workspace);
  const [drafts, setDrafts] = useState<AcademicGradeDraftMap>({});
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<'name_asc' | 'name_desc' | 'enrollment_asc'>('name_asc');
  const [reason, setReason] = useState('Captura de calificaciones del profesor');
  const [feedback, setFeedback] = useState<null | { kind: 'saving' | 'success' | 'error' | 'conflict'; message: string }>(null);
  const [retryKey, setRetryKey] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [conflictWorkspace, setConflictWorkspace] = useState<AcademicGradebookWorkspaceDto | null>(null);
  const [receipt, setReceipt] = useState<SaveReceipt | null>(null);
  const [detailStudent, setDetailStudent] = useState<AcademicGradebookStudentDto | null>(null);
  const [detail, setDetail] = useState<AcademicCalculatedResultDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [observationTarget, setObservationTarget] = useState<{
    student: AcademicGradebookStudentDto;
    column: AcademicGradebookColumnDto;
    cell: AcademicGradebookCellDto;
  } | null>(null);

  useEffect(() => setView(workspace), [workspace]);

  const cellMap = useMemo(() => new Map(view.cells.map((cell) => [
    gradebookCellKey(cell.enrollmentId, cell.columnId), cell,
  ])), [view.cells]);
  const students = useMemo(
    () => sortAndFilterGradebookStudents(view.students, search, order),
    [view.students, search, order],
  );
  const draftEntries = Object.entries(drafts);
  const draftErrors = draftEntries
    .map(([key, draft]) => [key, validateGradeDraft(draft)] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  const saveDisabled = view.closed || draftEntries.length === 0 || draftErrors.length > 0
    || draftEntries.length > ACADEMIC_MUTATION_MAX_ROWS || feedback?.kind === 'saving'
    || reason.trim().length < 3;

  function effectiveCell(student: AcademicGradebookStudentDto, column: AcademicGradebookColumnDto) {
    const key = gradebookCellKey(student.enrollmentId, column.id);
    const base = cellMap.get(key) ?? defaultCellFor(student, column);
    const draft = drafts[key];
    return { key, base, draft, value: draft ?? base };
  }

  function changeDraft(
    student: AcademicGradebookStudentDto,
    column: AcademicGradebookColumnDto,
    cell: AcademicGradebookCellDto,
    patch: Partial<Pick<AcademicGradeDraft, 'grade' | 'state' | 'observation'>>,
  ) {
    if (view.closed || !cell.editable) return;
    const key = gradebookCellKey(student.enrollmentId, column.id);
    if (!drafts[key] && draftEntries.length >= ACADEMIC_MUTATION_MAX_ROWS) {
      setFeedback({ kind: 'error', message: `Guarda el lote actual de ${ACADEMIC_MUTATION_MAX_ROWS} cambios antes de editar otra celda.` });
      return;
    }
    const sourceType = cell.sourceType;
    if (sourceType === 'participation') return;
    setDrafts((current) => {
      const original: AcademicGradeDraft = {
        enrollmentId: student.enrollmentId,
        columnId: column.id,
        sourceId: cell.sourceId,
        sourceType,
        criterionId: cell.criterionId,
        subcriterionId: cell.subcriterionId,
        state: cell.state,
        grade: cell.grade,
        observation: cell.observation,
        expectedRowVersion: cell.rowVersion,
      };
      return {
        ...current,
        [key]: { ...(current[key] ?? original), ...patch },
      };
    });
    setRetryKey(null);
    setReceipt(null);
    setRowErrors((current) => {
      const next = { ...current };
      delete next[student.enrollmentId];
      return next;
    });
    setFeedback(null);
  }

  function focusAdjacent(row: number, column: number, key: string) {
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0], Enter: [1, 0],
    };
    const delta = movement[key];
    if (!delta) return false;
    const target = document.getElementById(gradeInputId(row + delta[0], column + delta[1]));
    if (target instanceof HTMLInputElement && !target.disabled) target.focus();
    return true;
  }

  async function reloadCanonical(): Promise<AcademicGradebookWorkspaceDto | null> {
    const refreshed = await onReload();
    if (!refreshed.ok) return null;
    setView(refreshed.data);
    return refreshed.data;
  }

  async function saveBatch() {
    if (saveDisabled) return;
    const idempotencyKey = retryKey ?? randomUuid();
    setRetryKey(idempotencyKey);
    setFeedback({ kind: 'saving', message: `Guardando ${draftEntries.length} cambios en un único lote…` });
    const input: EditAcademicGradesInput = {
      assignmentId: view.context.assignmentId,
      periodId: view.context.periods[0].id,
      items: buildGradeMutationItems(drafts),
      reason: reason.trim(),
      idempotencyKey,
      correlationId: null,
    };
    const result = await onSave(input);
    if (result.ok) {
      const canonical = await reloadCanonical();
      setDrafts({});
      setRetryKey(null);
      setRowErrors({});
      setReceipt({
        correlationId: result.data.correlationId,
        replayed: result.data.replayed,
        count: result.data.items.length,
        savedAt: new Date().toISOString(),
      });
      setFeedback({
        kind: 'success',
        message: canonical
          ? 'Cambios guardados y verificados al recargar la libreta.'
          : 'Cambios guardados; no fue posible actualizar la vista, recarga antes de continuar.',
      });
      return;
    }
    const affectedRows = Object.fromEntries(draftEntries.map(([, draft]) => [
      draft.enrollmentId, result.error.message,
    ]));
    setRowErrors(affectedRows);
    if (result.error.code === 'ACADEMIC_TIMEOUT') {
      const canonical = await reloadCanonical();
      if (canonical && workspaceContainsDrafts(canonical, drafts)) {
        setDrafts({});
        setRetryKey(null);
        setRowErrors({});
        setFeedback({ kind: 'success', message: 'El servidor agotó el tiempo, pero la recarga confirmó que todo el lote sí quedó guardado.' });
      } else {
        setFeedback({ kind: 'error', message: 'No se confirmó el guardado. Revisa los cambios y reintenta con la misma clave idempotente.' });
      }
      return;
    }
    if (result.status === 'conflict') {
      const canonical = await reloadCanonical();
      setConflictWorkspace(canonical);
      setFeedback({ kind: 'conflict', message: 'Hay cambios más recientes. Nada fue sobrescrito; concilia antes de reintentar.' });
      return;
    }
    setFeedback({ kind: 'error', message: result.error.message });
  }

  async function showBreakdown(student: AcademicGradebookStudentDto) {
    setDetailStudent(student);
    setDetail(null);
    setDetailLoading(true);
    const result = await onBreakdown(student.enrollmentId);
    if (result.ok) setDetail(result.data);
    else setFeedback({ kind: 'error', message: result.error.message });
    setDetailLoading(false);
  }

  function renderCell(student: AcademicGradebookStudentDto, column: AcademicGradebookColumnDto, rowIndex: number, columnIndex: number) {
    const { key, base, draft, value } = effectiveCell(student, column);
    const error = draft ? validateGradeDraft(draft) : null;
    const disabled = view.closed || !base.editable || feedback?.kind === 'saving';
    const gradeValue = value.grade ?? '';
    return (
      <div className="space-y-1.5" data-cell-key={key}>
        <div className="flex items-center gap-1">
          <Input
            id={gradeInputId(rowIndex, columnIndex)}
            type="number"
            inputMode="decimal"
            min={0}
            max={10}
            step="0.01"
            value={gradeValue}
            disabled={disabled}
            aria-label={`${student.fullName}, ${column.label}, calificación de 0 a 10`}
            aria-invalid={Boolean(error)}
            className={cn('min-w-20 tabular-nums', draft && 'border-primary', error && 'border-destructive')}
            onKeyDown={(event) => {
              if (focusAdjacent(rowIndex, columnIndex, event.key)) event.preventDefault();
            }}
            onChange={(event) => {
              const raw = event.target.value;
              changeDraft(student, column, base, {
                grade: raw === '' ? null : Number(raw),
                state: raw === '' ? 'pendiente' : 'calificado',
              });
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={disabled}
            aria-label={`Editar estado y observación de ${student.fullName} en ${column.label}`}
            onClick={() => setObservationTarget({ student, column, cell: base })}
          >
            <MessageSquareText aria-hidden="true" />
          </Button>
        </div>
        <p className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {error ?? (draft ? 'Sin guardar' : value.state.replaceAll('_', ' '))}
        </p>
      </div>
    );
  }

  if (!view.scheme) {
    return (
      <Alert>
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Falta un esquema activo</AlertTitle>
        <AlertDescription>Un administrador debe activar el esquema de esta asignación y periodo antes de capturar notas.</AlertDescription>
      </Alert>
    );
  }

  if (view.students.length === 0 || view.columns.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>La libreta todavía está vacía</CardTitle><CardDescription>No hay alumnos activos o criterios disponibles para este alcance.</CardDescription></CardHeader>
        <CardContent><Button variant="outline" onClick={() => void reloadCanonical()}><RefreshCw />Volver a consultar</Button></CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-5" aria-labelledby="gradebook-title">
      <header className="sticky top-0 z-20 rounded-xl border bg-background/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary">{view.context.cycleName} · {view.context.periods[0].name}</p>
            <h2 id="gradebook-title" className="text-xl font-bold">{view.context.subjectName} · Grupo {view.context.groupName}</h2>
            <p className="text-sm text-muted-foreground">{view.scheme.name} v{view.scheme.version} · Escala 0–10 · Aprobatoria {view.scheme.passingGrade}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={view.closed ? 'destructive' : 'secondary'}>{view.closed ? 'Cerrado · sólo lectura' : 'Abierto'}</Badge>
            <Badge variant="outline">{view.studentCount} alumnos</Badge>
            {draftEntries.length > 0 && <Badge>{draftEntries.length} cambios sin guardar</Badge>}
          </div>
        </div>
      </header>

      {view.truncated && <Alert><AlertTriangle /><AlertTitle>Grupo mayor al límite de visualización</AlertTitle><AlertDescription>Se muestran los primeros 200 alumnos. Refina la matrícula antes de capturar el resto.</AlertDescription></Alert>}
      {feedback && (
        <Alert variant={feedback.kind === 'error' || feedback.kind === 'conflict' ? 'destructive' : 'default'} role={feedback.kind === 'error' ? 'alert' : 'status'}>
          {feedback.kind === 'saving' ? <LoaderCircle className="animate-spin" /> : feedback.kind === 'success' ? <CheckCircle2 /> : <AlertTriangle />}
          <AlertTitle>{feedback.kind === 'saving' ? 'Guardando' : feedback.kind === 'success' ? 'Guardado confirmado' : feedback.kind === 'conflict' ? 'Conflicto detectado' : 'No se guardó el lote'}</AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem_14rem_auto]">
        <Label className="relative">
          <span className="sr-only">Buscar alumno</span>
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
          <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nombre o matrícula" />
        </Label>
        <Select value={order} onValueChange={(value) => setOrder(value as typeof order)}>
          <SelectTrigger aria-label="Ordenar alumnos"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="name_asc">Nombre A–Z</SelectItem><SelectItem value="name_desc">Nombre Z–A</SelectItem><SelectItem value="enrollment_asc">Matrícula</SelectItem></SelectContent>
        </Select>
        <Input aria-label="Motivo del lote" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo del guardado" />
        <Button disabled={saveDisabled} onClick={() => void saveBatch()}>
          {feedback?.kind === 'saving' ? <LoaderCircle className="animate-spin" /> : <Save />}
          {retryKey && feedback?.kind === 'error' ? 'Reintentar lote' : 'Guardar lote'}
        </Button>
      </div>

      {draftErrors.length > 0 && <p role="alert" className="text-sm text-destructive">Corrige {draftErrors.length} celdas inválidas antes de guardar.</p>}

      <div className="hidden overflow-auto rounded-xl border md:block" data-testid="desktop-gradebook">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th scope="col" className="sticky left-0 z-20 min-w-64 border-b border-r bg-muted p-3 text-left">Alumno</th>
              {view.columns.map((column) => <th key={column.id} scope="col" className="min-w-36 border-b p-3 text-left"><span className="block">{column.label}</span><span className="text-xs font-normal text-muted-foreground">{column.criterionName} · {column.scale}</span></th>)}
              <th scope="col" className="border-b p-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student, rowIndex) => (
              <tr key={student.enrollmentId} className={cn('border-b last:border-0', rowErrors[student.enrollmentId] && 'bg-destructive/5')}>
                <th scope="row" className="sticky left-0 z-10 border-r bg-background p-3 text-left"><span className="block font-medium">{student.fullName}</span><span className="text-xs font-normal text-muted-foreground">{student.enrollmentCode ?? 'Sin matrícula'}</span>{rowErrors[student.enrollmentId] && <span className="mt-1 block text-xs text-destructive">Error en esta fila</span>}</th>
                {view.columns.map((column, columnIndex) => <td key={column.id} className="p-2 align-top">{renderCell(student, column, rowIndex, columnIndex)}</td>)}
                <td className="p-2 align-top"><Button variant="outline" size="sm" onClick={() => void showBreakdown(student)}>Ver desglose</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden" data-testid="mobile-gradebook">
        {students.map((student, rowIndex) => (
          <Card key={student.enrollmentId}>
            <CardHeader className="pb-3"><CardTitle className="text-base">{student.fullName}</CardTitle><CardDescription>{student.enrollmentCode ?? 'Sin matrícula'}{rowErrors[student.enrollmentId] ? ' · Error al guardar esta fila' : ''}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {view.columns.map((column, columnIndex) => <div key={column.id} className="rounded-md border p-3"><p className="mb-2 text-sm font-medium">{column.label}<span className="ml-1 text-xs font-normal text-muted-foreground">· {column.criterionName}</span></p>{renderCell(student, column, rowIndex + 500, columnIndex)}</div>)}
              <Button variant="outline" className="w-full" onClick={() => void showBreakdown(student)}>Ver desglose</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {students.length === 0 && <p className="rounded-xl border p-6 text-center text-muted-foreground">No hay alumnos que coincidan con la búsqueda.</p>}

      {receipt && (
        <Card aria-label="Recibo de auditoría del guardado">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileClock aria-hidden="true" />Rastro de guardado autorizado</CardTitle><CardDescription>La auditoría institucional completa permanece protegida para administración.</CardDescription></CardHeader>
          <CardContent className="grid gap-1 text-sm sm:grid-cols-2"><p>Correlación: <code>{receipt.correlationId}</code></p><p>{receipt.count} cambios · {receipt.replayed ? 'reintento idempotente' : 'primer intento'}</p></CardContent>
        </Card>
      )}

      <Dialog open={Boolean(observationTarget)} onOpenChange={(open) => !open && setObservationTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Estado y observación</DialogTitle><DialogDescription>{observationTarget?.student.fullName} · {observationTarget?.column.label}</DialogDescription></DialogHeader>
          {observationTarget && (() => {
            const { base, value } = effectiveCell(observationTarget.student, observationTarget.column);
            return <div className="space-y-4"><div className="space-y-2"><Label>Estado</Label><Select value={value.state} onValueChange={(state) => changeDraft(observationTarget.student, observationTarget.column, base, { state: state as AcademicGradeState, grade: state === 'calificado' ? value.grade : null })}><SelectTrigger aria-label="Estado de la calificación"><SelectValue /></SelectTrigger><SelectContent>{STATE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="grade-observation">Observación</Label><Textarea id="grade-observation" maxLength={2000} autoComplete="off" value={value.observation ?? ''} onChange={(event) => changeDraft(observationTarget.student, observationTarget.column, base, { observation: event.target.value || null })} /></div></div>;
          })()}
          <DialogFooter><Button onClick={() => setObservationTarget(null)}>Listo</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailStudent)} onOpenChange={(open) => !open && setDetailStudent(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ver desglose</DialogTitle><DialogDescription>{detailStudent?.fullName} · cálculo canónico de sólo lectura</DialogDescription></DialogHeader>
          {detailLoading && <p role="status" className="flex items-center gap-2"><LoaderCircle className="animate-spin" />Calculando desglose…</p>}
          {detail && <div className="space-y-3"><p className="text-2xl font-bold">{detail.displayGrade ?? 'Sin resultado'} <span className="text-sm font-normal text-muted-foreground">/ 10</span></p><p className="text-sm text-muted-foreground">Exacta: {detail.exactGrade ?? '—'} · motor {detail.engineVersion}</p>{detail.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{detail.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.code}</li>)}</ul>}<ol className="space-y-2">{detail.criteria.map((criterion, index) => <li key={index} className="rounded-md border p-3 text-sm"><pre className="whitespace-pre-wrap font-sans">{JSON.stringify(criterion, null, 2)}</pre></li>)}</ol></div>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(conflictWorkspace)} onOpenChange={(open) => !open && setConflictWorkspace(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Conciliar cambios recientes</DialogTitle><DialogDescription>Otra pestaña o usuario modificó una de estas filas. El lote local no se sobrescribió.</DialogDescription></DialogHeader>
          <DialogFooter className="sm:flex-wrap">
            <Button variant="outline" onClick={() => setConflictWorkspace(null)}>Conservar mis cambios para revisar</Button>
            <Button variant="secondary" onClick={() => {
              if (!conflictWorkspace) return;
              const remoteCells = new Map(conflictWorkspace.cells.map((cell) => [
                gradebookCellKey(cell.enrollmentId, cell.columnId), cell,
              ]));
              setView(conflictWorkspace);
              setDrafts((current) => Object.fromEntries(Object.entries(current).map(([key, draft]) => {
                const remote = remoteCells.get(key);
                return [key, {
                  ...draft,
                  sourceId: remote?.sourceId ?? null,
                  expectedRowVersion: remote?.rowVersion ?? 0,
                }];
              })));
              setRetryKey(null);
              setRowErrors({});
              setConflictWorkspace(null);
              setFeedback({ kind: 'conflict', message: 'Tus valores quedaron sobre la versión reciente. Revísalos y presiona Guardar lote para confirmar un nuevo intento.' });
            }}>Aplicar mis valores sobre la versión reciente</Button>
            <Button onClick={() => { if (conflictWorkspace) setView(conflictWorkspace); setDrafts({}); setRetryKey(null); setRowErrors({}); setConflictWorkspace(null); setFeedback({ kind: 'success', message: 'Se cargaron los datos recientes; los cambios locales fueron descartados por decisión explícita.' }); }}>Usar datos recientes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
