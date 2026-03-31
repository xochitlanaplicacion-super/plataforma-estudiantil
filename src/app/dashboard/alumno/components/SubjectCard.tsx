'use client';

import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  Calculator, 
  Languages, 
  Atom, 
  Building2, 
  Activity, 
  GraduationCap,
  Clock,
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  FileCheck,
  TrendingUp,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const getSubjectIcon = (nombre: string) => {
  const norm = nombre.toLowerCase();
  if (norm.includes('mate') || norm.includes('calc')) return <Calculator className="w-5 h-5 md:w-6 md:h-6 text-primary" />;
  if (norm.includes('español') || norm.includes('lit')) return <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-tertiary-container" />;
  if (norm.includes('física') || norm.includes('cien')) return <Atom className="w-5 h-5 md:w-6 md:h-6 text-primary" />;
  if (norm.includes('historia')) return <Building2 className="w-5 h-5 md:w-6 md:h-6 text-green-600" />;
  if (norm.includes('quím')) return <Activity className="w-5 h-5 md:w-6 md:h-6 text-primary" />;
  if (norm.includes('inglés')) return <Languages className="w-5 h-5 md:w-6 md:h-6 text-tertiary-container" />;
  return <GraduationCap className="w-5 h-5 md:w-6 md:h-6 text-primary" />;
};

interface Exercise {
  id: string;
  titulo: string;
  fecha_entrega: string | null;
  materia_id: string;
}

interface SubjectCardProps {
  materia: {
    id: string;
    nombre: string;
    profesor?: string;
    clave?: string;
  };
  exercises: Exercise[];
  promedio: string;
  progreso: number;
}

export function SubjectCard({ materia, exercises, promedio, progreso }: SubjectCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  
  const now = new Date();

  // Sorting logic: Active ones first, then expired ones
  const sortedExercises = useMemo(() => {
    const active = exercises.filter(ex => !ex.fecha_entrega || new Date(ex.fecha_entrega) >= now)
      .sort((a, b) => {
        if (!a.fecha_entrega) return 1;
        if (!b.fecha_entrega) return -1;
        return new Date(a.fecha_entrega).getTime() - new Date(b.fecha_entrega).getTime();
      });
      
    const expired = exercises.filter(ex => ex.fecha_entrega && new Date(ex.fecha_entrega) < now)
      .sort((a, b) => {
        if (!a.fecha_entrega) return 1;
        if (!b.fecha_entrega) return -1;
        return new Date(b.fecha_entrega).getTime() - new Date(a.fecha_entrega).getTime();
      });
      
    return [...active, ...expired];
  }, [exercises]);

  const totalPages = Math.ceil(sortedExercises.length / ITEMS_PER_PAGE);
  const currentBatch = sortedExercises.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className={cn(
      "bg-card rounded-[2rem] md:rounded-[3rem] border border-border shadow-sm overflow-hidden transition-all duration-500",
      isExpanded ? "ring-2 ring-primary/20 shadow-xl" : "hover:border-primary/20"
    )}>
      <div className="p-6 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6 md:gap-8 flex-1 w-full">
          <div className="h-14 w-14 md:h-20 md:w-20 rounded-3xl bg-secondary/30 flex items-center justify-center shrink-0 shadow-inner">
            {getSubjectIcon(materia.nombre)}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center flex-wrap gap-2 mb-1.5 md:mb-2">
              <h3 className="text-xl md:text-3xl font-black font-headline text-foreground tracking-tight truncate">{materia.nombre}</h3>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-widest">
              <span className="flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5 md:w-4 md:h-4 opacity-70" />{materia.profesor}</span>
              <span className="hidden sm:block opacity-30 px-1">•</span>
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 md:w-4 md:h-4 opacity-70" />Lunes, Miér, Vier</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto shrink-0 border-t md:border-t-0 border-border pt-4 md:pt-0">
          <div className="text-left md:text-right">
            <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-1">
              En Curso
            </span>
            <div className="flex items-center md:justify-end gap-2">
              <span className="text-3xl md:text-4xl font-black font-headline text-foreground">{promedio}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-tight">Promedio<br/>Gral.</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                "px-5 py-3 md:px-8 md:py-4 rounded-full text-xs md:text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2",
                isExpanded ? "bg-slate-100 text-slate-800" : "bg-primary text-primary-foreground hover:opacity-90 active:scale-95"
              )}
            >
              {isExpanded ? <><ChevronUp size={16} /> Contraer</> : "Ver Ejercicios"}
            </button>
          </div>
        </div>
      </div>

      {/* DETALLES EXPANDIBLES (ACORDEÓN) */}
      <div className={cn(
        "grid transition-all duration-700 ease-in-out",
        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
      )}>
        <div className="overflow-hidden">
          <div className="bg-muted/30 px-6 py-4 md:px-10 md:py-8 border-t border-border/50 flex flex-col gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] md:text-[12px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <CalendarClock size={14} className="text-primary" /> Actividades de la Materia
                </h4>
                {totalPages > 1 && (
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-full hover:bg-white border border-transparent hover:border-border disabled:opacity-30 disabled:pointer-events-none transition-all"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-[10px] font-bold text-muted-foreground">{currentPage} / {totalPages}</span>
                    <button 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 rounded-full hover:bg-white border border-transparent hover:border-border disabled:opacity-30 disabled:pointer-events-none transition-all"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4">
                {exercises.length === 0 ? (
                  <p className="text-[10px] md:text-xs italic text-muted-foreground p-4 bg-white/50 rounded-2xl border border-dashed text-center">No hay actividades publicadas aún.</p>
                ) : (
                  currentBatch.map((ex: any) => {
                    const deadline = ex.fecha_entrega ? new Date(ex.fecha_entrega) : null;
                    const isExpired = deadline ? deadline < now : false;
                    const isPerfect = ex.calificacion >= 100;
                    const isCompleted = ex.completado;

                    return (
                      <Link 
                        key={ex.id} 
                        href={`/dashboard/alumno/ejercicios/${ex.id}`}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-2xl border transition-all group/item shadow-sm",
                          isPerfect 
                            ? "bg-blue-50/50 border-blue-200 hover:border-blue-400" 
                            : isCompleted
                              ? "bg-emerald-50/30 border-emerald-100 hover:border-emerald-300"
                              : isExpired 
                                ? "bg-slate-50/50 border-slate-100 opacity-80" 
                                : "bg-white border-border hover:border-primary/40 hover:shadow-md"
                        )}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className={cn(
                            "p-2 rounded-xl shrink-0 transition-colors",
                            isPerfect 
                              ? "bg-blue-600 text-white" 
                              : isCompleted 
                                ? "bg-emerald-600 text-white"
                                : isExpired 
                                  ? "bg-slate-100 text-slate-400" 
                                  : "bg-primary/5 text-primary group-hover/item:bg-primary group-hover/item:text-white"
                          )}>
                            {isPerfect ? <FileCheck className="w-4 h-4" /> : isCompleted ? <FileCheck className="w-4 h-4" /> : isExpired ? <Clock className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] md:text-[13px] font-bold text-slate-700 truncate">{ex.titulo}</span>
                              {isCompleted && (
                                <span className={cn(
                                  "text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter",
                                  isPerfect ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                                )}>
                                  Nota: {Number(ex.calificacion).toFixed(1)}
                                </span>
                              )}
                            </div>
                            {deadline && (
                              <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mt-0.5">
                                LIM: {deadline.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={cn(
                          "text-[10px] md:text-[11px] font-black px-4 py-2 rounded-full uppercase shrink-0 transition-all",
                          isPerfect 
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
                            : isCompleted
                              ? "bg-emerald-600 text-white"
                              : isExpired 
                                ? "bg-slate-200 text-slate-500" 
                                : "bg-primary text-white group-hover/item:scale-105 shadow-lg shadow-primary/20"
                        )}>
                          {isPerfect ? 'Revisar' : isCompleted ? 'Reintentar' : isExpired ? 'Vencido' : 'Realizar'}
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pt-6 border-t border-border/20">
              <div className="flex-1 w-full max-w-xl flex items-center gap-4">
                <span className="text-xs font-bold text-foreground w-10 text-right">{progreso}%</span>
                <div className="flex-1 h-2 bg-border/50 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-1000 ease-out" style={{ width: `${progreso}%` }}></div>
                </div>
                <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground hidden sm:inline-block">Completado</span>
              </div>

              <div className="flex flex-wrap items-center gap-4 md:gap-8 w-full lg:w-auto">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                   <FileCheck className="w-4 h-4 opacity-70" />
                   <span>{exercises.length} Actividades</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                   <TrendingUp className="w-4 h-4 opacity-70" />
                   <span>Próxima Evaluación: <strong className="text-foreground">Diciembre 2026</strong></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
