'use client';

import Link from 'next/link';
import { AlertCircle, CheckCircle2, LoaderCircle, ShieldX } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { AcademicActionFailureStatus, AcademicPublicErrorDto } from '@/lib/academic/dto';
import { cn } from '@/lib/utils';

export function AcademicConfigurationHeader({ current }: { current: 'cycles' | 'schemes' }) {
  return (
    <header className="space-y-4">
      <div>
        <p className="text-sm font-medium text-primary">Evaluación institucional</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Configuración académica</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Define ciclos, periodos y reglas por asignación sin salir de la plataforma. Escala fija: 0 a 10.
        </p>
      </div>
      <nav aria-label="Secciones de configuración de evaluación" className="flex flex-wrap gap-2">
        <Button asChild variant={current === 'cycles' ? 'default' : 'outline'}>
          <Link href="/dashboard/admin/evaluacion/ciclos" aria-current={current === 'cycles' ? 'page' : undefined}>Ciclos y periodos</Link>
        </Button>
        <Button asChild variant={current === 'schemes' ? 'default' : 'outline'}>
          <Link href="/dashboard/admin/evaluacion/esquemas" aria-current={current === 'schemes' ? 'page' : undefined}>Esquemas y criterios</Link>
        </Button>
      </nav>
    </header>
  );
}

export function AcademicLoadingState({ label = 'Cargando configuración…' }: { label?: string }) {
  return (
    <section role="status" aria-live="polite" className="grid gap-4 md:grid-cols-2">
      <span className="sr-only">{label}</span>
      {[0, 1].map((item) => (
        <div key={item} className="min-h-56 animate-pulse rounded-xl border bg-card p-5">
          <div className="h-5 w-1/2 rounded bg-muted" />
          <div className="mt-6 h-10 rounded bg-muted" />
          <div className="mt-3 h-10 rounded bg-muted" />
          <div className="mt-3 h-10 rounded bg-muted" />
        </div>
      ))}
    </section>
  );
}

export function AcademicErrorState({
  status, error, onRetry,
}: {
  status: AcademicActionFailureStatus;
  error: AcademicPublicErrorDto;
  onRetry: () => void;
}) {
  const forbidden = status === 'forbidden' || status === 'unauthenticated';
  const Icon = forbidden ? ShieldX : AlertCircle;
  return (
    <Alert variant="destructive" role="alert">
      <Icon aria-hidden="true" />
      <AlertTitle>{forbidden ? 'Acceso no disponible' : status === 'disabled' ? 'Función aún no habilitada' : 'No se pudo cargar'}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{error.message}</p>
        <Button type="button" variant="outline" onClick={onRetry}>Reintentar</Button>
      </AlertDescription>
    </Alert>
  );
}

export function AcademicFeedback({
  state,
}: {
  state: null | { kind: 'saving' | 'success' | 'error' | 'conflict'; message: string };
}) {
  if (!state) return null;
  const isError = state.kind === 'error' || state.kind === 'conflict';
  return (
    <p
      role={isError ? 'alert' : 'status'}
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 rounded-md border p-3 text-sm font-medium',
        isError ? 'text-destructive' : 'text-primary',
      )}
    >
      {state.kind === 'saving' ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        : state.kind === 'success' ? <CheckCircle2 className="size-4" aria-hidden="true" />
          : <AlertCircle className="size-4" aria-hidden="true" />}
      {state.message}
    </p>
  );
}

export function AcademicConfirmDialog({
  open, title, description, confirmLabel = 'Confirmar cambio', destructive = false,
  onOpenChange, onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export const fieldClassName = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
