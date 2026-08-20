'use client';

import { useState } from 'react';
import { Download, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { obtenerAccesoArchivoEntrega } from '@/lib/actions/entregas';

interface Props {
  archivoPath: string;
  archivoNombre: string;
  compact?: boolean;
}

export function AccionesArchivoEntrega({ archivoPath, archivoNombre, compact = false }: Props) {
  const { toast } = useToast();
  const [cargando, setCargando] = useState<'ver' | 'descargar' | null>(null);

  const abrir = async (modo: 'ver' | 'descargar') => {
    const ventana = modo === 'ver' ? window.open('', '_blank') : null;
    setCargando(modo);
    const resultado = await obtenerAccesoArchivoEntrega(archivoPath, modo);
    setCargando(null);

    if (!resultado.success || !resultado.url) {
      ventana?.close();
      toast({
        variant: 'destructive',
        title: 'Archivo no disponible',
        description: resultado.error || 'No se pudo generar el acceso.',
      });
      return;
    }

    if (modo === 'ver') {
      if (ventana) {
        ventana.opener = null;
        ventana.location.href = resultado.url;
      } else {
        window.open(resultado.url, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    const link = document.createElement('a');
    link.href = resultado.url;
    link.download = resultado.nombre || archivoNombre;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={compact ? 'h-8 gap-1 px-2 text-xs' : 'gap-1.5'}
        disabled={cargando !== null}
        onClick={() => abrir('ver')}
      >
        {cargando === 'ver' ? <Loader2 className="animate-spin" /> : <Eye />}
        Ver
      </Button>
      <Button
        type="button"
        size="sm"
        className={compact ? 'h-8 gap-1 px-2 text-xs' : 'gap-1.5'}
        disabled={cargando !== null}
        onClick={() => abrir('descargar')}
      >
        {cargando === 'descargar' ? <Loader2 className="animate-spin" /> : <Download />}
        Descargar
      </Button>
    </div>
  );
}
