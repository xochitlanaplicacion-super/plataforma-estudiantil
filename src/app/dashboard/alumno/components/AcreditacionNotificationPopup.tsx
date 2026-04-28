'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function AcreditacionNotificationPopup() {
  const [open, setOpen] = useState(false);
  const [acreditacion, setAcreditacion] = useState<any>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    verificarAcreditacion();
  }, []);

  const verificarAcreditacion = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const userId = session.user.id;

      // Buscar perfil para curp
      const { data: perfil } = await supabase
        .from('profiles')
        .select('curp')
        .eq('id', userId)
        .single();

      let query = supabase
        .from('acreditaciones_alumnos')
        .select('*')
        .eq('visto_por_alumno', false);

      if (perfil?.curp) {
        query = query.or(`alumno_id.eq.${userId},curp.eq.${perfil.curp}`);
      } else {
        query = query.eq('alumno_id', userId);
      }

      const { data } = await query.maybeSingle();

      if (data) {
        setAcreditacion(data);
        setOpen(true);
      }
    } catch (e) {
      console.error("Error verificando notificación de acreditación", e);
    }
  };

  const handleIrAlDocumento = () => {
    setOpen(false);
    router.push('/dashboard/alumno/acreditacion');
  };

  if (!acreditacion) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md border-t-4 border-t-green-500">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
            <FileText className="h-6 w-6 text-green-600" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center text-xl">Dictamen Oficial Disponible</DialogTitle>
          <DialogDescription className="text-center pt-2">
            Control Escolar ha publicado tus resultados del proceso de acreditación de la SEP. 
            Tus datos ya están disponibles para consulta.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-4 text-center">
           <div className="bg-slate-50 p-4 rounded-lg border flex items-center gap-3">
             <CheckCircle2 className="text-green-500 h-5 w-5 shrink-0" />
             <div className="text-left">
               <p className="text-sm font-semibold text-slate-800">Estado: {acreditacion.estatus}</p>
               <p className="text-xs text-slate-500">Fecha de emisión: {acreditacion.fecha_expedicion}</p>
             </div>
           </div>
        </div>
        <DialogFooter className="sm:justify-center">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
          <Button type="button" className="bg-green-600 hover:bg-green-700" onClick={handleIrAlDocumento}>
            Ver Documento Oficial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
