'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, History, LockKeyhole, Plus, Save, Scale } from 'lucide-react';

import {
  activateAcademicSchemeAction, copyAcademicSchemeAction,
  listAcademicAuditAction, loadAcademicConfigurationAction,
  saveAcademicCriterionAction, saveAcademicSchemeAction,
  saveAcademicSubcriterionAction,
} from '@/lib/actions/calificaciones';
import type {
  AcademicAssignmentOptionDto, AcademicConfigurationDto,
  AcademicCriterionConfigurationDto, AcademicSchemeConfigurationDto,
  AcademicSubcriterionConfigurationDto,
} from '@/lib/academic/configuration-dto';
import type { AcademicActionResult, AcademicAuditDto } from '@/lib/academic/dto';
import type { EvaluationCriterionInput } from '@/lib/academic-grading/criterion-policy';
import { redistributeWeights, sumWeights } from '@/lib/academic-grading/weights';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WeightDistributionPreview } from './WeightDistributionPreview';
import { AcademicCriteriaTour } from './AcademicCriteriaTour';
import {
  AcademicConfigurationHeader, AcademicConfirmDialog, AcademicErrorState,
  AcademicFeedback, AcademicLoadingState, fieldClassName,
} from './AcademicConfigurationUi';

type LoadState = { kind: 'loading' }
  | { kind: 'ready'; data: AcademicConfigurationDto }
  | { kind: 'failed'; result: Extract<AcademicActionResult<AcademicConfigurationDto>, { ok: false }> };
type Feedback = null | { kind: 'saving' | 'success' | 'error' | 'conflict'; message: string };
type Confirmation = null | 'scheme' | 'activate' | 'copy';

const emptyScheme = {
  id: undefined as string | undefined,
  expectedUpdatedAt: undefined as string | undefined,
  cycleId: '', assignmentId: '', periodId: '', name: '',
  passingGrade: 6, displayDecimals: 1 as 0 | 1 | 2,
};

function schemeForm(row: AcademicSchemeConfigurationDto) {
  return {
    id: row.id, expectedUpdatedAt: row.updatedAt, cycleId: row.cycleId,
    assignmentId: row.assignmentId, periodId: row.periodId, name: row.name,
    passingGrade: row.passingGrade, displayDecimals: row.displayDecimals,
  };
}

function uniqueOptions(rows: AcademicAssignmentOptionDto[], id: keyof AcademicAssignmentOptionDto, name: keyof AcademicAssignmentOptionDto) {
  return [...new Map(rows.map((row) => [String(row[id]), String(row[name])])).entries()];
}

function toWeightCriteria(rows: AcademicCriterionConfigurationDto[]): EvaluationCriterionInput[] {
  return rows.map((criterion) => ({
    id: criterion.id, name: criterion.name, type: criterion.type,
    weight: criterion.weight, order: criterion.order, active: criterion.active,
    subcriteria: criterion.subcriteria.map((subcriterion): EvaluationCriterionInput['subcriteria'][number] => {
      const common = {
        id: subcriterion.id, name: subcriterion.name,
        internalWeight: subcriterion.internalWeight, order: subcriterion.order,
        active: subcriterion.active,
      };
      if (subcriterion.type === 'actividades') {
        return { ...common, type: 'actividades', configuration: { agregacion: 'promedio' } };
      }
      if (subcriterion.type === 'participacion') {
        const source = subcriterion.configuration as { modo?: string; meta?: number };
        return source.modo === 'meta_fija' && typeof source.meta === 'number'
          ? { ...common, type: 'participacion', configuration: { modo: 'meta_fija', meta: source.meta } }
          : { ...common, type: 'participacion', configuration: { modo: 'maximo_grupo' } };
      }
      return { ...common, type: 'directo', configuration: {} };
    }),
  }));
}

function validForActivation(scheme: AcademicSchemeConfigurationDto | undefined): boolean {
  if (!scheme || scheme.state !== 'borrador') return false;
  const active = scheme.criteria.filter((criterion) => criterion.active);
  if (active.length === 0 || sumWeights(active.map((criterion) => criterion.weight)) !== 100) return false;
  return active.every((criterion) => {
    const children = criterion.subcriteria.filter((child) => child.active);
    if (criterion.type === 'hibrido' && children.length < 2) return false;
    if (children.length > 0 && sumWeights(children.map((child) => child.internalWeight)) !== 100) return false;
    return children.every((child) => child.internalWeight > 0 && (criterion.type === 'hibrido' || child.type === criterion.type));
  });
}

function defaultConfiguration(type: AcademicSubcriterionConfigurationDto['type']) {
  if (type === 'actividades') return { agregacion: 'promedio' as const };
  if (type === 'participacion') return { modo: 'maximo_grupo' as const };
  return {};
}

function SubcriterionEditor({
  child, disabled, onSave,
}: {
  child: AcademicSubcriterionConfigurationDto;
  disabled: boolean;
  onSave: (draft: AcademicSubcriterionConfigurationDto) => Promise<void>;
}) {
  const [draft, setDraft] = useState(child);
  const sourceConfiguration = draft.configuration as { modo?: string; meta?: number };
  const participationMode = sourceConfiguration.modo === 'meta_fija' ? 'meta_fija' : 'maximo_grupo';

  useEffect(() => setDraft(child), [child]);

  function changeType(type: AcademicSubcriterionConfigurationDto['type']) {
    setDraft((value) => ({ ...value, type, configuration: defaultConfiguration(type) }));
  }

  return (
    <li className="grid gap-3 rounded-md bg-muted/40 p-3 text-sm md:grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_7rem_5rem_auto]">
      <div className="space-y-1"><Label htmlFor={`subcriterion-name-${child.id}`}>Subcriterio</Label><Input id={`subcriterion-name-${child.id}`} disabled={disabled} value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></div>
      <div className="space-y-1"><Label htmlFor={`subcriterion-type-${child.id}`}>Tipo</Label><select id={`subcriterion-type-${child.id}`} className={fieldClassName} disabled={disabled} value={draft.type} onChange={(event) => changeType(event.target.value as typeof draft.type)}><option value="directo">Directo</option><option value="actividades">Actividades</option><option value="participacion">Participación</option></select></div>
      <div className="space-y-1"><Label htmlFor={`subcriterion-weight-${child.id}`}>Peso interno %</Label><Input id={`subcriterion-weight-${child.id}`} type="number" min={0} max={100} step="0.0001" disabled={disabled} value={draft.internalWeight} onChange={(event) => setDraft((value) => ({ ...value, internalWeight: Number(event.target.value) }))} /></div>
      <div className="space-y-1"><Label htmlFor={`subcriterion-order-${child.id}`}>Orden</Label><Input id={`subcriterion-order-${child.id}`} type="number" min={1} max={99} disabled={disabled} value={draft.order} onChange={(event) => setDraft((value) => ({ ...value, order: Number(event.target.value) }))} /></div>
      <div className="flex flex-wrap items-end gap-2"><Button type="button" size="sm" disabled={disabled || !draft.name} onClick={() => void onSave(draft)}><Save />Guardar</Button>{!disabled ? <Button type="button" size="sm" variant="outline" onClick={() => setDraft((value) => ({ ...value, active: !value.active }))}>{draft.active ? 'Marcar inactivo' : 'Reactivar'}</Button> : null}</div>
      {draft.type === 'participacion' ? (
        <div className="grid gap-3 md:col-span-5 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor={`participation-mode-${child.id}`}>Cálculo de participación</Label><select id={`participation-mode-${child.id}`} className={fieldClassName} disabled={disabled} value={participationMode} onChange={(event) => setDraft((value) => ({ ...value, configuration: event.target.value === 'meta_fija' ? { modo: 'meta_fija', meta: 1 } : { modo: 'maximo_grupo' } }))}><option value="maximo_grupo">Máximo del grupo</option><option value="meta_fija">Meta fija</option></select></div>
          {participationMode === 'meta_fija' ? <div className="space-y-1"><Label htmlFor={`participation-goal-${child.id}`}>Meta positiva</Label><Input id={`participation-goal-${child.id}`} type="number" min="0.0001" step="0.0001" disabled={disabled} value={sourceConfiguration.meta ?? 1} onChange={(event) => setDraft((value) => ({ ...value, configuration: { modo: 'meta_fija', meta: Number(event.target.value) } }))} /></div> : null}
        </div>
      ) : null}
    </li>
  );
}

function CriterionEditor({
  criterion, disabled, onSaved, onFeedback,
}: {
  criterion: AcademicCriterionConfigurationDto;
  disabled: boolean;
  onSaved: () => Promise<void>;
  onFeedback: (feedback: Feedback) => void;
}) {
  const [draft, setDraft] = useState({
    id: criterion.id, expectedUpdatedAt: criterion.updatedAt, schemeId: criterion.schemeId,
    name: criterion.name, type: criterion.type, weight: criterion.weight,
    order: criterion.order, active: criterion.active,
  });
  const [newChild, setNewChild] = useState({
    name: '', type: 'directo' as AcademicSubcriterionConfigurationDto['type'],
    internalWeight: 0, order: criterion.subcriteria.length + 1,
  });

  useEffect(() => {
    setDraft({
      id: criterion.id, expectedUpdatedAt: criterion.updatedAt, schemeId: criterion.schemeId,
      name: criterion.name, type: criterion.type, weight: criterion.weight,
      order: criterion.order, active: criterion.active,
    });
  }, [criterion]);

  async function saveCriterion() {
    onFeedback({ kind: 'saving', message: `Guardando ${draft.name || 'criterio'}…` });
    const result = await saveAcademicCriterionAction(draft);
    if (!result.ok) {
      onFeedback({ kind: result.status === 'conflict' ? 'conflict' : 'error', message: result.error.message });
      return;
    }
    onFeedback({ kind: 'success', message: 'Criterio guardado y verificado.' });
    await onSaved();
  }

  async function saveChild(child: AcademicSubcriterionConfigurationDto) {
    onFeedback({ kind: 'saving', message: `Guardando ${child.name}…` });
    const result = await saveAcademicSubcriterionAction({
      id: child.id, expectedUpdatedAt: child.updatedAt, criterionId: criterion.id,
      name: child.name, type: child.type, internalWeight: child.internalWeight,
      order: child.order, configuration: child.configuration, active: child.active,
    });
    if (!result.ok) {
      onFeedback({ kind: result.status === 'conflict' ? 'conflict' : 'error', message: result.error.message });
      return;
    }
    onFeedback({ kind: 'success', message: 'Subcriterio guardado y verificado.' });
    await onSaved();
  }

  async function addChild() {
    onFeedback({ kind: 'saving', message: 'Agregando subcriterio…' });
    const result = await saveAcademicSubcriterionAction({
      criterionId: criterion.id, name: newChild.name, type: newChild.type,
      internalWeight: newChild.internalWeight, order: newChild.order,
      configuration: defaultConfiguration(newChild.type), active: true,
    });
    if (!result.ok) {
      onFeedback({ kind: result.status === 'conflict' ? 'conflict' : 'error', message: result.error.message });
      return;
    }
    setNewChild({ name: '', type: 'directo', internalWeight: 0, order: newChild.order + 1 });
    onFeedback({ kind: 'success', message: 'Subcriterio agregado y verificado.' });
    await onSaved();
  }

  return (
    <li className="space-y-4 rounded-lg border p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_7rem_5rem_auto]">
        <div className="space-y-1"><Label htmlFor={`criterion-name-${criterion.id}`}>Criterio</Label><Input id={`criterion-name-${criterion.id}`} disabled={disabled} value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></div>
        <div className="space-y-1"><Label htmlFor={`criterion-type-${criterion.id}`}>Cómo se calificará</Label><select id={`criterion-type-${criterion.id}`} className={fieldClassName} disabled={disabled} value={draft.type} onChange={(event) => setDraft((value) => ({ ...value, type: event.target.value as typeof value.type }))}><option value="directo">Captura manual</option><option value="actividades">Promedio de actividades</option><option value="participacion">Participación</option><option value="hibrido">Mixto con subcriterios</option></select></div>
        <div className="space-y-1"><Label htmlFor={`criterion-weight-${criterion.id}`}>Peso %</Label><Input id={`criterion-weight-${criterion.id}`} type="number" min={0} max={100} step="0.0001" disabled={disabled} value={draft.weight} onChange={(event) => setDraft((value) => ({ ...value, weight: Number(event.target.value) }))} /></div>
        <div className="space-y-1"><Label htmlFor={`criterion-order-${criterion.id}`}>Orden</Label><Input id={`criterion-order-${criterion.id}`} type="number" min={1} max={99} disabled={disabled} value={draft.order} onChange={(event) => setDraft((value) => ({ ...value, order: Number(event.target.value) }))} /></div>
        <div className="flex items-end"><Button type="button" size="sm" disabled={disabled || !draft.name} onClick={() => void saveCriterion()}><Save />Guardar</Button></div>
      </div>
      {!disabled ? <Button type="button" size="sm" variant="outline" onClick={() => setDraft((value) => ({ ...value, active: !value.active }))}>{draft.active ? 'Marcar inactivo' : 'Reactivar'}</Button> : null}
      {criterion.subcriteria.length > 0 ? (
        <ul className="space-y-2 border-l pl-4" aria-label={`Subcriterios de ${criterion.name}`}>
          {criterion.subcriteria.map((child) => <SubcriterionEditor key={child.id} child={child} disabled={disabled} onSave={saveChild} />)}
        </ul>
      ) : null}
      {!disabled ? (
        <fieldset className="grid gap-3 rounded-md border border-dashed p-3 sm:grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_7rem_auto]">
          <legend className="px-1 text-sm font-medium">Agregar subcriterio</legend>
          <Input aria-label={`Nombre de subcriterio para ${criterion.name}`} placeholder="Nombre" value={newChild.name} onChange={(event) => setNewChild((value) => ({ ...value, name: event.target.value }))} />
          <select aria-label={`Tipo del nuevo subcriterio para ${criterion.name}`} className={fieldClassName} value={newChild.type} onChange={(event) => setNewChild((value) => ({ ...value, type: event.target.value as typeof value.type }))}><option value="directo">Directo</option><option value="actividades">Actividades</option><option value="participacion">Participación</option></select>
          <Input aria-label={`Peso interno del nuevo subcriterio para ${criterion.name}`} type="number" min={0} max={100} step="0.0001" value={newChild.internalWeight} onChange={(event) => setNewChild((value) => ({ ...value, internalWeight: Number(event.target.value) }))} />
          <Button type="button" variant="outline" disabled={!newChild.name} onClick={() => void addChild()}><Plus />Agregar</Button>
        </fieldset>
      ) : null}
    </li>
  );
}

interface AcademicSchemesPageProps {
  audience?: 'administration' | 'teacher';
}

export function AcademicSchemesPage({ audience = 'administration' }: AcademicSchemesPageProps) {
  const teacherView = audience === 'teacher';
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [audit, setAudit] = useState<AcademicAuditDto[]>([]);
  const [cycleId, setCycleId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [careerId, setCareerId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [selectedSchemeId, setSelectedSchemeId] = useState('');
  const [schemeDraft, setSchemeDraft] = useState(emptyScheme);
  const [copyName, setCopyName] = useState('');
  const [newCriterion, setNewCriterion] = useState({ name: '', type: 'directo' as AcademicCriterionConfigurationDto['type'], weight: 100, order: 1 });

  const load = useCallback(async (preferredSchemeId?: string) => {
    setLoadState({ kind: 'loading' });
    const [result, auditResult] = await Promise.all([
      loadAcademicConfigurationAction(),
      teacherView
        ? Promise.resolve(null)
        : listAcademicAuditAction({ page: 1, pageSize: 10 }),
    ]);
    if (!result.ok) {
      setLoadState({ kind: 'failed', result });
      return;
    }
    setLoadState({ kind: 'ready', data: result.data });
    if (auditResult?.ok) setAudit(auditResult.data.items);
    const scheme = result.data.schemes.find((item) => item.id === preferredSchemeId)
      ?? result.data.schemes.find((item) => item.state === 'borrador')
      ?? result.data.schemes.find((item) => item.state === 'activo');
    const assignment = scheme
      ? result.data.assignments.find((item) => item.id === scheme.assignmentId)
      : result.data.assignments[0];
    const cycle = scheme?.cycleId ?? assignment?.cycleId ?? result.data.cycles.find((item) => item.state === 'activo')?.id ?? result.data.cycles[0]?.id ?? '';
    setCycleId(cycle);
    if (assignment) {
      setLevelId(assignment.levelId); setCareerId(assignment.careerId);
      setGradeId(assignment.gradeId); setGroupId(assignment.groupId); setAssignmentId(assignment.id);
    }
    const period = scheme?.periodId ?? result.data.periods.find((item) => item.cycleId === cycle && item.state === 'activo')?.id ?? result.data.periods.find((item) => item.cycleId === cycle)?.id ?? '';
    setPeriodId(period);
    if (scheme) {
      setSelectedSchemeId(scheme.id); setSchemeDraft(schemeForm(scheme)); setCopyName(`${scheme.name} — nueva versión`);
      setNewCriterion((value) => ({ ...value, order: scheme.criteria.length + 1 }));
    } else {
      setSelectedSchemeId(''); setSchemeDraft({ ...emptyScheme, cycleId: cycle, assignmentId: assignment?.id ?? '', periodId: period });
    }
  }, [teacherView]);

  useEffect(() => { void load(); }, [load]);
  const data = loadState.kind === 'ready' ? loadState.data : null;
  const cycleAssignments = data?.assignments.filter((row) => row.cycleId === cycleId) ?? [];
  const levelAssignments = cycleAssignments.filter((row) => !levelId || row.levelId === levelId);
  const careerAssignments = levelAssignments.filter((row) => !careerId || row.careerId === careerId);
  const gradeAssignments = careerAssignments.filter((row) => !gradeId || row.gradeId === gradeId);
  const groupAssignments = gradeAssignments.filter((row) => !groupId || row.groupId === groupId);
  const availableSchemes = data?.schemes.filter((row) => row.assignmentId === assignmentId && row.periodId === periodId) ?? [];
  const selectedScheme = data?.schemes.find((row) => row.id === selectedSchemeId);
  const readOnly = Boolean(selectedScheme && selectedScheme.state !== 'borrador');
  const activationReady = validForActivation(selectedScheme);

  function chooseAssignment(id: string) {
    const assignment = data?.assignments.find((row) => row.id === id);
    setAssignmentId(id);
    if (assignment) {
      setLevelId(assignment.levelId); setCareerId(assignment.careerId);
      setGradeId(assignment.gradeId); setGroupId(assignment.groupId);
    }
    setSelectedSchemeId('');
    setSchemeDraft((value) => ({ ...emptyScheme, cycleId, assignmentId: id, periodId, passingGrade: value.passingGrade, displayDecimals: value.displayDecimals }));
  }

  function chooseScheme(id: string) {
    setSelectedSchemeId(id);
    const scheme = data?.schemes.find((row) => row.id === id);
    if (scheme) {
      setSchemeDraft(schemeForm(scheme));
      setCopyName(`${scheme.name} — nueva versión`);
      setNewCriterion((value) => ({ ...value, order: scheme.criteria.length + 1 }));
    } else {
      setSchemeDraft({ ...emptyScheme, cycleId, assignmentId, periodId });
    }
    setFeedback(null);
  }

  async function saveScheme() {
    setConfirmation(null); setFeedback({ kind: 'saving', message: 'Guardando esquema…' });
    const result = await saveAcademicSchemeAction(schemeDraft);
    if (!result.ok) { setFeedback({ kind: result.status === 'conflict' ? 'conflict' : 'error', message: result.error.message }); return; }
    setFeedback({ kind: 'success', message: 'Esquema guardado y verificado.' });
    await load(result.data.id);
  }

  async function addCriterion() {
    if (!selectedScheme) return;
    setFeedback({ kind: 'saving', message: 'Agregando criterio…' });
    const result = await saveAcademicCriterionAction({
      schemeId: selectedScheme.id, name: newCriterion.name, type: newCriterion.type,
      weight: newCriterion.weight, order: newCriterion.order, active: true,
    });
    if (!result.ok) { setFeedback({ kind: result.status === 'conflict' ? 'conflict' : 'error', message: result.error.message }); return; }
    setNewCriterion({ name: '', type: 'directo', weight: 0, order: newCriterion.order + 1 });
    setFeedback({ kind: 'success', message: 'Criterio agregado y verificado.' });
    await load(selectedScheme.id);
  }

  async function activate() {
    if (!selectedScheme) return;
    setConfirmation(null); setFeedback({ kind: 'saving', message: 'Activando esquema…' });
    const result = await activateAcademicSchemeAction({ schemeId: selectedScheme.id, expectedVersion: selectedScheme.version });
    if (!result.ok) { setFeedback({ kind: result.status === 'conflict' ? 'conflict' : 'error', message: result.error.message }); return; }
    setFeedback({ kind: 'success', message: 'Esquema activo. La persistencia fue confirmada.' });
    await load(selectedScheme.id);
  }

  async function copyScheme() {
    if (!selectedScheme) return;
    setConfirmation(null); setFeedback({ kind: 'saving', message: 'Creando nueva versión…' });
    const result = await copyAcademicSchemeAction({ schemeId: selectedScheme.id, expectedVersion: selectedScheme.version, name: copyName });
    if (!result.ok) { setFeedback({ kind: result.status === 'conflict' ? 'conflict' : 'error', message: result.error.message }); return; }
    setFeedback({ kind: 'success', message: 'Nueva versión creada con sus criterios.' });
    await load(result.data.schemeId);
  }

  async function redistributeCriteria() {
    if (!selectedScheme || readOnly) return;
    const activeCriteria = selectedScheme.criteria.filter((criterion) => criterion.active);
    const weights = redistributeWeights(activeCriteria.map((criterion) => criterion.weight));
    setFeedback({ kind: 'saving', message: 'Redistribuyendo los criterios a 100%…' });

    for (const [index, criterion] of activeCriteria.entries()) {
      const result = await saveAcademicCriterionAction({
        id: criterion.id,
        expectedUpdatedAt: criterion.updatedAt,
        schemeId: criterion.schemeId,
        name: criterion.name,
        type: criterion.type,
        weight: weights[index],
        order: criterion.order,
        active: criterion.active,
      });
      if (!result.ok) {
        setFeedback({
          kind: result.status === 'conflict' ? 'conflict' : 'error',
          message: `No se pudo completar la redistribución: ${result.error.message}`,
        });
        await load(selectedScheme.id);
        return;
      }
    }

    setFeedback({ kind: 'success', message: 'Los porcentajes se redistribuyeron y guardaron con total exacto de 100%.' });
    await load(selectedScheme.id);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {teacherView ? (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={1} className="flex items-center gap-2"><Scale aria-hidden="true" />Mis criterios de evaluación</CardTitle>
            <CardDescription>
              Define cómo evaluarás a tus alumnos en cada materia y grupo. Dirección puede supervisar y editar estos mismos criterios.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : <AcademicConfigurationHeader current="schemes" />}
      {teacherView ? <AcademicCriteriaTour /> : null}
      {loadState.kind === 'loading' ? <AcademicLoadingState /> : null}
      {loadState.kind === 'failed' ? <AcademicErrorState status={loadState.result.status} error={loadState.result.error} onRetry={() => void load()} /> : null}
      {data ? (
        <>
          <AcademicFeedback state={feedback} />
          {data.assignments.length === 0 || data.periods.length === 0 ? (
            <Card><CardHeader><CardTitle>Falta contexto académico</CardTitle><CardDescription>{teacherView ? 'Dirección debe asignarte al menos una materia y mantener disponible un periodo de evaluación.' : 'Crea al menos un periodo y una asignación docente activa antes de definir un esquema.'}</CardDescription></CardHeader></Card>
          ) : (
            <>
              <Card data-criteria-tour={teacherView ? 'scope' : undefined}>
                <CardHeader><CardTitle>{teacherView ? 'Materia, grupo y periodo' : 'Alcance del esquema'}</CardTitle><CardDescription>{teacherView ? 'Sólo aparecen las asignaciones docentes que te corresponden.' : 'Selecciona de lo general a lo específico. Cada filtro reduce las opciones siguientes.'}</CardDescription></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2"><Label htmlFor="scheme-cycle">Ciclo</Label><select id="scheme-cycle" className={fieldClassName} value={cycleId} onChange={(event) => { const id = event.target.value; setCycleId(id); setLevelId(''); setCareerId(''); setGradeId(''); setGroupId(''); setAssignmentId(''); setPeriodId(''); setSelectedSchemeId(''); }}><option value="">Selecciona ciclo</option>{data.cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}</select></div>
                  {teacherView ? (
                    <div className="space-y-2 sm:col-span-2"><Label htmlFor="scheme-assignment">Mi materia y grupo</Label><select id="scheme-assignment" className={fieldClassName} value={assignmentId} onChange={(event) => chooseAssignment(event.target.value)}><option value="">Selecciona asignación</option>{cycleAssignments.map((row) => <option key={row.id} value={row.id}>{row.subjectName} — {row.gradeName} {row.groupName}</option>)}</select></div>
                  ) : <>
                  <div className="space-y-2"><Label htmlFor="scheme-level">Nivel</Label><select id="scheme-level" className={fieldClassName} value={levelId} onChange={(event) => { setLevelId(event.target.value); setCareerId(''); setGradeId(''); setGroupId(''); setAssignmentId(''); }}><option value="">Selecciona nivel</option>{uniqueOptions(cycleAssignments, 'levelId', 'levelName').map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
                  <div className="space-y-2"><Label htmlFor="scheme-career">Carrera o programa</Label><select id="scheme-career" className={fieldClassName} value={careerId} onChange={(event) => { setCareerId(event.target.value); setGradeId(''); setGroupId(''); setAssignmentId(''); }}><option value="">Selecciona carrera</option>{uniqueOptions(levelAssignments, 'careerId', 'careerName').map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
                  <div className="space-y-2"><Label htmlFor="scheme-grade">Grado</Label><select id="scheme-grade" className={fieldClassName} value={gradeId} onChange={(event) => { setGradeId(event.target.value); setGroupId(''); setAssignmentId(''); }}><option value="">Selecciona grado</option>{uniqueOptions(careerAssignments, 'gradeId', 'gradeName').map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
                  <div className="space-y-2"><Label htmlFor="scheme-group">Grupo</Label><select id="scheme-group" className={fieldClassName} value={groupId} onChange={(event) => { setGroupId(event.target.value); setAssignmentId(''); }}><option value="">Selecciona grupo</option>{uniqueOptions(gradeAssignments, 'groupId', 'groupName').map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor="scheme-assignment">Materia y profesor</Label><select id="scheme-assignment" className={fieldClassName} value={assignmentId} onChange={(event) => chooseAssignment(event.target.value)}><option value="">Selecciona asignación</option>{groupAssignments.map((row) => <option key={row.id} value={row.id}>{row.subjectName} — {row.teacherName}</option>)}</select></div>
                  </>}
                  <div className="space-y-2"><Label htmlFor="scheme-period">Periodo</Label><select id="scheme-period" className={fieldClassName} value={periodId} onChange={(event) => { const id = event.target.value; setPeriodId(id); setSelectedSchemeId(''); setSchemeDraft({ ...emptyScheme, cycleId, assignmentId, periodId: id }); }}><option value="">Selecciona periodo</option>{data.periods.filter((row) => row.cycleId === cycleId).map((period) => <option key={period.id} value={period.id}>{period.order}. {period.name} — {period.state}</option>)}</select></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Scale aria-hidden="true" />Reglas del esquema</CardTitle><CardDescription>Primero crea un borrador. Después podrás agregar Examen, Proyecto, Tareas u otros criterios.</CardDescription></div><Button data-criteria-tour="draft" variant="outline" disabled={!assignmentId || !periodId} onClick={() => chooseScheme('')}><Plus />Nuevo borrador</Button></div></CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2"><Label htmlFor="scheme-selector">Versión</Label><select id="scheme-selector" className={fieldClassName} disabled={!assignmentId || !periodId} value={selectedSchemeId} onChange={(event) => chooseScheme(event.target.value)}><option value="">Nuevo esquema</option>{availableSchemes.map((scheme) => <option key={scheme.id} value={scheme.id}>v{scheme.version} · {scheme.name} — {scheme.state}</option>)}</select></div>
                  {readOnly ? <p role="status" className="flex items-center gap-2 rounded-md border p-3 text-sm"><LockKeyhole className="size-4" aria-hidden="true" />Esta versión es histórica o activa y no se reescribe. Crea una copia para editar.</p> : null}
                  <form data-criteria-tour="rules" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); setConfirmation('scheme'); }}>
                    <div className="space-y-2 sm:col-span-2"><Label htmlFor="scheme-name">Nombre</Label><Input id="scheme-name" required disabled={readOnly} value={schemeDraft.name} onChange={(event) => setSchemeDraft((value) => ({ ...value, name: event.target.value, cycleId, assignmentId, periodId }))} /></div>
                    <div className="space-y-2"><Label htmlFor="scheme-passing">Calificación aprobatoria</Label><Input id="scheme-passing" type="number" min={0} max={10} step="0.0001" required disabled={readOnly} value={schemeDraft.passingGrade} onChange={(event) => setSchemeDraft((value) => ({ ...value, passingGrade: Number(event.target.value) }))} /></div>
                    <div className="space-y-2"><Label htmlFor="scheme-decimals">Decimales visibles</Label><select id="scheme-decimals" className={fieldClassName} disabled={readOnly} value={schemeDraft.displayDecimals} onChange={(event) => setSchemeDraft((value) => ({ ...value, displayDecimals: Number(event.target.value) as 0 | 1 | 2 }))}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option></select></div>
                    <div className="rounded-md border bg-muted/40 p-3 text-sm"><strong>Escala fija:</strong> 0 a 10</div><div className="rounded-md border bg-muted/40 p-3 text-sm"><strong>Redondeo:</strong> mitad hacia arriba</div><div className="rounded-md border bg-muted/40 p-3 text-sm"><strong>No entrega:</strong> 0 al cierre</div><div className="rounded-md border bg-muted/40 p-3 text-sm"><strong>Justificado:</strong> excluir</div>
                    <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-2"><Button type="submit" disabled={readOnly || !assignmentId || !periodId || !schemeDraft.name}><Save />Guardar reglas</Button>{selectedScheme ? <Badge variant="outline">v{selectedScheme.version} · {selectedScheme.state}</Badge> : null}</div>
                  </form>
                </CardContent>
              </Card>

              {selectedScheme ? (
                <div className={teacherView ? 'grid gap-6' : 'grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]'}>
                  <Card>
                    <CardHeader><CardTitle>Criterios y subcriterios</CardTitle><CardDescription>El total superior y cada distribución interna deben sumar exactamente 100%.</CardDescription></CardHeader>
                    <CardContent className="space-y-5">
                      <div data-criteria-tour="distribution"><WeightDistributionPreview criteria={toWeightCriteria(selectedScheme.criteria)} disabled={readOnly} onRedistribute={() => void redistributeCriteria()} /></div>
                      <ol className="space-y-3" aria-label="Editor de criterios">
                        {selectedScheme.criteria.map((criterion) => <CriterionEditor key={criterion.id} criterion={criterion} disabled={readOnly} onSaved={() => load(selectedScheme.id)} onFeedback={setFeedback} />)}
                      </ol>
                      {!readOnly ? <fieldset data-criteria-tour="new-criterion" className="grid gap-3 rounded-lg border border-dashed p-4 sm:grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_7rem_5rem_auto]"><legend className="px-1 font-medium">Agregar un criterio</legend><p className="text-sm text-muted-foreground sm:col-span-5">Ejemplo: escribe “Examen”, selecciona cómo se calificará, asigna su porcentaje y pulsa Agregar.</p><Input aria-label="Nombre del nuevo criterio" placeholder="Ej. Examen" value={newCriterion.name} onChange={(event) => setNewCriterion((value) => ({ ...value, name: event.target.value }))} /><select aria-label="Tipo del nuevo criterio" className={fieldClassName} value={newCriterion.type} onChange={(event) => setNewCriterion((value) => ({ ...value, type: event.target.value as typeof value.type }))}><option value="directo">Captura manual</option><option value="actividades">Promedio de actividades</option><option value="participacion">Participación</option><option value="hibrido">Mixto con subcriterios</option></select><Input aria-label="Peso del nuevo criterio" title="Porcentaje dentro de la calificación final" type="number" min={0} max={100} step="0.0001" value={newCriterion.weight} onChange={(event) => setNewCriterion((value) => ({ ...value, weight: Number(event.target.value) }))} /><Input aria-label="Orden del nuevo criterio" title="Posición en la lista" type="number" min={1} max={99} value={newCriterion.order} onChange={(event) => setNewCriterion((value) => ({ ...value, order: Number(event.target.value) }))} /><Button type="button" disabled={!newCriterion.name} onClick={() => void addCriterion()}><Plus />Agregar</Button></fieldset> : null}
                      <div data-criteria-tour="activation" className="flex flex-wrap gap-2"><Button type="button" disabled={!activationReady} onClick={() => setConfirmation('activate')}><CheckCircle2 />Activar esquema</Button>{selectedScheme.state !== 'borrador' ? <><Input aria-label="Nombre de la nueva versión" className="max-w-sm" value={copyName} onChange={(event) => setCopyName(event.target.value)} /><Button type="button" variant="outline" disabled={!copyName.trim()} onClick={() => setConfirmation('copy')}><Copy />Crear copia editable</Button></> : null}</div>
                      {!activationReady && selectedScheme.state === 'borrador' ? <p role="status" className="text-sm text-muted-foreground">La activación seguirá bloqueada hasta tener criterios válidos con total superior e internos exactamente en 100%.</p> : null}
                    </CardContent>
                  </Card>
                  {!teacherView ? <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><History aria-hidden="true" />Auditoría académica</CardTitle><CardDescription>Sólo lectura. Cambios recientes del tenant visibles para administración.</CardDescription></CardHeader>
                    <CardContent>{audit.length === 0 ? <p className="text-sm text-muted-foreground">No hay eventos académicos registrados todavía.</p> : <ol className="space-y-3">{audit.map((event) => <li key={event.id} className="rounded-md border p-3 text-sm"><p className="font-medium">{event.action}</p><p className="text-muted-foreground">{event.createdAt ? new Date(event.createdAt).toLocaleString('es-MX') : 'Fecha no disponible'} · {event.entity}</p></li>)}</ol>}</CardContent>
                  </Card> : null}
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
      <AcademicConfirmDialog open={confirmation === 'scheme'} onOpenChange={(open) => !open && setConfirmation(null)} onConfirm={() => void saveScheme()} title="Confirmar reglas del esquema" description="La aprobatoria y los decimales cambian la interpretación visual de las calificaciones. La escala seguirá fija de 0 a 10." />
      <AcademicConfirmDialog open={confirmation === 'activate'} onOpenChange={(open) => !open && setConfirmation(null)} onConfirm={() => void activate()} title="Activar esquema" description="La base volverá a validar que los pesos superiores e internos sumen exactamente 100%. Una versión activa no se edita: cualquier cambio posterior requiere una copia versionada." confirmLabel="Activar versión" />
      <AcademicConfirmDialog open={confirmation === 'copy'} onOpenChange={(open) => !open && setConfirmation(null)} onConfirm={() => void copyScheme()} title="Crear copia versionada" description="La versión actual conservará su historial y se creará un nuevo borrador con los mismos criterios y subcriterios." confirmLabel="Crear copia" />
    </div>
  );
}
