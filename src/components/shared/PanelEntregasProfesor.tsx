'use client';

import React, { useState, useTransition, useEffect } from 'react';
import {
  Download, Clock, CheckCircle2, AlertTriangle, Loader2,
  Users, FileText, ChevronDown, ChevronUp, Star, BookOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { calificarEntregaDescriptiva, getEntregasDeEjercicio } from '@/lib/actions/entregas';
import { useToast } from '@/hooks/use-toast';

interface Entrega {
  alumno_id: string;
  archivo_url: string;
  archivo_nombre: string;
  archivo_path: string;
  primer_envio_en: string;
  caduca_el: string;
  calificacion_manual: number | null;
  estado: string;
  profiles: {
    nombre: string;
    apellidos: string;
    email: string;
  } | null;
}

interface EjercicioDescriptivo {
  id: string;
  titulo: string;
  fecha_entrega: string | null;
}

interface Props {
  ejercicios: EjercicioDescriptivo[];
  materiaId: string;
  materiaNombre: string;
}

function getDiasRestantes(caduca_el: string) {
  const ahora = Date.now();
  const caduca = new Date(caduca_el).getTime();
  const totalMs = 10 * 24 * 60 * 60 * 1000;
  const restanteMs = Math.max(0, caduca - ahora);
  const dias = Math.floor(restanteMs / (1000 * 60 * 60 * 24));
  const horas = Math.floor((restanteMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const pct = Math.min(100, (restanteMs / totalMs) * 100);
  const vencido = restanteMs <= 0;
  return { dias, horas, pct, vencido };
}

function EntregaRow({ 
  entrega, 
  ejercicioId, 
  onCalificado 
}: { 
  entrega: Entrega; 
  ejercicioId: string;
  onCalificado: (alumnoId: string, cal: number) => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [calInput, setCalInput] = useState(
    entrega.calificacion_manual !== null ? String(entrega.calificacion_manual) : ''
  );
  const { dias, horas, pct, vencido } = getDiasRestantes(entrega.caduca_el);
  const nombreCompleto = entrega.profiles 
    ? `${entrega.profiles.nombre} ${entrega.profiles.apellidos}` 
    : entrega.alumno_id.substring(0, 8) + '...';

  const handleCalificar = () => {
    const cal = parseFloat(calInput);
    if (isNaN(cal) || cal < 0 || cal > 10) {
      toast({ title: 'Calificación inválida', description: 'Ingresa un número entre 0 y 10', variant: 'destructive' });
      return;
    }
    startTransition(async () => {
      const res = await calificarEntregaDescriptiva(entrega.alumno_id, ejercicioId, cal);
      if (res.error) {
        toast({ title: 'Error', description: res.error, variant: 'destructive' });
      } else {
        toast({ title: '✅ Calificación guardada', description: `${nombreCompleto}: ${cal}/10` });
        onCalificado(entrega.alumno_id, cal);
      }
    });
  };

  return (
    <div className={cn(
      'bg-white border rounded-2xl p-5 space-y-4 transition-all',
      entrega.calificacion_manual !== null
        ? 'border-emerald-200 bg-emerald-50/30'
        : vencido
        ? 'border-red-200 bg-red-50/20 opacity-70'
        : 'border-slate-200 hover:border-primary/30 hover:shadow-md'
    )}>
      {/* Header alumno */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-sm shrink-0">
            {(entrega.profiles?.nombre?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <p className="font-black text-slate-800 text-sm">{nombreCompleto}</p>
            <p className="text-[11px] text-slate-400">{entrega.profiles?.email}</p>
          </div>
        </div>
        {entrega.calificacion_manual !== null && (
          <div className="shrink-0 flex items-center gap-1 bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl font-black text-sm">
            <Star className="w-3 h-3" />
            {entrega.calificacion_manual}/10
          </div>
        )}
      </div>

      {/* Archivo */}
      {!vencido && entrega.archivo_url ? (
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
          <FileText className="w-5 h-5 text-blue-500 shrink-0" />
          <span className="text-sm font-bold text-slate-700 truncate flex-1">{entrega.archivo_nombre}</span>
          <a
            href={entrega.archivo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[10px] font-black uppercase rounded-lg hover:bg-blue-700 transition-all"
          >
            <Download className="w-3 h-3" />
            Descargar
          </a>
        </div>
      ) : null}

      {/* Barra de caducidad */}
      {!vencido ? (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] font-black uppercase">
            <span className="text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Se elimina en
            </span>
            <span className={cn(
              pct > 40 ? 'text-emerald-600' : pct > 20 ? 'text-amber-600' : 'text-red-600'
            )}>
              {dias}d {horas}h
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                pct > 40 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-red-500 text-xs font-black">
          <AlertTriangle className="w-4 h-4" />
          Archivo caducado — ya fue eliminado del almacenamiento
        </div>
      )}

      {/* Calificar */}
      {entrega.calificacion_manual === null && !vencido && (
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
          <label className="text-[11px] font-black uppercase text-slate-500 shrink-0">Calificación (0–10)</label>
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={calInput}
            onChange={(e) => setCalInput(e.target.value)}
            className="flex-1 h-10 px-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            placeholder="8.5"
          />
          <button
            onClick={handleCalificar}
            disabled={isPending || !calInput}
            className={cn(
              'h-10 px-5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-2',
              calInput && !isPending
                ? 'bg-primary text-white hover:opacity-90 shadow-md'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  );
}

export function PanelEntregasProfesor({ ejercicios, materiaNombre }: Props) {
  const [ejercicioActivo, setEjercicioActivo] = useState<string | null>(null);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [cargando, setCargando] = useState(false);

  const cargarEntregas = async (ejercicioId: string) => {
    if (ejercicioActivo === ejercicioId) {
      setEjercicioActivo(null);
      return;
    }
    setCargando(true);
    setEjercicioActivo(ejercicioId);
    const res = await getEntregasDeEjercicio(ejercicioId);
    setEntregas((res.data as any) || []);
    setCargando(false);
  };

  const handleCalificado = (alumnoId: string, cal: number) => {
    setEntregas(prev =>
      prev.map(e => e.alumno_id === alumnoId ? { ...e, calificacion_manual: cal } : e)
    );
  };

  if (ejercicios.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/10 rounded-xl">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">
            Entregas de Actividades Descriptivas
          </h3>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{materiaNombre}</p>
        </div>
      </div>

      {ejercicios.map((ej) => {
        const activo = ejercicioActivo === ej.id;
        const entregasDelEj = activo ? entregas : [];
        const calificadas = entregasDelEj.filter(e => e.calificacion_manual !== null).length;

        return (
          <div key={ej.id} className="border border-slate-200 rounded-2xl overflow-hidden">
            {/* Cabecera del ejercicio */}
            <button
              onClick={() => cargarEntregas(ej.id)}
              className="w-full flex items-center justify-between p-5 bg-white hover:bg-slate-50 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="font-black text-slate-800 uppercase tracking-wide text-sm">{ej.titulo}</p>
                  {ej.fecha_entrega && (
                    <p className="text-[11px] text-slate-400 font-semibold">
                      Límite: {new Date(ej.fecha_entrega).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {activo && entregasDelEj.length > 0 && (
                  <span className="text-[10px] font-black bg-primary/10 text-primary px-3 py-1 rounded-full uppercase">
                    {calificadas}/{entregasDelEj.length} calificados
                  </span>
                )}
                {activo ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </button>

            {/* Lista de entregas */}
            {activo && (
              <div className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-4">
                {cargando ? (
                  <div className="flex items-center justify-center py-8 gap-3 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-bold uppercase">Cargando entregas...</span>
                  </div>
                ) : entregas.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Users className="w-10 h-10 mx-auto opacity-20 mb-3" />
                    <p className="text-sm font-bold uppercase">Ningún alumno ha entregado aún</p>
                  </div>
                ) : (
                  entregas.map((entrega) => (
                    <EntregaRow
                      key={entrega.alumno_id}
                      entrega={entrega}
                      ejercicioId={ej.id}
                      onCalificado={handleCalificado}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
