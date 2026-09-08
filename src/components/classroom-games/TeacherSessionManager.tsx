'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Dices, Loader2, Play, Radio, RotateCcw, Trash2, Users } from 'lucide-react';
import { createClassroomSessionAction, deleteClassroomSessionsAction, openClassroomSessionAction, resetClassroomSessionAction } from '@/lib/actions/classroom-games';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type Confirmation = { type: 'delete' | 'reset'; sessions: any[] } | null;

export function TeacherSessionManager({ initialData }: { initialData: any }) {
  const assignments = initialData.assignments || [];
  const banks = useMemo(() => initialData.banks || [], [initialData.banks]);
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id || '');
  const selectedAssignment = assignments.find((item: any) => item.id === assignmentId);
  const compatibleBanks = useMemo(() => banks.filter((bank: any) => bank.subject_id === selectedAssignment?.materia_id), [banks, selectedAssignment]);
  const [bankId, setBankId] = useState('');
  const [title, setTitle] = useState('Duelo de repaso');
  const [maxPlayers, setMaxPlayers] = useState(40);
  const [responseSeconds, setResponseSeconds] = useState(15);
  const [sessions, setSessions] = useState(initialData.sessions || []);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const result = await createClassroomSessionAction({ assignmentId, bankId, title, maxPlayers, responseSeconds, startingCoins: 10 });
      if (!result.ok) return setMessage(result.message);
      setSessions((items: any[]) => [{ id: result.data.id, title, status: 'draft', max_players: maxPlayers, assignment_id: assignmentId }, ...items]);
      setMessage('Actividad creada. Ábrela cuando el grupo esté listo para ingresar.');
    });
  }

  function open(id: string) {
    startTransition(async () => {
      const result = await openClassroomSessionAction(id);
      if (!result.ok) return setMessage(result.message);
      setSessions((items: any[]) => items.map((item) => item.id === id ? { ...item, status: 'lobby' } : item));
      setMessage('Sala abierta para los alumnos del grupo.');
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function confirmOperation() {
    if (!confirmation) return;
    const current = confirmation;
    startTransition(async () => {
      if (current.type === 'reset') {
        const session = current.sessions[0];
        const result = await resetClassroomSessionAction(session.id);
        if (!result.ok) return setMessage(result.message);
        setSessions((items: any[]) => items.map((item) => item.id === session.id ? {
          ...item, status: 'draft', current_round: 0, opened_at: null, started_at: null, finished_at: null,
        } : item));
        setMessage(`“${session.title}” se reinició y está lista para abrirse nuevamente.`);
      } else {
        const ids = current.sessions.map((session) => session.id);
        const result = await deleteClassroomSessionsAction(ids);
        if (!result.ok) return setMessage(result.message);
        setSessions((items: any[]) => items.filter((item) => !ids.includes(item.id)));
        setSelectedIds((items) => items.filter((id) => !ids.includes(id)));
        setMessage(`${result.data.deleted} ${result.data.deleted === 1 ? 'sesión eliminada' : 'sesiones eliminadas'} correctamente.`);
      }
      setConfirmation(null);
    });
  }

  return <main className="mx-auto max-w-7xl space-y-6 pb-16">
    <header className="rounded-3xl bg-[radial-gradient(circle_at_top_right,#22d3ee_0,transparent_32%),linear-gradient(135deg,#020617,#172554_55%,#581c87)] p-7 text-white shadow-xl">
      <div className="flex items-center gap-3"><Dices className="size-10 text-cyan-300"/><div><p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-200">Juego efímero · sin calificación</p><h1 className="text-3xl font-black">Actividades en clase</h1></div></div>
      <p className="mt-3 max-w-3xl text-sm text-slate-200">Abre un duelo sólo para una de tus asignaciones. Los alumnos autenticados del grupo podrán entrar y recuperar su partida aun si recargan o cierran el navegador.</p>
    </header>
    <section className="rounded-3xl border bg-card p-6">
      <h2 className="text-xl font-black">Preparar Bet Win Lose</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1 text-sm font-semibold">Materia y grupo<select className="h-11 w-full rounded-lg border bg-background px-3" value={assignmentId} onChange={(event) => { setAssignmentId(event.target.value); setBankId(''); }}>{assignments.map((item: any) => <option key={item.id} value={item.id}>{item.materias?.nombre} · {item.grupos?.nombre}</option>)}</select></label>
        <label className="space-y-1 text-sm font-semibold">Banco de preguntas<select className="h-11 w-full rounded-lg border bg-background px-3" value={bankId} onChange={(event) => setBankId(event.target.value)}><option value="">Selecciona un banco</option>{compatibleBanks.map((bank: any) => <option key={bank.id} value={bank.id}>{bank.title} ({bank.classroom_question_items?.length || 0})</option>)}</select></label>
        <label className="space-y-1 text-sm font-semibold">Nombre de la actividad<Input value={title} onChange={(event) => setTitle(event.target.value)}/></label>
        <label className="space-y-1 text-sm font-semibold">Máximo de alumnos (2–40)<Input type="number" min={2} max={40} value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))}/></label>
        <label className="space-y-1 text-sm font-semibold">Tiempo de respuesta (segundos)<Input type="number" min={5} max={60} value={responseSeconds} onChange={(event) => setResponseSeconds(Number(event.target.value))}/></label>
      </div>
      <Button className="mt-5" disabled={pending || !assignmentId || !bankId || !title.trim()} onClick={create}><Play className="size-4"/> Crear actividad</Button>
      {message && <p className="mt-3 text-sm font-semibold text-primary">{message}</p>}
    </section>
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Sesiones recientes</h2><p className="text-sm text-muted-foreground">Reinicia una sesión terminada o elimina las que ya no necesitas.</p></div>{sessions.length > 0 && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setSelectedIds(selectedIds.length === sessions.length ? [] : sessions.map((session: any) => session.id))}>{selectedIds.length === sessions.length ? 'Quitar selección' : 'Seleccionar todas'}</Button><Button type="button" variant="destructive" size="sm" disabled={!selectedIds.length || pending} onClick={() => setConfirmation({ type: 'delete', sessions: sessions.filter((session: any) => selectedIds.includes(session.id)) })}><Trash2 className="size-4"/> Borrar seleccionadas ({selectedIds.length})</Button></div>}</div>
      {sessions.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">No hay sesiones recientes.</div> : <div className="grid gap-4 lg:grid-cols-2">{sessions.map((session: any) => <article key={session.id} className={`rounded-2xl border bg-card p-5 shadow-sm ${selectedIds.includes(session.id) ? 'border-primary ring-2 ring-primary/15' : ''}`}><div className="flex items-start justify-between gap-3"><label className="flex min-w-0 cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={selectedIds.includes(session.id)} onChange={() => toggleSelected(session.id)} aria-label={`Seleccionar ${session.title}`} /><div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase text-primary">{session.status}</span><h3 className="mt-3 text-lg font-black">{session.title}</h3><p className="mt-1 text-sm text-muted-foreground">Hasta {session.max_players} alumnos</p></div></label><Radio className={session.status === 'active' ? 'shrink-0 text-red-500' : 'shrink-0 text-muted-foreground'}/></div><div className="mt-4 flex flex-wrap gap-2">{session.status === 'draft' && <Button disabled={pending} onClick={() => open(session.id)}>Abrir sala</Button>}{session.status !== 'draft' && <Button asChild><Link href={`/dashboard/profesor/actividades-clase/${session.id}`}><Users className="size-4"/> Entrar como moderador</Link></Button>}{['finished', 'cancelled'].includes(session.status) && <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirmation({ type: 'reset', sessions: [session] })}><RotateCcw className="size-4"/> Reiniciar</Button>}<Button type="button" size="icon" variant="ghost" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => setConfirmation({ type: 'delete', sessions: [session] })} aria-label={`Eliminar ${session.title}`} title="Eliminar sesión"><Trash2 className="size-4"/></Button></div></article>)}</div>}
    </section>
    <AlertDialog open={!!confirmation} onOpenChange={(open) => { if (!open && !pending) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmation?.type === 'reset' ? '¿Reiniciar esta sesión?' : `¿Eliminar ${confirmation?.sessions.length || 0} ${(confirmation?.sessions.length || 0) === 1 ? 'sesión' : 'sesiones'}?`}</AlertDialogTitle><AlertDialogDescription>{confirmation?.type === 'reset' ? 'Se conservarán el banco, materia y configuración. Se borrarán los participantes y resultados de esta partida para volver a abrirla desde cero.' : 'Se borrarán definitivamente las sesiones seleccionadas, sus participantes y resultados. Los bancos de preguntas y las calificaciones no se modificarán.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={(event) => { event.preventDefault(); confirmOperation(); }} className={confirmation?.type === 'delete' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}>{pending ? <Loader2 className="size-4 animate-spin"/> : confirmation?.type === 'reset' ? <RotateCcw className="size-4"/> : <Trash2 className="size-4"/>}{pending ? 'Procesando…' : confirmation?.type === 'reset' ? 'Sí, reiniciar' : 'Sí, eliminar'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
