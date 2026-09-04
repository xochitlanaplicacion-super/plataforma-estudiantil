'use client';

import { useInstitucion } from '@/hooks/use-institucion';

export default function FilterLoading() {
  const { config } = useInstitucion();
  return <div className="flex min-h-[55vh] items-center justify-center" role="status" aria-live="polite">
    <div className="flex flex-col items-center gap-4 rounded-3xl border bg-background/85 px-10 py-8 text-center shadow-xl backdrop-blur-xl">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-xl" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-primary/15 border-t-primary" />
        <img src={config.logo_url || '/images/logo_placeholder.svg'} alt="" className="h-16 w-16 rounded-full object-contain opacity-80 blur-[0.3px]" />
      </div>
      <div><p className="font-semibold text-foreground">Preparando Control de Filtro</p><p className="mt-1 text-sm text-muted-foreground">Cargando datos protegidos de {config.nombre_corto || 'la institución'}…</p></div>
    </div>
  </div>;
}
