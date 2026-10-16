'use client';

import { useId, useState } from 'react';
import { BadgeCheck, Camera, ChevronDown, ChevronUp, IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function FilterIdentityEvidenceNotice({ identificationAttached, personPhotoAttached, onOmitDamagedIdentification }: {
  identificationAttached: boolean;
  personPhotoAttached: boolean;
  onOmitDamagedIdentification?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const detailsId = useId();

  return <section className="rounded-xl border border-primary/35 bg-primary/5 p-4 shadow-sm" aria-label="Requisitos de fotografías">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h3 className="font-semibold">Identificación opcional · foto de la persona obligatoria</h3>
          <p className="mt-1 text-sm text-muted-foreground">Si no trae credencial, continúa con la foto de su rostro.</p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((current) => !current)}>
        {expanded ? 'Ocultar detalles' : 'Ver detalles'}{expanded ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
      </Button>
    </div>
    {expanded && <div id={detailsId} className="mt-4 grid gap-2 sm:grid-cols-2" aria-live="polite">
      <div className="flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-2 text-sm"><IdCard className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Identificación: {identificationAttached ? 'adjuntada' : 'no adjuntada (opcional)'}</span></div>
      <div className="flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-2 text-sm"><Camera className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Foto de la persona: {personPhotoAttached ? 'lista' : 'pendiente (obligatoria)'}</span></div>
      {onOmitDamagedIdentification && <div className="sm:col-span-2"><p className="mb-2 text-sm text-destructive">No se recuperó la identificación del borrador.</p><Button type="button" variant="outline" size="sm" onClick={onOmitDamagedIdentification}>Continuar sin identificación</Button></div>}
    </div>}
  </section>;
}
