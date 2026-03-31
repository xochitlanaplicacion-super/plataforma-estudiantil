'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  AlertTriangle, 
  Clock, 
  CalendarClock, 
  ChevronLeft, 
  ChevronRight,
  ListFilter
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  titulo: string;
  materia: string;
  tema: string;
  fecha_entrega: string | null;
  tipo?: string;
}

interface PaginationTasksProps {
  tasks: Task[];
}

export function PaginationTasks({ tasks }: PaginationTasksProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const ITEMS_PER_PAGE = isExpanded ? 20 : 5;
  const now = new Date();

  // Sort and filter active tasks
  const activeTasks = useMemo(() => {
    return tasks.filter(t => {
      if (!t.fecha_entrega) return true;
      return new Date(t.fecha_entrega) >= now;
    });
  }, [tasks]);

  const totalPages = Math.ceil(activeTasks.length / ITEMS_PER_PAGE);
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentTasks = activeTasks.slice(offset, offset + ITEMS_PER_PAGE);

  if (activeTasks.length === 0) {
    return (
      <div className="p-12 text-center text-muted-foreground italic text-sm">
        No tienes tareas pendientes urgentes para realizar hoy.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {currentTasks.map((tarea) => {
        const deadline = tarea.fecha_entrega ? new Date(tarea.fecha_entrega) : null;
        const diffTime = deadline ? deadline.getTime() - now.getTime() : Infinity;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        
        const isToday = diffDays >= 0 && diffDays < 1;
        const isSoon = diffDays >= 1 && diffDays < 3;
        
        let badgeLabel = "PENDIENTE";
        let badgeColor = "bg-emerald-500";
        let icon = <Clock className="w-5 h-5 md:w-6 md:h-6" />;
        let iconBg = "bg-emerald-100 text-emerald-600";

        if (isToday) {
          badgeLabel = "PARA HOY";
          badgeColor = "bg-red-600";
          icon = <AlertTriangle className="w-5 h-5 md:w-6 md:h-6" />;
          iconBg = "bg-red-100 text-red-600";
        } else if (isSoon) {
          badgeLabel = "PRÓXIMA";
          badgeColor = "bg-orange-500";
          icon = <Clock className="w-5 h-5 md:w-6 md:h-6" />;
          iconBg = "bg-orange-100 text-orange-600";
        }

        return (
          <div key={tarea.id} className="p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6 hover:bg-muted/10 transition-colors">
            <div className="flex items-start md:items-center gap-4 flex-1">
              <div className={cn("h-10 w-10 md:h-12 md:w-12 shrink-0 rounded-full flex items-center justify-center", iconBg)}>
                {icon}
              </div>
              <div>
                <h6 className="font-bold text-foreground tracking-tight text-sm md:text-base">{tarea.titulo}</h6>
                <p className="text-xs md:text-sm text-muted-foreground font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                  {tarea.materia} • {tarea.tema}
                  {deadline && (
                    <span className="flex items-center gap-1 text-[10px] ml-2 bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 uppercase font-black">
                      <CalendarClock size={10} /> 
                      {deadline.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto mt-2 md:mt-0 pt-2 md:pt-0 border-t md:border-t-0 border-border">
              <span className={cn("px-3 md:px-4 py-1.5 text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-full", badgeColor)}>
                {badgeLabel}
              </span>
              <Link href={`/dashboard/alumno/ejercicios/${tarea.id}`} className="flex-1 md:flex-none text-center px-4 md:px-6 py-2 bg-primary text-primary-foreground rounded-full font-bold text-xs md:text-sm hover:opacity-90 active:scale-95 transition-all outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 whitespace-nowrap">
                Realizar ejercicio
              </Link>
            </div>
          </div>
        );
      })}

      {/* FOOTER: CONTROLES DE PAGINACIÓN */}
      <div className="bg-muted/5 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border mt-auto">
        {!isExpanded && activeTasks.length > 5 ? (
          <button 
            onClick={() => { setIsExpanded(true); setCurrentPage(1); }}
            className="w-full text-center py-2 text-primary font-bold text-sm bg-primary/5 hover:bg-primary/10 rounded-xl transition-all"
          >
            Ver todas las tareas pendientes ({activeTasks.length})
          </button>
        ) : isExpanded ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Página {currentPage} de {totalPages}
              </span>
              <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-black text-slate-500">
                {activeTasks.length} TOTAL
              </span>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className={cn(
                  "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                  currentPage === 1 ? "bg-slate-50 text-slate-300 pointer-events-none" : "bg-white border border-border text-foreground hover:border-primary/30"
                )}
              >
                <ChevronLeft size={16} /> Anterior
              </button>
              
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className={cn(
                  "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                  currentPage === totalPages ? "bg-slate-50 text-slate-300 pointer-events-none" : "bg-primary text-white shadow-sm hover:opacity-90"
                )}
              >
                Siguiente <ChevronRight size={16} />
              </button>

              <button 
                onClick={() => { setIsExpanded(false); setCurrentPage(1); }}
                className="ml-2 p-2 text-muted-foreground hover:text-red-500 transition-colors"
                title="Contraer"
              >
                <ListFilter size={18} />
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
