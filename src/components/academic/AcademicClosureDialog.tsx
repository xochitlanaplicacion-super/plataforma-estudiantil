'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  AcademicClosurePreview,
  AcademicSaveState,
} from '@/lib/academic-grading/mutation-contracts';

interface AcademicClosureDialogProps {
  open: boolean;
  mode: 'close' | 'reopen';
  preview: AcademicClosurePreview | null;
  state: AcademicSaveState;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}

export function AcademicClosureDialog({
  open,
  mode,
  preview,
  state,
  onOpenChange,
  onConfirm,
}: AcademicClosureDialogProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  const isClosing = mode === 'close';
  const isSaving = state.status === 'saving';
  const hasMissing = isClosing && (!preview || !preview.canClose);
  const reasonIsValid = reason.trim().length >= 3 && reason.trim().length <= 500;
  const disabled = isSaving || hasMissing || !reasonIsValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="academic-closure-description">
        <DialogHeader>
          <DialogTitle>
            {isClosing ? 'Cerrar calificaciones' : 'Reabrir calificaciones'}
          </DialogTitle>
          <DialogDescription id="academic-closure-description">
            {isClosing
              ? 'El cierre crea snapshots inmutables del resultado exacto y su desglose.'
              : 'La reapertura conserva el cierre anterior y crea una nueva versión histórica.'}
          </DialogDescription>
        </DialogHeader>

        {preview ? (
          <section className="rounded-md border bg-muted/40 p-3" aria-label="Resumen del cierre">
            <p className="text-sm font-medium">
              {preview.totalCount} matrícula{preview.totalCount === 1 ? '' : 's'} en el alcance
            </p>
            <p className="text-sm text-muted-foreground">
              {preview.missingCount === 0
                ? 'No hay calificaciones faltantes.'
                : `${preview.missingCount} matrícula${preview.missingCount === 1 ? '' : 's'} con datos pendientes.`}
            </p>
            {preview.missingCount > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
                {preview.students
                  .filter((student) => !student.complete)
                  .map((student) => (
                    <li key={student.enrollmentId}>
                      Registro pendiente: {student.warnings.map((warning) => warning.code).join(', ')}
                    </li>
                  ))}
              </ul>
            ) : null}
          </section>
        ) : (
          <p className="text-sm text-muted-foreground" role="status">
            Cargando resumen del alcance…
          </p>
        )}

        <label className="grid gap-2 text-sm font-medium" htmlFor="academic-closure-reason">
          Motivo obligatorio
          <textarea
            id="academic-closure-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={500}
            autoComplete="off"
            className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {state.status === 'conflict' || state.status === 'error' ? (
          <p role="alert" className="text-sm text-destructive">{state.message}</p>
        ) : null}
        {state.status === 'saved' ? (
          <p role="status" className="text-sm text-primary">Cambio guardado.</p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={isClosing ? 'destructive' : 'default'}
            disabled={disabled}
            onClick={() => onConfirm(reason.trim())}
          >
            {isSaving ? 'Guardando…' : isClosing ? 'Confirmar cierre' : 'Confirmar reapertura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
