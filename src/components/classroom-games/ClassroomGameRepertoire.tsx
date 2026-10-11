'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Anchor, Gamepad2, Loader2, Play, Users, X, Sprout } from 'lucide-react';

const NavalBattleGame = dynamic(() => import('./naval/NavalBattleGame'), { ssr: false, loading: () => <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950 text-white" role="status"><div className="flex items-center gap-3"><Loader2 className="animate-spin"/> Preparando Batalla Naval…</div></div> });

export function ClassroomGameRepertoire() {
  const [game, setGame] = useState(false);
  const [quest, setQuest] = useState(false);
  const [squeak, setSqueak] = useState(false);
  const [bobby, setBobby] = useState(false);
  const questOpener = useRef<HTMLButtonElement>(null);
  const questFrame = useRef<HTMLIFrameElement>(null);
  const squeakOpener = useRef<HTMLButtonElement>(null);
  const squeakFrame = useRef<HTMLIFrameElement>(null);
  const bobbyOpener = useRef<HTMLButtonElement>(null);
  const bobbyFrame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!quest) return;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const opener = questOpener.current;
    const closeFromGame = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === questFrame.current?.contentWindow && event.data?.type === 'pvz-quest-close') setQuest(false);
    };
    window.addEventListener('message', closeFromGame);
    return () => { window.removeEventListener('message', closeFromGame); document.body.style.overflow = overflow; opener?.focus({ preventScroll: true }); };
  }, [quest]);
  useEffect(() => {
    if (!squeak) return;
    const overflow = document.body.style.overflow;
    const opener = squeakOpener.current;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, [squeak]);
  useEffect(() => {
    if (!bobby) return;
    const overflow = document.body.style.overflow;
    const opener = bobbyOpener.current;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, [bobby]);
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => { if (wasOpen.current && !game) opener.current?.focus({ preventScroll: true }); wasOpen.current = game; }, [game]);
  return <section className="rounded-3xl border bg-card p-6" aria-labelledby="classroom-repertoire-title">
    <div className="flex items-center gap-3"><Gamepad2 className="size-7 text-primary"/><div><h2 id="classroom-repertoire-title" className="text-xl font-black">Repertorio de juegos</h2><p className="text-sm text-muted-foreground">Actividades para dirigir desde la pantalla del profesor y compartir con todo el salón.</p></div></div>
    <article className="mt-5 overflow-hidden rounded-2xl border border-cyan-800 bg-[radial-gradient(ellipse_at_top_right,#155e75,transparent_65%),linear-gradient(120deg,#081923,#112d40)] p-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-6"><div className="flex max-w-2xl items-start gap-5"><Anchor className="mt-1 size-14 shrink-0 text-cyan-200"/><div><span className="text-xs font-bold uppercase tracking-widest text-cyan-200">Local · una sola pantalla · sin calificaciones</span><h3 className="mt-2 text-2xl font-black">Batalla Naval</h3><p className="mt-2 text-sm text-slate-200">Flotas secretas, islas, preguntas con IA o juego libre, poderes estratégicos y turnos independientes. No requiere que los alumnos se conecten.</p><p className="mt-3 flex items-center gap-2 text-xs text-cyan-100"><Users className="size-4"/> 2–10 equipos · mapas desde 10×10 · PC y tablet</p></div></div><button ref={opener} type="button" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-cyan-200 px-6 py-3 font-bold text-slate-950 hover:bg-cyan-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-cyan-300" onClick={() => setGame(true)}><Play className="size-5"/> Preparar Batalla Naval</button></div>
    </article>
    <article className="mt-5 rounded-2xl border-4 border-amber-800 bg-gradient-to-br from-lime-950 via-green-900 to-lime-700 p-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-6"><div className="flex max-w-2xl items-start gap-5"><Sprout className="mt-1 size-14 shrink-0 text-lime-200"/><div><span className="text-xs font-bold uppercase tracking-widest text-yellow-200">Una pantalla · recursos virtuales · sin calificaciones</span><h3 className="mt-2 text-2xl font-black">Plantas vs Zombies Quest</h3><p className="mt-2 text-sm text-lime-100">Duelo por equipos o todo el salón contra la computadora. Preguntas revisadas con IA, soles automáticos, horda progresiva y pausas tácticas con moneda de turno.</p><p className="mt-3 text-xs text-yellow-100">PC y tablet · sonido opcional · oleadas de 30 segundos a 10 minutos</p></div></div><button ref={questOpener} type="button" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-yellow-200 px-6 py-3 font-bold text-green-950 hover:bg-yellow-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-300" onClick={() => setQuest(true)}><Play className="size-5"/> Preparar Plantas vs Zombies Quest</button></div>
    </article>
    <article className="mt-5 overflow-hidden rounded-2xl border border-sky-900 bg-[radial-gradient(ellipse_at_top_right,#155e75,transparent_65%),linear-gradient(120deg,#07141e,#15334a)] p-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-6"><div className="flex max-w-2xl items-start gap-5"><Gamepad2 className="mt-1 size-14 shrink-0 text-sky-200"/><div><span className="text-xs font-bold uppercase tracking-widest text-sky-200">Integrado · artillería por turnos · una pantalla</span><h3 className="mt-2 text-2xl font-black">Animal Battle Ground</h3><p className="mt-2 text-sm text-slate-200">Batalla de artillería para dirigir en clase: mapas destructibles, cámara que sigue el proyectil, viento, agua, retroceso, clima y un arsenal visual con explicación de cada tiro.</p><p className="mt-3 flex items-center gap-2 text-xs text-sky-100"><Users className="size-4"/> 1 contra la computadora o dos equipos · PC y tablet · controles táctiles</p></div></div><button ref={squeakOpener} type="button" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-sky-200 px-6 py-3 font-bold text-slate-950 hover:bg-sky-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-300" onClick={() => setSqueak(true)}><Play className="size-5"/> Preparar Animal Battle Ground</button></div>
    </article>
    <article className="mt-5 overflow-hidden rounded-2xl border border-orange-800 bg-[radial-gradient(ellipse_at_top_right,#9a3412,transparent_65%),linear-gradient(120deg,#21130a,#3b2415)] p-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-6"><div className="flex max-w-2xl items-start gap-5"><Gamepad2 className="mt-1 size-14 shrink-0 text-orange-200"/><div><span className="text-xs font-bold uppercase tracking-widest text-orange-200">Puzzle · individual o para proyectar · una pantalla</span><h3 className="mt-2 text-2xl font-black">Bobby Carrot</h3><p className="mt-2 text-sm text-orange-50">Recoge todas las zanahorias o huevos, activa botones, consigue llaves y evita trampas. Incluye 30 niveles de zanahoria, 20 de Pascua y un modo procedural más exigente.</p><p className="mt-3 flex items-center gap-2 text-xs text-orange-100"><Users className="size-4"/> PC, iPad y celular · controles táctiles · pantalla completa</p></div></div><button ref={bobbyOpener} type="button" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-orange-200 px-6 py-3 font-bold text-orange-950 hover:bg-orange-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-orange-300" onClick={() => setBobby(true)}><Play className="size-5"/> Preparar Bobby Carrot</button></div>
    </article>
    {quest && <section className="fixed inset-0 z-[1000] bg-green-950" role="dialog" aria-modal="true" aria-label="Plantas vs Zombies Quest"><iframe ref={questFrame} title="Plantas vs Zombies Quest" src="/api/classroom/pvz-quest/play" className="h-[100dvh] w-full border-0" allow="fullscreen; autoplay"/><button autoFocus type="button" aria-label="Volver al repertorio de juegos" className="absolute bottom-2 right-2 flex min-h-10 items-center gap-1 rounded-lg border-2 border-amber-700 bg-yellow-100 px-3 py-2 text-xs font-bold text-green-950 shadow-lg" onClick={() => setQuest(false)}><X className="size-4"/> Volver al repertorio</button></section>}
    {squeak && <section className="fixed inset-0 z-[1000] bg-slate-950" role="dialog" aria-modal="true" aria-label="Animal Battle Ground"><iframe ref={squeakFrame} title="Animal Battle Ground" src="/api/classroom/squeak-and-destroy/play" className="h-[100dvh] w-full border-0" allow="fullscreen; autoplay; pointer-lock"/><button autoFocus type="button" aria-label="Volver al repertorio de juegos" className="absolute bottom-2 right-2 flex min-h-10 items-center gap-1 rounded-lg border-2 border-sky-700 bg-sky-100 px-3 py-2 text-xs font-bold text-slate-950 shadow-lg" onClick={() => setSqueak(false)}><X className="size-4"/> Volver al repertorio</button></section>}
    {bobby && <section className="fixed inset-0 z-[1000] bg-slate-950" role="dialog" aria-modal="true" aria-label="Bobby Carrot"><iframe ref={bobbyFrame} title="Bobby Carrot" src="/api/classroom/bobby-carrot/play" className="h-[100dvh] w-full border-0" allow="fullscreen; autoplay"/><button autoFocus type="button" aria-label="Volver al repertorio de juegos" className="absolute bottom-2 right-2 flex min-h-10 items-center gap-1 rounded-lg border-2 border-orange-700 bg-orange-100 px-3 py-2 text-xs font-bold text-orange-950 shadow-lg" onClick={() => setBobby(false)}><X className="size-4"/> Volver al repertorio</button></section>}
    {game && <NavalBattleGame onClose={() => setGame(false)}/>}
  </section>;
}
