'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { ArrowLeft, Crown, Dices, LoaderCircle, PlusCircle, Radio, RefreshCw, ShieldCheck, Swords, Trophy } from 'lucide-react';
import { advanceClassroomSessionAction, answerClassroomQuestionAction, finishClassroomSessionAction, foldClassroomMatchAction, loadClassroomGameStateAction, placeClassroomBetAction, stealClassroomMatchAction } from '@/lib/actions/classroom-games';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function personName(item: any) {
  const profile = Array.isArray(item?.profiles) ? item.profiles[0] : item?.profiles;
  return [profile?.nombre, profile?.apellidos].filter(Boolean).join(' ') || 'Alumno';
}

export function BetWinLoseRoom({ sessionId, initialState }: { sessionId: string; initialState: any }) {
  const [state, setState] = useState(initialState);
  const [message, setMessage] = useState('');
  const [bet, setBet] = useState(1);
  const [pending, startTransition] = useTransition();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [stealRemaining, setStealRemaining] = useState<number | null>(null);

  const refresh = useCallback(async (quiet = true) => {
    const result = await loadClassroomGameStateAction(sessionId);
    if (result.ok) setState(result.data);
    else if (!quiet) setMessage(result.message);
  }, [sessionId]);

  useEffect(() => {
    if (['finished', 'cancelled'].includes(state.session.status)) return;
    const timer = window.setInterval(() => void refresh(), 1500);
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); };
  }, [refresh, state.session.status]);

  useEffect(() => {
    if (!state.match?.answer_deadline || state.match.status !== 'answering') return setRemaining(null);
    const tick = () => setRemaining(Math.max(0, Math.ceil((new Date(state.match.answer_deadline).getTime() - Date.now()) / 1000)));
    tick(); const timer = window.setInterval(tick, 250); return () => window.clearInterval(timer);
  }, [state.match?.answer_deadline, state.match?.status]);

  useEffect(() => {
    if (!state.match?.steal_deadline || state.match.status !== 'steal') return setStealRemaining(null);
    const tick = () => setStealRemaining(Math.max(0, Math.ceil((new Date(state.match.steal_deadline).getTime() - Date.now()) / 1000)));
    tick(); const timer = window.setInterval(tick, 250); return () => window.clearInterval(timer);
  }, [state.match?.steal_deadline, state.match?.status]);

  const matchPlayers = useMemo(() => {
    const byId = new Map((state.participants || []).map((item: any) => [item.id, item]));
    return { challenger: byId.get(state.match?.challenger_id), opponent: byId.get(state.match?.opponent_id) } as any;
  }, [state.match, state.participants]);
  const ownId = state.ownParticipant?.id;
  const isDuelist = ownId && [state.match?.challenger_id, state.match?.opponent_id].includes(ownId);
  const ownBet = ownId === state.match?.challenger_id ? state.match?.challenger_bet : state.match?.opponent_bet;
  const ownAnswered = ownId === state.match?.challenger_id ? state.match?.challenger_answered_at : state.match?.opponent_answered_at;
  const activitiesHref = state.viewerRole === 'profesor'
    ? '/dashboard/profesor/actividades-clase'
    : '/dashboard/alumno/actividades-clase';

  function mutate(operation: () => Promise<any>) {
    setMessage('');
    startTransition(async () => { const result = await operation(); if (!result.ok) setMessage(result.message); await refresh(false); });
  }

  function finishSession() {
    setMessage('');
    startTransition(async () => {
      const result = await finishClassroomSessionAction(sessionId);
      if (!result.ok) return setMessage(result.message);
      setState((current: any) => ({ ...current, session: { ...current.session, status: 'finished' } }));
    });
  }

  return <main className="mx-auto min-h-[75vh] max-w-7xl space-y-5 pb-16">
    <header className="relative overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_20%_0%,#22d3ee55,transparent_30%),linear-gradient(135deg,#020617,#172554_50%,#4c1d95)] p-6 text-white shadow-2xl">
      <div className="absolute right-6 top-5 flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-3 py-1 text-xs font-bold uppercase backdrop-blur"><Radio className="size-3 text-red-400"/>{state.session.status}</div>
      <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200">Bet Win Lose · Ronda {state.session.current_round}</p><h1 className="mt-1 pr-28 text-3xl font-black">{state.session.title}</h1>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-200"><span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-300"/> Progreso protegido en servidor</span><span>·</span><span>Puedes recargar y continuar</span></div>
    </header>
    {message && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">{message}</div>}
    {state.viewerRole === 'profesor' && <section className="flex flex-wrap gap-3 rounded-2xl border bg-card p-4">
      {state.session.status === 'lobby' && <Button disabled={pending || state.participants.length < 2} onClick={() => mutate(() => advanceClassroomSessionAction(sessionId))}><Swords className="size-4"/> Iniciar primer duelo</Button>}
      {state.session.status === 'active' && ['resolved', 'cancelled'].includes(state.match?.status) && <Button disabled={pending} onClick={() => mutate(() => advanceClassroomSessionAction(sessionId))}><Dices className="size-4"/> Siguiente duelo</Button>}
      {['lobby','active'].includes(state.session.status) && <Button variant="outline" disabled={pending} onClick={finishSession}>{pending && <LoaderCircle className="size-4 animate-spin" />} Finalizar partida</Button>}
      {!['finished', 'cancelled'].includes(state.session.status) && <Button variant="ghost" onClick={() => void refresh(false)}><RefreshCw className="size-4"/> Actualizar</Button>}
      <Button asChild variant={['finished', 'cancelled'].includes(state.session.status) ? 'default' : 'ghost'}><Link href="/dashboard/profesor/actividades-clase"><ArrowLeft className="size-4"/> Volver a actividades</Link></Button>
    </section>}
    {state.viewerRole === 'alumno' && !['finished', 'cancelled'].includes(state.session.status) && <section className="flex rounded-2xl border bg-card p-4"><Button asChild variant="ghost"><Link href={activitiesHref}><ArrowLeft className="size-4"/> Volver a mis actividades</Link></Button></section>}
    {['finished', 'cancelled'].includes(state.session.status) && <section className="rounded-3xl border border-emerald-300 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/30"><h2 className="text-xl font-black text-emerald-950 dark:text-emerald-100">Partida finalizada</h2><p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">La actualización automática se detuvo. Puedes revisar la clasificación con calma y regresar cuando quieras.</p><div className="mt-4 flex flex-wrap gap-2"><Button asChild><Link href={activitiesHref}><ArrowLeft className="size-4"/> {state.viewerRole === 'profesor' ? 'Volver a actividades' : 'Volver a mis actividades'}</Link></Button>{state.viewerRole === 'profesor' && <Button asChild variant="outline"><Link href={activitiesHref}><PlusCircle className="size-4"/> Crear otra actividad</Link></Button>}</div></section>}
    {state.session.status === 'lobby' && <section className="rounded-3xl border-2 border-dashed bg-card p-10 text-center"><LoaderCircle className="mx-auto size-12 animate-spin text-primary"/><h2 className="mt-4 text-2xl font-black">Sala de espera</h2><p className="mt-2 text-muted-foreground">{state.participants.length} participantes conectados. El profesor iniciará cuando el grupo esté listo.</p></section>}
    {state.match && state.session.status === 'active' && <section className="grid gap-5 lg:grid-cols-[1fr_1.35fr_1fr]">
      {[matchPlayers.challenger, matchPlayers.opponent].map((player: any, index: number) => <article key={player?.id || index} className={`rounded-3xl border-2 p-5 text-center shadow-sm ${player?.id === ownId ? 'border-cyan-400 bg-cyan-500/5' : 'bg-card'} ${index === 1 ? 'lg:order-3' : ''}`}><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 text-2xl font-black text-white">{personName(player).slice(0, 1)}</div><h3 className="mt-3 font-black">{personName(player)}</h3><p className="mt-1 text-3xl font-black text-primary">{player?.points ?? 0}</p><p className="text-xs uppercase tracking-wider text-muted-foreground">monedas</p>{player?.is_king && <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-700"><Crown className="size-4"/> Rey actual</span>}</article>)}
      <article className="rounded-3xl border bg-card p-6 shadow-xl lg:order-2">
        {state.match.status === 'betting' && <><p className="text-center text-xs font-bold uppercase tracking-[.2em] text-primary">Apuestas</p><h2 className="mt-2 text-center text-xl font-black">Ambos eligen sus monedas</h2>{isDuelist ? <div className="mx-auto mt-5 max-w-xs"><Input type="number" min={1} max={state.ownParticipant.points} value={bet} onChange={(event) => setBet(Number(event.target.value))}/><Button className="mt-3 w-full" disabled={pending || Boolean(ownBet)} onClick={() => mutate(() => placeClassroomBetAction(state.match.id, bet))}>{ownBet ? `Apuesta registrada: ${ownBet}` : 'Confirmar apuesta'}</Button><Button className="mt-2 w-full" variant="ghost" disabled={pending} onClick={() => mutate(() => foldClassroomMatchAction(state.match.id))}>Retirarme y abrir robo</Button></div> : <p className="mt-5 text-center text-muted-foreground">Observa el duelo mientras ambos jugadores apuestan.</p>}</>}
        {state.match.status === 'steal' && <div className="text-center"><Dices className="mx-auto size-14 text-fuchsia-500"/><p className="mt-3 text-xs font-bold uppercase tracking-[.2em] text-fuchsia-700">Oportunidad de robo</p><h2 className="mt-2 text-2xl font-black">Un jugador dejó el duelo</h2><p className="mt-2 text-4xl font-black text-destructive">{stealRemaining ?? '—'}s</p>{state.ownParticipant && !isDuelist && !state.ownParticipant.eliminated && !state.ownParticipant.has_played_round ? <Button className="mt-5 w-full bg-fuchsia-600 hover:bg-fuchsia-700" disabled={pending || stealRemaining === 0} onClick={() => mutate(() => stealClassroomMatchAction(state.match.id))}>Robar el duelo</Button> : <p className="mt-4 text-sm text-muted-foreground">Esperando a un participante disponible…</p>}</div>}
        {state.match.status === 'answering' && <><div className="flex items-center justify-between"><span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-700">En juego: {state.match.stake} monedas</span><span className="text-2xl font-black text-destructive">{remaining ?? '—'}s</span></div><h2 className="mt-5 text-xl font-black leading-snug">{state.question?.prompt}</h2>{isDuelist && !ownAnswered ? <div className="mt-5 grid gap-3">{(state.question?.options || []).map((option: string, index: number) => <Button key={index} variant="outline" className="h-auto min-h-12 justify-start whitespace-normal text-left" disabled={pending || remaining === 0} onClick={() => mutate(() => answerClassroomQuestionAction(state.match.id, index))}><span className="mr-2 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 font-black text-primary">{String.fromCharCode(65 + index)}</span>{option}</Button>)}</div> : <p className="mt-6 rounded-xl bg-muted p-4 text-center text-muted-foreground">{ownAnswered ? 'Respuesta protegida. Esperando al rival…' : 'Duelo en curso. Observa el marcador.'}</p>}</>}
        {state.match.status === 'resolved' && <div className="text-center"><Trophy className="mx-auto size-14 text-amber-500"/><p className="mt-3 text-xs font-bold uppercase tracking-[.2em] text-primary">Resultado</p><h2 className="mt-2 text-2xl font-black">{state.match.winner_id ? `${personName(state.participants.find((item: any) => item.id === state.match.winner_id))} gana el duelo` : 'Ninguno acertó'}</h2>{state.question?.correctIndex !== undefined && <p className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-800">Respuesta correcta: {state.question.options[state.question.correctIndex]}</p>}<p className="mt-3 text-sm text-muted-foreground">Esperando el siguiente duelo.</p></div>}
        {state.match.status === 'cancelled' && <div className="text-center"><Dices className="mx-auto size-14 text-muted-foreground"/><h2 className="mt-3 text-2xl font-black">Duelo cerrado</h2><p className="mt-2 text-muted-foreground">{state.match.result_summary}</p></div>}
      </article>
    </section>}
    <section className="rounded-3xl border bg-card p-5"><h2 className="flex items-center gap-2 text-lg font-black"><Trophy className="size-5 text-amber-500"/> Clasificación en vivo</h2><div className="mt-4 grid gap-2">{state.participants.map((participant: any, index: number) => <div key={participant.id} className={`grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-xl border px-4 py-3 ${participant.id === ownId ? 'border-cyan-400 bg-cyan-500/5' : ''}`}><span className="text-center text-lg font-black text-muted-foreground">{index + 1}</span><div><p className="font-bold">{personName(participant)}</p><p className="text-xs text-muted-foreground">Racha {participant.momentum}{participant.eliminated ? ' · Eliminado' : ''}</p></div><strong className="text-xl text-primary">{participant.points}</strong></div>)}</div></section>
  </main>;
}
