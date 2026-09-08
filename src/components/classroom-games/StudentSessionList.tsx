'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DoorOpen, Gamepad2, Radio } from 'lucide-react';
import { joinClassroomSessionAction } from '@/lib/actions/classroom-games';
import { Button } from '@/components/ui/button';

export function StudentSessionList({ initialSessions }: { initialSessions: any[] }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  function enter(id: string) {
    startTransition(async () => {
      const result = await joinClassroomSessionAction(id);
      if (!result.ok) return setMessage(result.message);
      router.push(`/dashboard/alumno/actividades-clase/${id}`);
    });
  }
  return <main className="mx-auto max-w-6xl space-y-6 pb-16">
    <header className="rounded-3xl bg-gradient-to-br from-indigo-950 via-violet-800 to-fuchsia-600 p-7 text-white shadow-xl"><div className="flex items-center gap-3"><Gamepad2 className="size-10 text-cyan-200"/><div><p className="text-xs font-bold uppercase tracking-[.22em] text-violet-100">Práctica en vivo</p><h1 className="text-3xl font-black">Actividades en clase</h1></div></div><p className="mt-3 text-sm text-violet-100">Sólo aparecen las salas abiertas para tu grupo. Tu avance se conserva en la plataforma si recargas o cierras la ventana.</p></header>
    {message && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">{message}</p>}
    <div className="grid gap-4 md:grid-cols-2">{initialSessions.map((session) => <article key={session.id} className="relative overflow-hidden rounded-3xl border bg-card p-6 shadow-sm"><div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-fuchsia-500/10 blur-2xl"/><div className="relative"><span className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold uppercase text-red-600"><Radio className="size-3"/> {session.status === 'lobby' ? 'Sala abierta' : 'En juego'}</span><h2 className="mt-4 text-2xl font-black">{session.title}</h2><p className="mt-2 text-sm text-muted-foreground">{session.assignment?.materias?.nombre} · {session.assignment?.grupos?.nombre}</p><p className="mt-1 text-sm">{session.classroom_game_participants.length}/{session.max_players} participantes</p><Button className="mt-5 w-full" disabled={pending} onClick={() => enter(session.id)}><DoorOpen className="size-4"/> {session.joined ? 'Continuar mi partida' : 'Entrar a la actividad'}</Button></div></article>)}</div>
    {!initialSessions.length && <section className="rounded-3xl border-2 border-dashed p-12 text-center"><Gamepad2 className="mx-auto size-14 text-muted-foreground/30"/><h2 className="mt-4 text-xl font-bold">No hay actividades abiertas</h2><p className="mt-2 text-muted-foreground">Cuando tu profesor abra una sala para tu grupo aparecerá aquí.</p></section>}
  </main>;
}
