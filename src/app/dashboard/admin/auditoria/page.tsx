'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  BarChart3, Users, GraduationCap, BookOpen, ChevronDown,
  TrendingUp, TrendingDown, Star, Zap, AlertTriangle,
  Calendar, Save, Trash2, Loader2, CheckCircle2, XCircle,
  FileCheck, Layers, Presentation, FolderOpen, Clock,
  Flame, ChevronRight, Globe, Edit3, RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getGruposActivos,
  getRendimientoAlumnos,
  getActividadProfesores,
  getFechasEvaluacion,
  upsertFechaEvaluacion,
  deleteFechaEvaluacion,
  getMateriasDeGrupo
} from '@/lib/actions/auditoria';
import { useToast } from '@/hooks/use-toast';

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function AuditoriaPage() {
  const [activeTab, setActiveTab] = useState<'alumnos' | 'profesores' | 'fechas'>('alumnos');

  return (
    <div className="space-y-8 pb-16 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-0">
      {/* HEADER */}
      <header className="pb-6 border-b border-border/50">
        <div className="flex items-center gap-4 mb-2">
          <div className="p-3 bg-primary/10 rounded-2xl">
            <BarChart3 className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black font-headline text-primary tracking-tight">
              Reportes y Auditoría
            </h1>
            <p className="text-sm text-muted-foreground font-medium mt-1">
              Centro de control académico — Monitoreo de rendimiento y evaluaciones
            </p>
          </div>
        </div>
      </header>

      {/* TABS */}
      <div className="flex gap-2 bg-white/50 p-1.5 rounded-2xl border border-border w-fit">
        {[
          { key: 'alumnos' as const, icon: GraduationCap, label: 'Rendimiento Alumnos' },
          { key: 'profesores' as const, icon: BookOpen, label: 'Actividad Profesores' },
          { key: 'fechas' as const, icon: Calendar, label: 'Fechas Evaluación' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all',
              activeTab === tab.key
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-muted-foreground hover:bg-white hover:text-foreground'
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* CONTENIDO */}
      {activeTab === 'alumnos' && <TabAlumnos />}
      {activeTab === 'profesores' && <TabProfesores />}
      {activeTab === 'fechas' && <TabFechas />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 1: RENDIMIENTO DE ALUMNOS
// ═══════════════════════════════════════════════════════════════
function TabAlumnos() {
  const [grupos, setGrupos] = useState<any[]>([]);
  const [grupoId, setGrupoId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    getGruposActivos().then(setGrupos);
  }, []);

  const cargarRendimiento = async (id: string) => {
    setGrupoId(id);
    setLoading(true);
    const res = await getRendimientoAlumnos(id);
    setData(res);
    setLoading(false);
  };

  const getBadge = (pct: number) => {
    if (pct >= 75) return { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Excelente', icon: TrendingUp };
    if (pct >= 50) return { color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Regular', icon: TrendingDown };
    return { color: 'bg-red-100 text-red-700 border-red-200', label: 'En Riesgo', icon: AlertTriangle };
  };

  return (
    <div className="space-y-6">
      {/* Selector de grupo */}
      <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 block">
          Seleccionar Grupo Activo
        </label>
        <div className="relative">
          <select
            value={grupoId}
            onChange={e => cargarRendimiento(e.target.value)}
            className="w-full md:w-96 h-12 px-4 pr-10 bg-white border border-border rounded-xl text-sm font-bold text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">— Selecciona un grupo —</option>
            {grupos.map((g: any) => (
              <option key={g.id} value={g.id}>
                {(g.carreras as any)?.nombre} — {g.nombre} ({g.turno}) — {g.totalAlumnos} alumnos
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-bold uppercase tracking-widest">Cargando rendimiento...</span>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Resumen Global del Grupo */}
          {data.resumen && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-border p-5 shadow-sm text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Promedio Grupo</p>
                <p className="text-4xl font-black text-primary">{data.resumen.promedioGrupo}</p>
              </div>
              <div className="bg-white rounded-2xl border border-border p-5 shadow-sm text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Alumnos</p>
                <p className="text-4xl font-black text-foreground">{data.resumen.totalAlumnos}</p>
              </div>
              {data.resumen.mejorAlumno && (
                <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-5 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1 flex items-center gap-1"><Star className="w-3 h-3" /> Mejor Promedio</p>
                  <p className="text-sm font-black text-emerald-800 truncate">{data.resumen.mejorAlumno.nombre}</p>
                  <p className="text-2xl font-black text-emerald-700">{data.resumen.mejorAlumno.promedio}</p>
                </div>
              )}
              {data.resumen.peorAlumno && (
                <div className="bg-red-50 rounded-2xl border border-red-200 p-5 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-600 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Menor Promedio</p>
                  <p className="text-sm font-black text-red-800 truncate">{data.resumen.peorAlumno.nombre}</p>
                  <p className="text-2xl font-black text-red-700">{data.resumen.peorAlumno.promedio}</p>
                </div>
              )}
            </div>
          )}

          {/* Tarjetas de Alumnos */}
          <div className="space-y-4">
            {data.alumnos?.map((alumno: any) => {
              const badge = getBadge(alumno.progresoGlobal);
              const BadgeIcon = badge.icon;
              const isOpen = expandido === alumno.id;

              return (
                <div key={alumno.id} className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden transition-all hover:shadow-md">
                  <button
                    onClick={() => setExpandido(isOpen ? null : alumno.id)}
                    className="w-full flex items-center justify-between p-5 text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center font-black text-primary text-lg shrink-0">
                        {alumno.nombre.charAt(0)}
                      </div>
                      <div>
                        <p className="font-black text-foreground text-sm">{alumno.nombre}</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{alumno.matricula}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden md:flex items-center gap-6 mr-4">
                        <div className="text-center">
                          <p className="text-[9px] font-black uppercase text-muted-foreground">Progreso</p>
                          <p className="text-lg font-black text-foreground">{alumno.progresoGlobal}%</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] font-black uppercase text-muted-foreground">Promedio</p>
                          <p className="text-lg font-black text-foreground">{alumno.promedioGeneral}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] font-black uppercase text-muted-foreground">Perfectas</p>
                          <p className="text-lg font-black text-primary">{alumno.notasPerfectas}</p>
                        </div>
                      </div>
                      <span className={cn('flex items-center gap-1 px-3 py-1.5 rounded-full text-[9px] font-black uppercase border', badge.color)}>
                        <BadgeIcon className="w-3 h-3" />
                        {badge.label}
                      </span>
                      <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border bg-muted/20 p-5 space-y-4">
                      {/* Stats móviles */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:hidden">
                        <div className="bg-white rounded-xl border p-3 text-center">
                          <p className="text-[9px] font-black uppercase text-muted-foreground">Progreso</p>
                          <p className="text-xl font-black">{alumno.progresoGlobal}%</p>
                        </div>
                        <div className="bg-white rounded-xl border p-3 text-center">
                          <p className="text-[9px] font-black uppercase text-muted-foreground">Promedio</p>
                          <p className="text-xl font-black">{alumno.promedioGeneral}</p>
                        </div>
                        <div className="bg-white rounded-xl border p-3 text-center">
                          <p className="text-[9px] font-black uppercase text-muted-foreground">Perfectas</p>
                          <p className="text-xl font-black text-primary">{alumno.notasPerfectas}</p>
                        </div>
                        <div className="bg-white rounded-xl border p-3 text-center">
                          <p className="text-[9px] font-black uppercase text-muted-foreground">Intentos Prom.</p>
                          <p className="text-xl font-black">{alumno.intentosPromedio}</p>
                        </div>
                      </div>

                      {/* Barra de progreso global */}
                      <div className="flex items-center gap-3 p-3 bg-white rounded-xl border">
                        <span className="text-xs font-bold text-foreground w-10 text-right">{alumno.progresoGlobal}%</span>
                        <div className="flex-1 h-2.5 bg-border/50 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-700',
                              alumno.progresoGlobal >= 75 ? 'bg-emerald-500' :
                              alumno.progresoGlobal >= 50 ? 'bg-amber-500' : 'bg-red-500'
                            )}
                            style={{ width: `${alumno.progresoGlobal}%` }}
                          />
                        </div>
                        <span className="text-[9px] font-black uppercase text-muted-foreground">Completado</span>
                      </div>

                      {/* Desglose por materia */}
                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Desglose por Materia</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {alumno.desgloseMateria?.map((mat: any) => (
                            <div key={mat.materiaId} className="flex items-center justify-between p-3 bg-white rounded-xl border">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <BookOpen className="w-4 h-4 text-primary shrink-0" />
                                <span className="text-xs font-bold text-foreground truncate">{mat.materiaNombre}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-[10px] font-black text-muted-foreground">
                                  {mat.completados}/{mat.total}
                                </span>
                                <span className={cn(
                                  'text-xs font-black px-2.5 py-1 rounded-lg',
                                  mat.promedio >= 70 ? 'bg-emerald-100 text-emerald-700' :
                                  mat.promedio >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                )}>
                                  {mat.promedio}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Pagos */}
                      <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <FileCheck className="w-3.5 h-3.5" />
                        Pagos: {alumno.pagos.pagados}/{alumno.pagos.total} al corriente
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {!grupoId && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-16 h-16 mx-auto opacity-20 mb-4" />
          <p className="font-bold text-lg">Selecciona un grupo para ver el rendimiento</p>
          <p className="text-sm mt-1">Solo se muestran alumnos con estatus <strong>activo</strong></p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 2: ACTIVIDAD DE PROFESORES
// ═══════════════════════════════════════════════════════════════
function TabProfesores() {
  const [profesores, setProfesores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    getActividadProfesores().then(data => {
      setProfesores(data);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
      <Loader2 className="w-6 h-6 animate-spin" />
      <span className="text-sm font-bold uppercase tracking-widest">Cargando actividad de profesores...</span>
    </div>
  );

  if (profesores.length === 0) return (
    <div className="text-center py-16 text-muted-foreground">
      <BookOpen className="w-16 h-16 mx-auto opacity-20 mb-4" />
      <p className="font-bold text-lg">No hay profesores activos registrados</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {profesores.map(prof => {
        const isOpen = expandido === prof.id;
        const tieneUrgentes = prof.metricas.urgentes > 0;
        const coberturaCumple = prof.cobertura.every((c: any) => c.cumpleTotal);

        return (
          <div key={prof.id} className={cn(
            'bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md',
            tieneUrgentes ? 'border-red-300 ring-2 ring-red-100' : 'border-border'
          )}>
            <button
              onClick={() => setExpandido(isOpen ? null : prof.id)}
              className="w-full flex items-center justify-between p-5 text-left"
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  'h-12 w-12 rounded-2xl flex items-center justify-center font-black text-lg shrink-0',
                  tieneUrgentes ? 'bg-red-100 text-red-600' : 'bg-primary/10 text-primary'
                )}>
                  {prof.nombre.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-black text-foreground text-sm">{prof.nombre}</p>
                    {tieneUrgentes && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-red-600 text-white rounded-full text-[8px] font-black uppercase animate-pulse">
                        <Flame className="w-3 h-3" /> {prof.metricas.urgentes} Urgentes
                      </span>
                    )}
                    {!coberturaCumple && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full text-[8px] font-black uppercase">
                        <AlertTriangle className="w-3 h-3" /> Contenido Insuficiente
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground">{prof.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden md:flex items-center gap-5 mr-4">
                  <div className="text-center">
                    <p className="text-[8px] font-black uppercase text-muted-foreground">Ejercicios</p>
                    <p className="text-lg font-black text-foreground">{prof.metricas.ejerciciosCreados}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[8px] font-black uppercase text-muted-foreground">Slides</p>
                    <p className="text-lg font-black text-foreground">{prof.metricas.slidesCreadas}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[8px] font-black uppercase text-muted-foreground">Recursos</p>
                    <p className="text-lg font-black text-foreground">{prof.metricas.recursosSubidos}</p>
                  </div>
                </div>
                <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border bg-muted/20 p-5 space-y-6">
                {/* Grid de métricas */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'Creados (30d)', value: prof.metricas.creadosRecientes, icon: Zap, color: 'text-blue-600 bg-blue-50' },
                    { label: 'Modificados (30d)', value: prof.metricas.modificadosRecientes, icon: Edit3, color: 'text-indigo-600 bg-indigo-50' },
                    { label: 'Total Slides', value: prof.metricas.slidesCreadas, icon: Presentation, color: 'text-purple-600 bg-purple-50' },
                    { label: 'Recursos', value: prof.metricas.recursosSubidos, icon: FolderOpen, color: 'text-emerald-600 bg-emerald-50' },
                    { label: 'Calificadas', value: prof.metricas.descriptivasCalificadas, icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
                    { label: 'Pendientes', value: prof.metricas.descriptivasPendientes, icon: Clock, color: prof.metricas.descriptivasPendientes > 0 ? 'text-red-600 bg-red-50' : 'text-slate-600 bg-slate-50' },
                  ].map((m, i) => (
                    <div key={i} className="bg-white rounded-xl border border-border p-3 text-center shadow-sm">
                      <div className={cn('mx-auto w-8 h-8 rounded-lg flex items-center justify-center mb-2', m.color)}>
                        <m.icon className="w-4 h-4" />
                      </div>
                      <p className="text-2xl font-black text-foreground">{m.value}</p>
                      <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* Asignaciones */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Materias Asignadas</p>
                  <div className="flex flex-wrap gap-2">
                    {prof.asignaciones.map((a: any, i: number) => (
                      <span key={i} className="px-3 py-1.5 bg-white border border-border rounded-lg text-xs font-bold text-foreground">
                        {a.nombre} <span className="text-muted-foreground">({a.grupoNombre})</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Cobertura por tema */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
                    Cobertura Mínima (5 ejercicios/tema)
                  </p>
                  <div className="space-y-3">
                    {prof.cobertura.map((cob: any, ci: number) => (
                      <div key={ci} className="bg-white rounded-xl border border-border p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-black text-foreground">{cob.materiaNombre}</span>
                          <span className={cn(
                            'text-[9px] font-black uppercase px-2.5 py-1 rounded-lg',
                            cob.cumpleTotal ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          )}>
                            {cob.cumpleTotal ? '✅ Cumple' : '❌ No cumple'}
                          </span>
                        </div>
                        {cob.temas.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {cob.temas.map((t: any, ti: number) => (
                              <div key={ti} className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-lg">
                                <span className="text-[10px] font-bold text-muted-foreground truncate mr-2">{t.temaTitulo}</span>
                                <span className={cn(
                                  'text-[10px] font-black shrink-0',
                                  t.cumple ? 'text-emerald-600' : 'text-red-600'
                                )}>
                                  {t.ejercicios}/5
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] italic text-muted-foreground">Sin temas creados aún</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 3: FECHAS DE EVALUACIÓN
// ═══════════════════════════════════════════════════════════════
function TabFechas() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [grupos, setGrupos] = useState<any[]>([]);
  const [grupoId, setGrupoId] = useState('');
  const [materias, setMaterias] = useState<any[]>([]);
  const [fechas, setFechas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Formulario
  const [fechaGlobal, setFechaGlobal] = useState('');
  const [fechasEspecificas, setFechasEspecificas] = useState<Record<string, string>>({});

  useEffect(() => {
    getGruposActivos().then(setGrupos);
  }, []);

  const cargarGrupo = async (id: string) => {
    setGrupoId(id);
    if (!id) return;
    setLoading(true);

    const [matsRes, fechasRes] = await Promise.all([
      getMateriasDeGrupo(id),
      getFechasEvaluacion(id)
    ]);

    setMaterias(matsRes);
    const fechasData = (fechasRes as any).data || [];
    setFechas(fechasData);

    // Pre-popular los formstados
    const global = fechasData.find((f: any) => f.materia_id === null);
    if (global) setFechaGlobal(global.fecha_evaluacion);
    else setFechaGlobal('');

    const especs: Record<string, string> = {};
    fechasData.filter((f: any) => f.materia_id !== null).forEach((f: any) => {
      especs[f.materia_id] = f.fecha_evaluacion;
    });
    setFechasEspecificas(especs);
    setLoading(false);
  };

  const guardarFechaGlobal = () => {
    if (!fechaGlobal || !grupoId) return;
    startTransition(async () => {
      const res = await upsertFechaEvaluacion({
        grupo_id: grupoId,
        materia_id: null,
        fecha_evaluacion: fechaGlobal,
        descripcion: 'Evaluación Final (Global)'
      });
      if (res.error) {
        toast({ title: 'Error', description: res.error, variant: 'destructive' });
      } else {
        toast({ title: '✅ Fecha global guardada', description: 'Los alumnos verán esta fecha en todas sus materias.' });
        cargarGrupo(grupoId);
      }
    });
  };

  const guardarFechaEspecifica = (materiaId: string) => {
    const fecha = fechasEspecificas[materiaId];
    if (!fecha || !grupoId) return;
    startTransition(async () => {
      const res = await upsertFechaEvaluacion({
        grupo_id: grupoId,
        materia_id: materiaId,
        fecha_evaluacion: fecha,
        descripcion: 'Evaluación Final (Específica)'
      });
      if (res.error) {
        toast({ title: 'Error', description: res.error, variant: 'destructive' });
      } else {
        toast({ title: '✅ Fecha guardada', description: 'Esta materia tiene ahora una fecha independiente.' });
        cargarGrupo(grupoId);
      }
    });
  };

  const eliminarFechaEspecifica = (materiaId: string) => {
    const fechaObj = fechas.find((f: any) => f.materia_id === materiaId);
    if (!fechaObj) return;
    startTransition(async () => {
      const res = await deleteFechaEvaluacion(fechaObj.id);
      if ((res as any).error) {
        toast({ title: 'Error', description: (res as any).error, variant: 'destructive' });
      } else {
        toast({ title: '🔄 Fecha eliminada', description: 'Esta materia usará la fecha global del grupo.' });
        const newEsp = { ...fechasEspecificas };
        delete newEsp[materiaId];
        setFechasEspecificas(newEsp);
        cargarGrupo(grupoId);
      }
    });
  };

  const getFechaActual = (materiaId: string) => {
    const especifica = fechas.find((f: any) => f.materia_id === materiaId);
    if (especifica) return { fecha: especifica.fecha_evaluacion, tipo: 'Específica' };
    const global = fechas.find((f: any) => f.materia_id === null);
    if (global) return { fecha: global.fecha_evaluacion, tipo: 'Global' };
    return { fecha: null, tipo: 'Sin asignar' };
  };

  return (
    <div className="space-y-6">
      {/* Selector de grupo */}
      <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 block">
          Seleccionar Grupo
        </label>
        <div className="relative">
          <select
            value={grupoId}
            onChange={e => cargarGrupo(e.target.value)}
            className="w-full md:w-96 h-12 px-4 pr-10 bg-white border border-border rounded-xl text-sm font-bold text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">— Selecciona un grupo —</option>
            {grupos.map((g: any) => (
              <option key={g.id} value={g.id}>
                {(g.carreras as any)?.nombre} — {g.nombre} ({g.turno})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-bold uppercase tracking-widest">Cargando materias...</span>
        </div>
      )}

      {grupoId && !loading && (
        <>
          {/* Fecha Global */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-600 text-white rounded-xl">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <p className="font-black text-blue-900 text-sm uppercase tracking-wide">Fecha de Evaluación Global</p>
                <p className="text-[10px] font-bold text-blue-600">Aplica a TODAS las materias del grupo (a menos que se sobreescriba individualmente)</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={fechaGlobal}
                onChange={e => setFechaGlobal(e.target.value)}
                className="h-12 px-4 bg-white border border-blue-200 rounded-xl text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
              />
              <button
                onClick={guardarFechaGlobal}
                disabled={!fechaGlobal || isPending}
                className={cn(
                  'h-12 px-6 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-2 transition-all',
                  fechaGlobal && !isPending
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                )}
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar Global
              </button>
            </div>
          </div>

          {/* Tabla de materias */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="p-5 border-b border-border bg-muted/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Fechas por Materia — {materias.length} materias asignadas
              </p>
            </div>
            <div className="divide-y divide-border">
              {materias.map(mat => {
                const info = getFechaActual(mat.id);
                const tieneEspecifica = info.tipo === 'Específica';

                return (
                  <div key={mat.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <BookOpen className="w-5 h-5 text-primary shrink-0" />
                      <div>
                        <p className="font-black text-foreground text-sm">{mat.nombre}</p>
                        <p className="text-[10px] font-bold text-muted-foreground">{mat.profesor}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Fecha actual */}
                      <div className="text-right mr-2">
                        {info.fecha ? (
                          <>
                            <p className="text-sm font-black text-foreground">
                              {new Date(info.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                            <p className={cn(
                              'text-[9px] font-black uppercase',
                              tieneEspecifica ? 'text-purple-600' : 'text-blue-600'
                            )}>
                              {tieneEspecifica ? '🟣 Específica' : '🔵 Global'}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs font-bold text-muted-foreground italic">Sin fecha</p>
                        )}
                      </div>

                      {/* Input fecha específica */}
                      <input
                        type="date"
                        value={fechasEspecificas[mat.id] || ''}
                        onChange={e => setFechasEspecificas(prev => ({ ...prev, [mat.id]: e.target.value }))}
                        className="h-10 px-3 bg-white border border-border rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                      <button
                        onClick={() => guardarFechaEspecifica(mat.id)}
                        disabled={!fechasEspecificas[mat.id] || isPending}
                        className="h-10 px-4 bg-primary text-white rounded-xl text-[10px] font-black uppercase disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-all flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" /> Guardar
                      </button>

                      {tieneEspecifica && (
                        <button
                          onClick={() => eliminarFechaEspecifica(mat.id)}
                          disabled={isPending}
                          className="h-10 px-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase hover:bg-red-50 hover:text-red-600 transition-all flex items-center gap-1.5"
                          title="Eliminar fecha específica y usar la global"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Usar Global
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {materias.length === 0 && (
                <div className="p-10 text-center text-muted-foreground">
                  <Calendar className="w-10 h-10 mx-auto opacity-20 mb-3" />
                  <p className="text-sm font-bold">Este grupo no tiene materias asignadas</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!grupoId && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <Calendar className="w-16 h-16 mx-auto opacity-20 mb-4" />
          <p className="font-bold text-lg">Selecciona un grupo para gestionar fechas de evaluación</p>
          <p className="text-sm mt-1">Las fechas se reflejarán en tiempo real en el panel de los alumnos</p>
        </div>
      )}
    </div>
  );
}
