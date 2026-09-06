'use client';

import { useState } from 'react';
import { distributeAcademicSchemeAction } from '@/lib/actions/calificaciones';
import type { AcademicConfigurationDto, AcademicSchemeConfigurationDto } from '@/lib/academic/configuration-dto';
import { Button } from '@/components/ui/button';

export function DistributeScheme({ data, scheme }: { data: AcademicConfigurationDto; scheme: AcademicSchemeConfigurationDto }) {
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const teacherId = data.assignments.find((row) => row.id === scheme.assignmentId)?.teacherId;
  const options = data.assignments.filter((row) => row.teacherId === teacherId && row.cycleId === scheme.cycleId && row.id !== scheme.assignmentId);
  const label = (id: string) => {
    const row = options.find((item) => item.id === id);
    return row ? `${row.subjectName} — ${row.gradeName} ${row.groupName}` : id;
  };
  async function apply() {
    setBusy(true);
    setMessages([]);
    try {
      const result = await distributeAcademicSchemeAction({ schemeId: scheme.id, expectedVersion: scheme.version, assignmentIds: selected });
      setMessages(result.ok ? result.data.results.map((row) => `${label(row.assignmentId)}: ${row.message}`) : [result.error.message]);
    } catch {
      setMessages(['No se pudo confirmar el resultado. Actualiza y revisa las asignaciones antes de volver a aplicar.']);
    } finally { setBusy(false); }
  }
  return <section className="mt-4 space-y-3 rounded-xl border p-4">
    <label className="flex items-center gap-3 font-medium"><input type="checkbox" role="switch" checked={enabled} disabled={busy} onChange={(event) => setEnabled(event.target.checked)} />Aplicar estos criterios a otras materias</label>
    {enabled && <>
      <p className="text-sm">Se guardarán copias independientes para el mismo periodo: {data.periods.find((row) => row.id === scheme.periodId)?.name}. No se sincronizan cambios futuros ni se copian calificaciones. Las asignaciones que ya tengan esquemas se conservan sin cambios.</p>
      <Button type="button" variant="outline" disabled={busy || !options.length} onClick={() => setSelected(options.map((row) => row.id))}>Seleccionar todas mis asignaciones</Button>
      <div className="max-h-64 space-y-2 overflow-auto">{options.map((row) => <label key={row.id} className="flex items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={selected.includes(row.id)} disabled={busy} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id))} />{label(row.id)}{data.schemes.some((item) => item.assignmentId === row.id && item.periodId === scheme.periodId) ? ' · Ya tiene esquema (se conservará)' : ''}</label>)}</div>
      {!options.length && <p>No tienes otras asignaciones en este ciclo.</p>}
      <Button type="button" disabled={busy || !selected.length} onClick={() => void apply()}>{busy ? 'Aplicando…' : `Confirmar y aplicar a ${selected.length} asignaciones`}</Button>
    </>}
    <div role="status" className="space-y-2 text-sm">{messages.map((message) => <p key={message}>{message}</p>)}</div>
  </section>;
}
