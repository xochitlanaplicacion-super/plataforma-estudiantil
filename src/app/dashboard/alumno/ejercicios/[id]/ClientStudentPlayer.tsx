'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActivityPreview } from '@/components/shared/ActivityPreview';
import { saveExerciseResult } from '@/lib/actions/alumno';
import { useToast } from '@/hooks/use-toast';
import confetti from 'canvas-confetti';

export default function ClientStudentPlayer({ exercise }: { exercise: any }) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  const handleComplete = async (score: number, total: number) => {
    if (hasProcessed) return;
    try {
      setHasProcessed(true);
      setSaving(true);
      const percentage = (score / total) * 100;
      
      const res = await saveExerciseResult(exercise.id, score, total, percentage);
      
      if (res.error) {
        toast({
          title: "Error al guardar",
          description: "No se pudo guardar la calificación. Intenta de nuevo.",
          variant: "destructive"
        });
        setHasProcessed(false);
      } else {
        setFinalScore(res.data.calificacion);
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        toast({
          title: "¡Actividad guardada!",
          description: `Promedio acumulado: ${res.data.calificacion.toFixed(1)}%`,
          variant: "default"
        });
      }
    } catch (e) {
      console.error(e);
      setHasProcessed(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 overflow-hidden flex flex-col">
      <ActivityPreview 
        exercise={exercise} 
        onClose={() => router.push('/dashboard/alumno/materias')} 
        onComplete={handleComplete}
      />
      {saving && (
        <div className="absolute inset-0 z-[200] bg-white/70 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center">
            <div className="h-10 w-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
            <p className="text-slate-700 font-bold tracking-widest uppercase">Guardando Progreso...</p>
          </div>
        </div>
      )}
    </div>
  );
}
