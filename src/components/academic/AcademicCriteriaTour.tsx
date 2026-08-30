'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CircleHelp, PlayCircle, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const TOUR_STORAGE_KEY = 'academic-criteria-tour-seen-v1';

interface TourStep {
  target: string;
  title: string;
  description: string;
}

const STEPS: readonly TourStep[] = [
  {
    target: 'scope',
    title: '1. Elige dónde aplicarás la evaluación',
    description: 'Comienza seleccionando el ciclo, tu materia y grupo, y el periodo. Sólo verás las asignaciones que dirección te haya registrado.',
  },
  {
    target: 'draft',
    title: '2. Abre un borrador editable',
    description: 'Pulsa “Nuevo borrador” para comenzar desde cero. Si ya existe una versión activa, primero usa “Crear copia editable” para conservar el historial.',
  },
  {
    target: 'rules',
    title: '3. Ponle nombre a tu esquema',
    description: 'Usa un nombre fácil de reconocer, por ejemplo “Evaluación Primer Periodo”. Define la calificación aprobatoria y guarda las reglas.',
  },
  {
    target: 'new-criterion',
    title: '4. Agrega tus criterios',
    description: 'Escribe “Examen”, “Proyecto”, “Tareas” o cualquier criterio que necesites. Elige cómo se captura, asigna su porcentaje y pulsa Agregar.',
  },
  {
    target: 'distribution',
    title: '5. Comprueba los porcentajes',
    description: 'Todos los criterios activos deben sumar exactamente 100%. Si no suman 100%, usa “Redistribuir proporcionalmente” y después ajusta lo que necesites.',
  },
  {
    target: 'activation',
    title: '6. Activa la evaluación',
    description: 'Cuando todo sume 100%, el botón “Activar esquema” se habilitará. Al activarlo quedará listo para calcular las calificaciones en escala de 0 a 10.',
  },
];

interface TargetBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function AcademicCriteriaTour() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetBox, setTargetBox] = useState<TargetBox | null>(null);
  const currentStep = STEPS[stepIndex];

  const close = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch {
      // El recorrido sigue disponible aunque el navegador bloquee almacenamiento local.
    }
  }, []);

  const start = useCallback(() => {
    setStepIndex(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(TOUR_STORAGE_KEY) === 'true') return;
    } catch {
      // Sin persistencia local, se conserva el comportamiento de primera visita.
    }
    const timer = window.setTimeout(start, 700);
    return () => window.clearTimeout(timer);
  }, [start]);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const target = document.querySelector<HTMLElement>(`[data-criteria-tour="${currentStep.target}"]`);
      if (!target) {
        setTargetBox(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setTargetBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    }

    const target = document.querySelector<HTMLElement>(`[data-criteria-tour="${currentStep.target}"]`);
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    const positionTimer = window.setTimeout(updatePosition, 350);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.clearTimeout(positionTimer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [currentStep, open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') setStepIndex((value) => Math.min(value + 1, STEPS.length - 1));
      if (event.key === 'ArrowLeft') setStepIndex((value) => Math.max(value - 1, 0));
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close, open]);

  const bubbleStyle = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const width = Math.min(360, window.innerWidth - 32);
    if (!targetBox) {
      return { width, left: (window.innerWidth - width) / 2, top: Math.max(16, (window.innerHeight - 290) / 2) };
    }
    const left = clamp(targetBox.left + targetBox.width / 2 - width / 2, 16, window.innerWidth - width - 16);
    const roomBelow = window.innerHeight - (targetBox.top + targetBox.height);
    const top = roomBelow >= 310
      ? targetBox.top + targetBox.height + 16
      : Math.max(16, targetBox.top - 270);
    return { width, left, top };
  }, [targetBox]);

  return (
    <>
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">¿Es tu primera vez configurando criterios?</p>
            <p className="text-sm text-muted-foreground">Te acompañamos paso a paso. Puedes repetir esta ayuda en cualquier momento.</p>
          </div>
          <Button type="button" variant="outline" onClick={start}><PlayCircle />Iniciar recorrido guiado</Button>
        </CardContent>
      </Card>

      <Button
        type="button"
        className="fixed bottom-6 right-6 z-[70] rounded-full shadow-lg"
        onClick={start}
        aria-label="Abrir tutorial de criterios de evaluación"
      >
        <CircleHelp />Ayuda paso a paso
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[80] pointer-events-none" aria-live="polite">
          <div className="absolute inset-0 bg-foreground/20" />
          {targetBox ? (
            <div
              className="absolute rounded-lg border-2 border-primary bg-transparent ring-4 ring-background transition-all duration-200"
              style={{
                top: targetBox.top - 6,
                left: targetBox.left - 6,
                width: targetBox.width + 12,
                height: targetBox.height + 12,
              }}
            />
          ) : null}
          <section
            role="dialog"
            aria-modal="false"
            aria-labelledby="criteria-tour-title"
            aria-describedby="criteria-tour-description"
            className="pointer-events-auto fixed space-y-4 rounded-xl border bg-popover p-5 text-popover-foreground shadow-2xl"
            style={bubbleStyle}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-primary">PASO {stepIndex + 1} DE {STEPS.length}</p>
                <h2 id="criteria-tour-title" className="mt-1 text-lg font-semibold">{currentStep.title}</h2>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Cerrar tutorial"><X /></Button>
            </div>
            <p id="criteria-tour-description" className="text-sm leading-6 text-muted-foreground">{currentStep.description}</p>
            {!targetBox ? <p className="rounded-md bg-muted p-2 text-xs">Este control aparecerá cuando hayas completado los pasos anteriores.</p> : null}
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full bg-primary transition-all" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" disabled={stepIndex === 0} onClick={() => setStepIndex((value) => value - 1)}><ChevronLeft />Anterior</Button>
              {stepIndex === STEPS.length - 1 ? (
                <Button type="button" onClick={close}>Entendido</Button>
              ) : (
                <Button type="button" onClick={() => setStepIndex((value) => value + 1)}>Siguiente<ChevronRight /></Button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
