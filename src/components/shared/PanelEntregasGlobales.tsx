'use client';

import React, { useState, useTransition, useCallback, useEffect } from 'react';
import {
  Download, Clock, CheckCircle2, AlertTriangle, Loader2,
  Users, FileText, Star, BookOpen, ChevronDown, ChevronUp,
  MessageCircle, Send, X
} from 'lucide-react';
import { cn, parseFechaLocal } from '@/lib/utils';
import { calificarEntregaDescriptiva, getEntregasGlobalesProfesor } from '@/lib/actions/entregas';
import { enviarMensaje } from '@/lib/actions/mensajes';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ── Tipos ──────────────────────────────────────────────────────────

interface EntregaGlobal {
  alumno_id: string;
  ejercicio_id: string;
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
  grupo_nombre?: string | null;
}

interface EjercicioGroup {
  ejercicioId: string;
  ejercicioTitulo: string;
  fechaEntrega: string | null;
  entregas: EntregaGlobal[];
}

interface MateriaGroup {
  materiaId: string;
  materiaNombre: string;
  ejercicios: EjercicioGroup[];
}

// ── Utilidades ─────────────────────────────────────────────────────

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

// ── Fila de entrega individual ─────────────────────────────────────

function EntregaRowGlobal({
  entrega,
  profesorId,
  onCalificado,
}: {
  entrega: EntregaGlobal;
  profesorId: string;
  onCalificado: (alumnoId: string, ejercicioId: string, cal: number) => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [calInput, setCalInput] = useState(
    entrega.calificacion_manual !== null ? String(entrega.calificacion_manual) : ''
  );
  const { dias, horas, pct, vencido } = getDiasRestantes(entrega.caduca_el || '');
  const nombreCompleto = entrega.profiles
    ? `${entrega.profiles.nombre} ${entrega.profiles.apellidos}`
    : entrega.alumno_id.substring(0, 8) + '...';

  // ── Modal de mensaje privado ──
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [msgSending, setMsgSending] = useState(false);

  const handleCalificar = () => {
    const cal = parseFloat(calInput);
    if (isNaN(cal) || cal < 0 || cal > 10) {
      toast({ title: 'Calificación inválida', description: 'Ingresa un número entre 0 y 10', variant: 'destructive' });
      return;
    }
    startTransition(async () => {
      const res = await calificarEntregaDescriptiva(entrega.alumno_id, entrega.ejercicio_id, cal);
      if (res.error) {
        toast({ title: 'Error', description: res.error, variant: 'destructive' });
      } else {
        toast({ title: '✅ Calificación guardada', description: `${nombreCompleto}: ${cal}/10` });
        onCalificado(entrega.alumno_id, entrega.ejercicio_id, cal);
      }
    });
  };

  const handleEnviarMensaje = async () => {
    if (!msgText.trim()) return;
    setMsgSending(true);
    try {
      const res = await enviarMensaje({
        remitente_id: profesorId,
        destinatario_id: entrega.alumno_id,
        tipo_destino: 'INDIVIDUAL',
        contenido: msgText.trim(),
      });
      if (res.success) {
        toast({ title: '✅ Mensaje enviado', description: `Mensaje privado enviado a ${nombreCompleto}` });
        setMsgText('');
        setMsgOpen(false);
      } else {
        toast({ title: 'Error', description: res.error || 'No se pudo enviar', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Error inesperado al enviar', variant: 'destructive' });
    } finally {
      setMsgSending(false);
    }
  };

  return (
    <>
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
              {entrega.grupo_nombre && (
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-0.5">
                  Grupo: {entrega.grupo_nombre}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {entrega.calificacion_manual !== null && (
              <div className="shrink-0 flex items-center gap-1 bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl font-black text-sm">
                <Star className="w-3 h-3" />
                {entrega.calificacion_manual}/10
              </div>
            )}
            {/* Botón de mensaje privado */}
            <button
              onClick={() => setMsgOpen(true)}
              className="shrink-0 h-9 w-9 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-all flex items-center justify-center"
              title="Enviar mensaje privado"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
          </div>
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

      {/* Modal de mensaje privado */}
      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden rounded-[24px]">
          <DialogHeader className="p-6 pb-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
            <DialogTitle className="font-black text-lg text-slate-800 flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
                <MessageCircle className="w-5 h-5" />
              </div>
              Mensaje Privado
            </DialogTitle>
            <p className="text-sm text-slate-500 font-semibold mt-1">
              Para: <span className="text-slate-800">{nombreCompleto}</span>
            </p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              El alumno recibirá este mensaje en su bandeja de mensajes privados
            </p>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <textarea
              rows={4}
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              placeholder="Escribe tu observación o mensaje para el alumno..."
              className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all resize-none text-slate-700 placeholder-slate-400"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setMsgOpen(false)}
                className="px-5 h-10 rounded-xl text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleEnviarMensaje}
                disabled={msgSending || !msgText.trim()}
                className={cn(
                  'px-5 h-10 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center gap-2',
                  msgText.trim() && !msgSending
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                )}
              >
                {msgSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {msgSending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Componente principal ───────────────────────────────────────────

interface Props {
  profesorId: string;
  initialData: MateriaGroup[];
}

export function PanelEntregasGlobales({ profesorId, initialData }: Props) {
  const [materias, setMaterias] = useState<MateriaGroup[]>(initialData);
  const [materiaAbierta, setMateriaAbierta] = useState<string | null>(
    initialData.length > 0 ? initialData[0].materiaId : null
  );
  const [ejercicioAbierto, setEjercicioAbierto] = useState<string | null>(null);
  const [filtroGrupo, setFiltroGrupo] = useState<string>('TODOS');
  const [loading, setLoading] = useState(false);

  // Conteo total de entregas pendientes (sin calificación)
  const totalPendientes = materias.reduce((acc, m) => {
    return acc + m.ejercicios.reduce((acc2, ej) => {
      return acc2 + ej.entregas.filter(e => e.calificacion_manual === null).length;
    }, 0);
  }, 0);

  const totalEntregas = materias.reduce((acc, m) => {
    return acc + m.ejercicios.reduce((acc2, ej) => acc2 + ej.entregas.length, 0);
  }, 0);

  const handleCalificado = (alumnoId: string, ejercicioId: string, cal: number) => {
    setMaterias(prev =>
      prev.map(m => ({
        ...m,
        ejercicios: m.ejercicios.map(ej => ({
          ...ej,
          entregas: ej.entregas.map(e =>
            e.alumno_id === alumnoId && e.ejercicio_id === ejercicioId
              ? { ...e, calificacion_manual: cal }
              : e
          ),
        })),
      }))
    );
  };

  const refreshData = async () => {
    setLoading(true);
    const res = await getEntregasGlobalesProfesor(profesorId);
    if (res.data) {
      setMaterias(res.data as MateriaGroup[]);
    }
    setLoading(false);
  };

  if (materias.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-slate-100 mb-6">
          <BookOpen className="w-10 h-10 text-slate-300" />
        </div>
        <h3 className="text-xl font-black text-slate-700 uppercase tracking-widest mb-2">Sin entregas activas</h3>
        <p className="text-sm text-slate-400 font-bold max-w-md mx-auto">
          No hay entregas de actividades descriptivas pendientes en ninguna de tus materias.
          Las entregas aparecen aquí durante los 9 días posteriores a que el alumno las sube.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumen general */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-800">{materias.length}</p>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Materias con entregas</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-800">{totalEntregas}</p>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total entregas activas</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
          <div className={cn("p-3 rounded-xl", totalPendientes > 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-800">{totalPendientes}</p>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Pendientes de calificar</p>
          </div>
        </div>
      </div>

      {/* Agrupado por materia */}
      {materias.map((materia) => {
        const isOpen = materiaAbierta === materia.materiaId;
        const pendientesMateria = materia.ejercicios.reduce((acc, ej) => {
          return acc + ej.entregas.filter(e => e.calificacion_manual === null).length;
        }, 0);
        const totalMateria = materia.ejercicios.reduce((acc, ej) => acc + ej.entregas.length, 0);

        return (
          <div key={materia.materiaId} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            {/* Cabecera de materia */}
            <button
              onClick={() => {
                setMateriaAbierta(isOpen ? null : materia.materiaId);
                setEjercicioAbierto(null);
                setFiltroGrupo('TODOS');
              }}
              className="w-full flex items-center justify-between p-5 bg-gradient-to-r from-primary/5 to-white hover:from-primary/10 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-primary rounded-xl text-white">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">{materia.materiaNombre}</h3>
                  <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                    {materia.ejercicios.length} ejercicio{materia.ejercicios.length !== 1 ? 's' : ''} · {totalMateria} entrega{totalMateria !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {pendientesMateria > 0 && (
                  <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full uppercase tracking-wider">
                    {pendientesMateria} pendiente{pendientesMateria !== 1 ? 's' : ''}
                  </span>
                )}
                {pendientesMateria === 0 && totalMateria > 0 && (
                  <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full uppercase tracking-wider">
                    ✓ Todo calificado
                  </span>
                )}
                {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </div>
            </button>

            {/* Contenido de materia */}
            {isOpen && (
              <div className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-4">
                {materia.ejercicios.map((ej) => {
                  const ejOpen = ejercicioAbierto === ej.ejercicioId;
                  const calificados = ej.entregas.filter(e => e.calificacion_manual !== null).length;

                  // Recopilar grupos únicos para filtro
                  const gruposUnicos = Array.from(
                    new Set(ej.entregas.map(e => e.grupo_nombre).filter(Boolean))
                  ) as string[];

                  const entregasFiltradas = ej.entregas.filter(
                    e => filtroGrupo === 'TODOS' || e.grupo_nombre === filtroGrupo
                  );

                  return (
                    <div key={ej.ejercicioId} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                      {/* Cabecera del ejercicio */}
                      <button
                        onClick={() => {
                          setEjercicioAbierto(ejOpen ? null : ej.ejercicioId);
                          setFiltroGrupo('TODOS');
                        }}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-xl text-primary">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="text-left">
                            <p className="font-black text-slate-800 uppercase tracking-wide text-sm">{ej.ejercicioTitulo}</p>
                            {ej.fechaEntrega && (
                              <p className="text-[11px] text-slate-400 font-semibold">
                                Límite: {parseFechaLocal(ej.fechaEntrega).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black bg-primary/10 text-primary px-3 py-1 rounded-full uppercase">
                            {calificados}/{ej.entregas.length} calificados
                          </span>
                          {ejOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </button>

                      {/* Lista de entregas */}
                      {ejOpen && (
                        <div className="border-t border-slate-100 bg-slate-50/30 p-5 space-y-4">
                          {/* Filtro por grupo */}
                          {gruposUnicos.length > 1 && (
                            <div className="flex items-center justify-end mb-2 gap-2">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filtrar por grupo:</span>
                              <select
                                value={filtroGrupo}
                                onChange={e => setFiltroGrupo(e.target.value)}
                                className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary uppercase"
                              >
                                <option value="TODOS">Todos los Grupos</option>
                                {gruposUnicos.map(g => (
                                  <option key={g} value={g}>{g}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {entregasFiltradas.length === 0 ? (
                            <div className="text-center py-8 text-slate-400">
                              <Users className="w-10 h-10 mx-auto opacity-20 mb-3" />
                              <p className="text-sm font-bold uppercase">Sin entregas en este filtro</p>
                            </div>
                          ) : (
                            entregasFiltradas.map((entrega) => (
                              <EntregaRowGlobal
                                key={`${entrega.alumno_id}-${entrega.ejercicio_id}`}
                                entrega={entrega}
                                profesorId={profesorId}
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
            )}
          </div>
        );
      })}
    </div>
  );
}
