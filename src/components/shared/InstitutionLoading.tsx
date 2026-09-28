'use client';

import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { useInstitucion } from '@/hooks/use-institucion';

type InstitutionLoadingProps = {
  title: string;
};

type InstitutionLoadingViewProps = InstitutionLoadingProps & {
  config: { logo_url?: string; siglas?: string; nombre_corto?: string };
  loading: boolean;
};

export function InstitutionLoadingView({ title, config, loading }: InstitutionLoadingViewProps) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const logoUrl = config.logo_url?.trim();
  const showLogo = !loading && Boolean(logoUrl)
    && logoUrl !== '/images/logo_placeholder.svg'
    && failedLogoUrl !== logoUrl;
  const initials = (config.siglas?.trim()
    || config.nombre_corto?.trim().split(/\s+/).map((word) => word[0]).join('')
    || 'E').slice(0, 3).toUpperCase();

  return (
    <div className="flex min-h-[55vh] items-center justify-center px-4" role="status" aria-live="polite">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border bg-background/90 px-6 py-8 text-center shadow-xl backdrop-blur-xl sm:px-10">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl motion-safe:animate-pulse" aria-hidden="true" />
          <div className="absolute inset-0 rounded-full border-2 border-primary/15 border-t-primary motion-safe:animate-spin" aria-hidden="true" />
          <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-background text-primary shadow-sm">
            {showLogo ? (
              <img
                src={logoUrl}
                alt=""
                className="h-full w-full object-contain"
                onError={() => setFailedLogoUrl(logoUrl || null)}
              />
            ) : loading ? (
              <GraduationCap className="h-8 w-8" aria-hidden="true" />
            ) : (
              <span className="text-lg font-bold tracking-wide" aria-hidden="true">{initials}</span>
            )}
          </div>
        </div>
        <div>
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cargando datos de {loading ? 'tu institución' : config.nombre_corto || 'tu institución'}…
          </p>
        </div>
      </div>
    </div>
  );
}

export function InstitutionLoading({ title }: InstitutionLoadingProps) {
  const { config, loading } = useInstitucion();
  return <InstitutionLoadingView title={title} config={config} loading={loading} />;
}
