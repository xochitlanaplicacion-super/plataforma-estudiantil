'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { generarDictamenPDF } from '@/lib/utils/pdfGenerator';
import { useToast } from '@/hooks/use-toast';

export default function AcreditacionAlumnoPage() {
  const supabase = createClient();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [acreditacion, setAcreditacion] = useState<any>(null);
  const [mensajeOficial, setMensajeOficial] = useState<string>('');

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const userId = session.user.id;

      // Buscar el perfil para obtener el CURP
      const { data: perfil } = await supabase
        .from('profiles')
        .select('curp')
        .eq('id', userId)
        .single();

      // Buscar acreditacion por ID de usuario o CURP
      let query = supabase.from('acreditaciones_alumnos').select('*');
      
      if (perfil?.curp) {
        query = query.or(`alumno_id.eq.${userId},curp.eq.${perfil.curp}`);
      } else {
        query = query.eq('alumno_id', userId);
      }

      const { data: acreditacionData, error } = await query.maybeSingle();

      if (acreditacionData) {
        setAcreditacion(acreditacionData);
        
        // Marcar como visto automáticamente
        if (!acreditacionData.visto_por_alumno) {
          await supabase.from('acreditaciones_alumnos').update({ visto_por_alumno: true }).eq('id', acreditacionData.id);
        }

        // Obtener el mensaje correspondiente
        const tipoMensaje = acreditacionData.estatus === 'Aprobado' ? 'APROBADO' : 'NO_APROBADO';
        const { data: msgData } = await supabase
          .from('mensajes_acreditacion')
          .select('contenido')
          .eq('tipo', tipoMensaje)
          .single();
          
        if (msgData) {
          setMensajeOficial(msgData.contenido);
        } else {
          setMensajeOficial(
            acreditacionData.estatus === 'Aprobado' 
              ? '¡Felicidades! Has acreditado exitosamente. Descarga tu comprobante oficial.' 
              : 'Estimado alumno, le informamos que en esta ocasión no alcanzó el puntaje requerido.'
          );
        }
      }
    } catch (e) {
      console.error("Error cargando acreditación", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDescargar = async () => {
    if (!acreditacion) return;
    toast({
      title: "Generando Documento...",
      description: "Tu dictamen oficial se descargará en unos segundos.",
    });
    await generarDictamenPDF(acreditacion);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-6 flex items-center gap-3">
        <FileText className="text-primary h-8 w-8" />
        Documento de Acreditación
      </h1>

      {!acreditacion ? (
        <Card className="border-slate-200 bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="h-16 w-16 text-slate-300 mb-4" />
            <h2 className="text-xl font-bold text-slate-700 mb-2">No hay documentos disponibles</h2>
            <p className="text-slate-500 max-w-md">
              Actualmente no tienes ningún dictamen de acreditación cargado en el sistema. 
              Recibirás una notificación en cuanto Control Escolar publique tus resultados.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className={`border-t-4 shadow-md ${acreditacion.estatus === 'Aprobado' ? 'border-t-green-500' : 'border-t-red-500'}`}>
          <CardHeader className="bg-white pb-4 border-b">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl font-bold mb-1">Resultados de Evaluación</CardTitle>
                <CardDescription className="text-sm">
                  Fecha de expedición: {acreditacion.fecha_expedicion || 'Reciente'}
                </CardDescription>
              </div>
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm ${
                acreditacion.estatus === 'Aprobado' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {acreditacion.estatus === 'Aprobado' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                {acreditacion.estatus.toUpperCase()}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-8 pb-8 px-8">
            <div className="prose prose-slate max-w-none mb-8">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Mensaje de Control Escolar:</h3>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-6 text-slate-700 whitespace-pre-wrap">
                {mensajeOficial}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-6 rounded-lg border border-slate-100 mt-8">
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Nombre</p>
                <p className="text-sm font-medium text-slate-900">{acreditacion.nombres} {acreditacion.primer_apellido} {acreditacion.segundo_apellido}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">CURP</p>
                <p className="text-sm font-medium text-slate-900">{acreditacion.curp}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Nivel</p>
                <p className="text-sm font-medium text-slate-900">{acreditacion.nivel}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Calificación Numérica</p>
                <p className="text-sm font-medium text-slate-900">{acreditacion.calificacion_numerica}</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-slate-50 border-t px-8 py-6 flex justify-end">
            <Button 
              size="lg" 
              onClick={handleDescargar}
              className={`font-bold px-8 shadow-sm ${
                acreditacion.estatus === 'Aprobado' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-primary hover:bg-primary/90 text-white'
              }`}
            >
              <Download className="mr-2 h-5 w-5" />
              Descargar Dictamen Oficial
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
