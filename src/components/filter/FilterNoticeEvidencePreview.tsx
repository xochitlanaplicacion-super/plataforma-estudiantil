'use client';
/* eslint-disable @next/next/no-img-element -- Protected signed and local blob URLs need direct display and zoom. */

import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, ZoomIn, ZoomOut } from 'lucide-react';
import { getFilterPreRegistration } from '@/lib/actions/filter-preregistrations';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Props = { url: string; title?: string; orderId?: string; mimeType?: string };

export function FilterNoticeEvidencePreview({ url, title = 'Aviso recibido', orderId, mimeType }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(url);
  const [thumbnailUrl, setThumbnailUrl] = useState(url);
  const [zoom, setZoom] = useState(1);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const isPdf = mimeType === 'application/pdf' || decodeURIComponent(url.split('?')[0]).toLowerCase().endsWith('.pdf');

  useEffect(() => {
    let active = true;
    setThumbnailUrl(url);
    setThumbnailFailed(false);
    if (orderId) {
      void getFilterPreRegistration(orderId).then((result) => {
        if (active && result.success && result.order?.evidenceUrl) {
          setThumbnailUrl(result.order.evidenceUrl);
          setThumbnailFailed(false);
        }
      });
    }
    return () => { active = false; };
  }, [orderId, url]);

  const openPreview = async () => {
    setLoading(true);
    try {
      if (orderId) {
        const result = await getFilterPreRegistration(orderId);
        if (!result.success || !result.order?.evidenceUrl) throw new Error(result.error || 'No se pudo renovar el acceso al aviso.');
        setPreviewUrl(result.order.evidenceUrl);
        setThumbnailUrl(result.order.evidenceUrl);
        setThumbnailFailed(false);
      } else setPreviewUrl(url);
      setZoom(1);
      setOpen(true);
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo abrir la evidencia', description: error instanceof Error ? error.message : 'Intenta de nuevo.' });
    } finally { setLoading(false); }
  };

  return <>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
      <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-amber-200 bg-white">
        {!isPdf && !thumbnailFailed
          ? <img src={thumbnailUrl} alt={`Miniatura de ${title.toLowerCase()}`} className="h-full w-full object-cover" onError={() => setThumbnailFailed(true)} />
          : isPdf ? <FileText className="h-8 w-8 text-amber-800" aria-hidden="true" /> : <ImageIcon className="h-8 w-8 text-amber-800" aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="text-xs">{orderId ? 'Archivo ya guardado en el preregistro. No necesitas volver a subirlo.' : 'Archivo seleccionado para este registro.'}</p></div>
      <Button type="button" variant="outline" className="border-amber-400 bg-white text-amber-950 hover:bg-amber-100" disabled={loading} onClick={() => void openPreview()}>
        <ZoomIn className="mr-2 h-4 w-4" />{loading ? 'Abriendo…' : 'Ver y ampliar'}
      </Button>
    </div>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[94dvh] w-[min(96vw,1100px)] max-w-none flex-col overflow-hidden p-3 sm:p-5">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Vista protegida del archivo recibido. Comprueba su contenido antes de confirmar la autorización o salida.</DialogDescription></DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {isPdf ? <span className="text-sm text-muted-foreground">PDF · usa los controles del visor para acercar.</span> : <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="Alejar imagen" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - .25))}><ZoomOut className="h-4 w-4" /></Button>
            <span className="w-14 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
            <Button type="button" variant="outline" size="icon" aria-label="Acercar imagen" disabled={zoom >= 4} onClick={() => setZoom((value) => Math.min(4, value + .25))}><ZoomIn className="h-4 w-4" /></Button>
          </div>}
          <Button asChild type="button" variant="outline" size="sm"><a href={previewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir en otra pestaña</a></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-slate-100 text-center">
          {isPdf
            ? <iframe title={title} src={previewUrl} className="h-[68dvh] w-full bg-white" />
            : <img src={previewUrl} alt={title} className="inline-block h-auto max-w-none" style={{ width: `${zoom * 100}%` }} />}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
