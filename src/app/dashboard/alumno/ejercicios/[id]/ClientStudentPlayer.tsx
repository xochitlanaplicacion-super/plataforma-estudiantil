'use client';

import React, { useEffect, useState } from 'react';
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

  const handleComplete = async (score: number, total: number, detallesErrores?: any[]) => {
    if (hasProcessed) return leaderboard;
    try {
      setHasProcessed(true);
      setSaving(true);
      const percentage = (score / total) * 100;
      
      const res = await saveExerciseResult(exercise.id, score, total, percentage, detallesErrores);
      
      if (res.error) {
        toast({
          title: "Error al guardar",
          description: "No se pudo guardar la calificación. Intenta de nuevo.",
          variant: "destructive"
        });
        setHasProcessed(false);
        return leaderboard;
      } else if (res.isExpired) {
        toast({
          title: 'Ejercicio de práctica',
          description: res.message,
        });
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
