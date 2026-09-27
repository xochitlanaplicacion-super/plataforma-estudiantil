'use client';

import { useEffect, useMemo, useState } from 'react';
import { obtenerAccesoArchivoEntrega } from '@/lib/actions/entregas';
import { AccionesArchivoEntrega } from './AccionesArchivoEntrega';
import { readSubmissionPhotos } from '@/lib/storage/photo-gallery';

export function GaleriaEntrega({ photos }: { photos: unknown }) {
  const items = useMemo(() => readSubmissionPhotos(photos), [photos]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState(0);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all(items.map(async (item) => {
      const result = await obtenerAccesoArchivoEntrega(item.path, 'ver');
      return [item.path, 'url' in result && typeof result.url === 'string' ? result.url : ''] as const;
    })).then((entries) => { if (active) setUrls(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [items, refresh]);
  if (!items.length) return null;
  const current = items[Math.min(selected, items.length - 1)];
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-label="Galería de fotos de la entrega">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm">Fotos de la entrega · {items.length}</strong>
        <button type="button" className="text-xs font-semibold text-primary" onClick={() => setRefresh((value) => value + 1)}>Actualizar imágenes</button>
      </div>
      {urls[current.path] ? (
        <a href={urls[current.path]} target="_blank" rel="noopener noreferrer" aria-label={`Abrir foto ${selected + 1}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[current.path]} alt={`Foto ${selected + 1}: ${current.name}`} className="max-h-[65vh] w-full rounded-lg bg-slate-50 object-contain" />
        </a>
      ) : <p className="rounded-lg bg-slate-50 p-8 text-center text-sm text-slate-500">Cargando imagen…</p>}
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <button key={item.path} type="button" onClick={() => setSelected(index)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selected === index ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200'}`}>
            Foto {index + 1}
          </button>
        ))}
      </div>
      <AccionesArchivoEntrega archivoPath={current.path} archivoNombre={current.name} compact />
    </section>
  );
}
