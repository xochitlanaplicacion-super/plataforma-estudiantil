'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Dices, Play, Radio, Users } from 'lucide-react';
import { createClassroomSessionAction, openClassroomSessionAction } from '@/lib/actions/classroom-games';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function TeacherSessionManager({ initialData }: { initialData: any }) {
  const assignments = initialData.assignments || [];
  const banks = initialData.banks || [];
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id || '');
  const selectedAssignment = assignments.find((item: any) => item.id === assignmentId);
  const compatibleBanks = useMemo(() => banks.filter((bank: any) => bank.subject_id === selectedAssignment?.materia_id), [banks, selectedAssignment]);
  const [bankId, setBankId] = useState('');
  const [title, setTitle] = useState('Duelo de repaso');
  const [maxPlayers, setMaxPlayers] = useState(40);
  const [responseSeconds, setResponseSeconds] = useState(15);
  const [sessions, setSessions] = useState(initialData.sessions || []);
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
    <section><h2 className="mb-3 text-xl font-black">Sesiones recientes</h2><div className="grid gap-4 lg:grid-cols-2">{sessions.map((session: any) => <article key={session.id} className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase text-primary">{session.status}</span><h3 className="mt-3 text-lg font-black">{session.title}</h3><p className="mt-1 text-sm text-muted-foreground">Hasta {session.max_players} alumnos</p></div><Radio className={session.status === 'active' ? 'text-red-500' : 'text-muted-foreground'}/></div><div className="mt-4 flex gap-2">{session.status === 'draft' && <Button disabled={pending} onClick={() => open(session.id)}>Abrir sala</Button>}{session.status !== 'draft' && <Button asChild><Link href={`/dashboard/profesor/actividades-clase/${session.id}`}><Users className="size-4"/> Entrar como moderador</Link></Button>}</div></article>)}</div></section>
  </main>;
}
