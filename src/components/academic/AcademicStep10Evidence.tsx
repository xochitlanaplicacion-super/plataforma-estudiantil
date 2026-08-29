'use client';

import { useState } from 'react';
import { CheckCircle2, Plus, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EvaluationCriterionInput } from '@/lib/academic-grading/criterion-policy';
import { AcademicConfigurationHeader, AcademicErrorState, AcademicLoadingState } from './AcademicConfigurationUi';
import { WeightDistributionPreview } from './WeightDistributionPreview';

export type AcademicEvidenceState = 'workspace' | 'loading' | 'empty' | 'error' | 'forbidden';

export function AcademicStep10Evidence({ state }: { state: AcademicEvidenceState }) {
  const [draftCreated, setDraftCreated] = useState(false);
  const [name, setName] = useState('');
  const [criterionName, setCriterionName] = useState('');
  const [weight, setWeight] = useState(0);
  const [active, setActive] = useState(false);
  const criteria: EvaluationCriterionInput[] = criterionName ? [{
    id: 'evidence-criterion', name: criterionName, type: 'directo',
    weight, order: 1, active: true, subcriteria: [],
  }] : [];

  if (state === 'loading') return <AcademicLoadingState label="Cargando evidencia" />;
  if (state === 'error') return <AcademicErrorState status="error" error={{ code: 'ACADEMIC_UNEXPECTED', message: 'No fue posible completar la operación académica.', httpStatus: 500 }} onRetry={() => undefined} />;
  if (state === 'forbidden') return <AcademicErrorState status="forbidden" error={{ code: 'ACADEMIC_FORBIDDEN', message: 'No tienes autorización para realizar esta operación académica.', httpStatus: 403 }} onRetry={() => undefined} />;
  if (state === 'empty') return (
    <Card><CardHeader><CardTitle>Comienza con el ciclo escolar</CardTitle><CardDescription>No existen ciclos o periodos configurados todavía.</CardDescription></CardHeader><CardContent><Button><Plus />Crear primer ciclo</Button></CardContent></Card>
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <AcademicConfigurationHeader current="schemes" />
      <Card>
        <CardHeader><CardTitle>Flujo verificable de activación</CardTitle><CardDescription>Arnés visual local del Paso 10; no usa datos reales ni servicios externos.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {!draftCreated ? (
            <form className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); setDraftCreated(true); }}>
              <div className="space-y-2"><Label htmlFor="evidence-scheme-name">Nombre del esquema</Label><Input id="evidence-scheme-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
              <Button className="self-end" type="submit" disabled={!name.trim()}><Save />Crear borrador</Button>
            </form>
          ) : (
            <>
              <p role="status" className="rounded-md border p-3 text-sm"><strong>{name}</strong> · borrador · Escala fija: 0 a 10</p>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                <div className="space-y-2"><Label htmlFor="evidence-criterion-name">Criterio</Label><Input id="evidence-criterion-name" disabled={active} value={criterionName} onChange={(event) => setCriterionName(event.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="evidence-weight">Peso %</Label><Input id="evidence-weight" type="number" min={0} max={100} disabled={active} value={weight} onChange={(event) => setWeight(Number(event.target.value))} /></div>
                <Button className="self-end" type="button" disabled={active || !criterionName || weight !== 100} onClick={() => setActive(true)}><CheckCircle2 />Activar esquema</Button>
              </div>
              <WeightDistributionPreview criteria={criteria} disabled={active} />
              {active ? <p role="status" className="flex items-center gap-2 rounded-md border p-3 font-medium text-primary"><CheckCircle2 aria-hidden="true" />Esquema activo y persistencia confirmada.</p> : null}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
