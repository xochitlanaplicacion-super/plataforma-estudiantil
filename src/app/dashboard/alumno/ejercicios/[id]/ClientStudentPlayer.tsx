'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ActivityPreview } from '@/components/shared/ActivityPreview';
import { saveExerciseResult } from '@/lib/actions/alumno';
import { useToast } from '@/hooks/use-toast';
import confetti from 'canvas-confetti';
import type { GameLeaderboard } from '@/lib/game-leaderboard';

interface EntregaExistente {
  archivo_nombre?: string | null;
  archivo_url?: string | null;
  archivo_path?: string | null;
  primer_envio_en?: string | null;
  caduca_el?: string | null;
  calificacion?: number | null;
}

export default function ClientStudentPlayer({ 
  exercise, 
  entregaExistente,
  initialLeaderboard,
}: { 
  exercise: any; 
  entregaExistente?: EntregaExistente | null;
  initialLeaderboard?: GameLeaderboard | null;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<GameLeaderboard | null>(initialLeaderboard || null);
  const flyingAttemptKey = useRef<string | null>(null);

  const handleComplete = async (score: number, total: number, detallesErrores?: any[]) => {
    if (hasProcessed) return leaderboard;
    try {
      setHasProcessed(true);
      setSaving(true);
      const percentage = (score / total) * 100;
      
      if (exercise.tipo === 'flying_cat') flyingAttemptKey.current ??= crypto.randomUUID();
      const res = exercise.tipo === 'flying_cat'
        ? await saveExerciseResult(exercise.id, score, total, percentage, detallesErrores, flyingAttemptKey.current!)
        : await saveExerciseResult(exercise.id, score, total, percentage, detallesErrores);
      
      if (res.error) {
        toast({
          title: "Error al guardar",
          description: "No se pudo guardar la calificación. Intenta de nuevo.",
          variant: "destructive"
        });
        setHasProcessed(false);
        // Flying Cat has an explicit save/retry screen. Returning null here
        // would incorrectly tell it that the grade was saved successfully.
        if (exercise.tipo === 'flying_cat') throw new Error(res.error);
        return leaderboard;
      } else if (res.isExpired) {
        toast({
          title: 'Ejercicio de práctica',
          description: res.message,
        });
        if (exercise.tipo === 'flying_cat') return {
          practice: true as const,
          message: res.message || 'Actividad vencida: el vuelo fue de práctica y no se guardó una calificación.',
        };
      } else if (res.isLocked && exercise.tipo === 'flying_cat') {
        const message = 'La actividad ya estaba completada y su calificación está bloqueada. Este vuelo es de práctica y no guardó un nuevo intento.';
        toast({ title: 'Calificación conservada', description: message });
        return { practice: true as const, message };
      } else if (res.data) {
        setFinalScore(res.data.calificacion);
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        router.refresh();
        toast({
          title: "¡Actividad guardada!",
          description: `Promedio acumulado: ${res.data.calificacion.toFixed(1)}/10`,
          variant: "default"
        });
      }
      const updatedLeaderboard = 'leaderboard' in res ? res.leaderboard : null;
      if (updatedLeaderboard) setLeaderboard(updatedLeaderboard);
      return updatedLeaderboard || leaderboard;
    } catch (e) {
      console.error(e);
      setHasProcessed(false);
      if (exercise.tipo === 'flying_cat') {
        throw e instanceof Error ? e : new Error('No se pudo guardar la calificación. Intenta de nuevo.');
      }
      return leaderboard;
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (hasProcessed) {
      router.refresh();
    }
    router.push('/dashboard/alumno/materias');
  };

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-slate-50 overflow-hidden flex flex-col">
      <ActivityPreview 
        exercise={exercise} 
        onClose={handleClose} 
        onComplete={handleComplete}
        entregaExistente={entregaExistente}
        gameLeaderboard={leaderboard}
      />
      {saving && (
        <div className="absolute inset-0 z-[200] bg-white/70 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center">
            <div className="h-10 w-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
            <p className="text-slate-700 font-bold tracking-widest uppercase">Guardando Progreso...</p>
          </div>
        </div>
      )}
    </div>, document.body
  );
}
