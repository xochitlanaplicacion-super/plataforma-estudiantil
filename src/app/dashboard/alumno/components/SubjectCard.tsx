'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
  ChevronRight,
  Layout,
  ListTree,
  FileText,
  Presentation,
  FileSpreadsheet,
  File,
  Download,
  FolderOpen,
  Play,
  MonitorPlay,
  Maximize,
  X,
  Image as ImageIcon,
  Youtube,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import { cn, parseFechaLocal } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const LOGO_URL = '/images/logo_zapata.png';

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

const getFileExtension = (url: string, tipo?: string): string => {
  if (tipo) return tipo.toLowerCase().replace('.', '');
  if (!url) return '';
  // Extract extension from URL, ignoring query params
  const cleanUrl = url.split('?')[0];
  return cleanUrl.split('.').pop()?.toLowerCase() || '';
};

const getResourceIcon = (url: string, tipo?: string) => {
  const ext = getFileExtension(url, tipo);
  
  if (ext === 'pdf') return (
    <div className="p-2.5 bg-red-50 text-red-600 rounded-xl border border-red-100 shadow-sm">
      <FileText className="w-5 h-5" />
    </div>
  );
  if (['ppt', 'pptx'].includes(ext)) return (
    <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl border border-orange-100 shadow-sm">
      <Presentation className="w-5 h-5" />
    </div>
  );
  if (['xls', 'xlsx', 'csv'].includes(ext)) return (
    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shadow-sm">
      <FileSpreadsheet className="w-5 h-5" />
    </div>
  );
  if (['doc', 'docx'].includes(ext)) return (
    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shadow-sm">
      <FileText className="w-5 h-5" />
    </div>
  );
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return (
    <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl border border-purple-100 shadow-sm">
      <File className="w-5 h-5" />
    </div>
  );
  if (['zip', 'rar', '7z', 'tar'].includes(ext)) return (
    <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-100 shadow-sm">
      <FolderOpen className="w-5 h-5" />
    </div>
  );
  
  return (
    <div className="p-2.5 bg-slate-100 text-slate-500 rounded-xl border border-slate-200">
      <File className="w-5 h-5" />
    </div>
  );
};

const getFileTypeLabel = (url: string, tipo?: string): string => {
  const ext = getFileExtension(url, tipo).toUpperCase();
  if (!ext) return 'ARCHIVO';
  const labels: Record<string, string> = {
    'PDF': 'PDF', 'DOC': 'Word', 'DOCX': 'Word',
    'XLS': 'Excel', 'XLSX': 'Excel', 'CSV': 'CSV',
    'PPT': 'PowerPoint', 'PPTX': 'PowerPoint',
    'JPG': 'Imagen', 'JPEG': 'Imagen', 'PNG': 'Imagen', 'GIF': 'Imagen',
    'ZIP': 'ZIP', 'RAR': 'RAR'
  };
  return labels[ext] || ext;
};

interface Exercise {
  id: string;
  titulo: string;
  fecha_entrega: string | null;
  materia_id: string;
  tipo?: string;
  completado?: boolean;
  calificacion?: number | null;
  bloqueado?: boolean;
}

interface Resource {
  id: string;
  nombre: string;
  url: string;
  tema_id: string;
  tipo?: string;
  file_path?: string;
}

interface Slide {
  id: string;
  tema_id: string;
  titulo: string;
  contenido?: string;
  imagen_url?: string;
  estilo?: string;
  orden: number;
}

interface Tema {
  id: string;
  titulo: string;
  unidad_id: string;
  recursos: Resource[];
  slides?: Slide[];
  videos?: any[];
  orden?: number;
}

interface Unidad {
  id: string;
  nombre: string;
  materia_id: string;
  orden: number;
  temas: Tema[];
}

interface SubjectCardProps {
  materia: {
    id: string;
    nombre: string;
    profesor?: string;
    clave?: string;
  };
  exercises: Exercise[];
  unidades?: Unidad[];
  promedio: string;
  progreso: number;
  proximaEvaluacion?: string;
}

export function SubjectCard({ materia, exercises, unidades = [], promedio, progreso, proximaEvaluacion }: SubjectCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [presentationMode, setPresentationMode] = useState(false);
  const [activeSlides, setActiveSlides] = useState<Slide[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [activeVideo, setActiveVideo] = useState<any>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const ITEMS_PER_PAGE = 10;
  
  const now = useMemo(() => new Date(), []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (presentationMode) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        setActiveSlideIndex((prev) => Math.min(prev + 1, activeSlides.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setActiveSlideIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Escape') {
        setPresentationMode(false);
      }
    }
  }, [presentationMode, activeSlides.length]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) setPresentationMode(false);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  useEffect(() => {
    if (presentationMode) {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }, [presentationMode]);

  const toggleFullscreen = useCallback(() => {
    const el = videoContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Auto-fullscreen cuando el alumno rota el celular a horizontal
  useEffect(() => {
    if (!activeVideo) return;
    const handleOrientationChange = () => {
      const isLandscape = window.matchMedia('(orientation: landscape)').matches;
      const el = videoContainerRef.current;
      if (!el) return;
      if (isLandscape && !document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
      } else if (!isLandscape && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
    const mq = window.matchMedia('(orientation: landscape)');
    mq.addEventListener('change', handleOrientationChange);
    return () => mq.removeEventListener('change', handleOrientationChange);
  }, [activeVideo]);

  const splitImageUrls = (urls: string) => {
    if (!urls) return [];
    return urls.split(/,(?=http|data:)/).map(u => u.trim()).filter(Boolean);
  };

  // Filtrar unidades que pertenecen a esta materia
  const unidadesDeMateria = useMemo(() => 
    unidades
      .filter(u => u.materia_id === materia.id)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0))
  , [unidades, materia.id]);

  const sortedExercises = useMemo(() => {
    const active = exercises.filter(ex => !ex.fecha_entrega || parseFechaLocal(ex.fecha_entrega) >= now)
      .sort((a, b) => {
        if (!a.fecha_entrega) return 1;
        if (!b.fecha_entrega) return -1;
        return parseFechaLocal(a.fecha_entrega).getTime() - parseFechaLocal(b.fecha_entrega).getTime();
      });
      
    const expired = exercises.filter(ex => ex.fecha_entrega && parseFechaLocal(ex.fecha_entrega) < now)
      .sort((a, b) => {
        if (!a.fecha_entrega) return 1;
        if (!b.fecha_entrega) return -1;
        return parseFechaLocal(b.fecha_entrega).getTime() - parseFechaLocal(a.fecha_entrega).getTime();
      });
      
    return [...active, ...expired];
  }, [exercises, now]);

  const getYouTubeId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const totalPages = Math.ceil(sortedExercises.length / ITEMS_PER_PAGE);
  const currentBatch = useMemo(() => 
    sortedExercises.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
  , [sortedExercises, currentPage]);

  return (
    <>
    <div className={cn(
      "bg-white border rounded-3xl overflow-hidden transition-all duration-500",
      isExpanded 
        ? "shadow-2xl shadow-primary/5 border-primary/20 ring-4 ring-primary/5 my-8 relative z-10" 
        : "shadow-sm border-border hover:border-primary/30 hover:shadow-md"
    )}>
      <div className="p-6 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6 md:gap-8 flex-1 w-full">
          <div className="h-14 w-14 md:h-20 md:w-20 rounded-3xl bg-secondary/30 flex items-center justify-center shrink-0 shadow-inner">
            {getSubjectIcon(materia.nombre)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5 md:mb-2">
              <h3 className="text-xl md:text-2xl lg:text-3xl font-black font-headline text-foreground tracking-tight leading-tight text-balance">{materia.nombre}</h3>
            </div>
            <div className="flex flex-col xl:flex-row xl:items-center gap-2 xl:gap-4 text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-widest">
              <span className="flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5 md:w-4 md:h-4 opacity-70 shrink-0" /><span className="text-balance">{materia.profesor}</span></span>
              <span className="hidden xl:block opacity-30 px-1 shrink-0">•</span>
              <span className="flex items-center gap-1.5 shrink-0"><Clock className="w-3.5 h-3.5 md:w-4 md:h-4 opacity-70 shrink-0" />Lunes, Miér, Vier</span>
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
              {isExpanded ? <><ChevronUp size={16} /> Contraer</> : "Abrir Aula"}
            </button>
          </div>
        </div>
      </div>

      {/* CONTENIDO EXPANDIBLE CON TABS */}
      <div className={cn(
        "grid transition-all duration-700 ease-in-out border-t border-border/50",
        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
      )}>
        <div className="overflow-hidden bg-muted/20">
          <Tabs defaultValue="ejercicios" className="w-full">
            <div className="px-6 md:px-10 pt-6">
              <TabsList className="bg-white/50 p-1 rounded-2xl border border-border h-auto gap-1">
                <TabsTrigger value="ejercicios" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-white font-bold text-[10px] md:text-xs uppercase tracking-widest">
                  📝 Ejercicios
                </TabsTrigger>
                <TabsTrigger value="materiales" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-white font-bold text-[10px] md:text-xs uppercase tracking-widest">
                  📂 Material de Estudio
                </TabsTrigger>
              </TabsList>
            </div>

            {/* PESTAÑA: EJERCICIOS */}
            <TabsContent value="ejercicios" className="px-6 py-6 md:px-10 md:py-8 space-y-6 outline-none">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] md:text-[12px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <CalendarClock size={14} className="text-primary" /> Actividades Evaluables
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {exercises.length === 0 ? (
                    <p className="col-span-full text-[10px] md:text-xs italic text-muted-foreground p-8 bg-white/50 rounded-2xl border border-dashed text-center">No hay actividades publicadas aún.</p>
                  ) : (
                    currentBatch.map((ex: any) => {
                      const deadline = ex.fecha_entrega ? parseFechaLocal(ex.fecha_entrega) : null;
                      const isExpired = deadline ? deadline < now : false;
                      const isPerfect = ex.bloqueado;
                      const isCompleted = ex.completado;

                      return (
                        <Link 
                          key={`exercise-${ex.id}`} 
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
                              {ex.tipo === 'sopa_letras' ? <ListTree className="w-4 h-4" /> : 
                               ex.tipo === 'crucigrama' ? <Layout className="w-4 h-4" /> :
                               ex.tipo === 'emparejamiento' ? <Activity className="w-4 h-4" /> :
                               ex.tipo === 'quiz' ? <FileCheck className="w-4 h-4" /> :
                               isExpired ? <Clock className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] md:text-[13px] font-bold text-slate-700 truncate">{ex.titulo}</span>
                                <span className="text-[9px] font-black opacity-30 px-1.5 py-0.5 rounded border border-current uppercase tracking-tighter">
                                  {ex.tipo?.replace(/_/g, ' ') || 'Ejercicio'}
                                </span>
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
            </TabsContent>

            {/* PESTAÑA: MATERIAL DE ESTUDIO (SOLO DESCARGA) */}
            <TabsContent value="materiales" className="px-6 py-6 md:px-10 md:py-8 outline-none">
              <div className="space-y-4">
                <h4 className="text-[10px] md:text-[12px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <FolderOpen size={14} className="text-primary" /> Temario y Documentos
                </h4>

                <Accordion type="single" collapsible className="w-full space-y-3">
                  {unidadesDeMateria.length === 0 ? (
                    <p className="text-[10px] md:text-xs italic text-muted-foreground p-8 bg-white/50 rounded-2xl border border-dashed text-center w-full">El profesor no ha organizado el temario aún.</p>
                  ) : (
                    unidadesDeMateria.map((unidad) => (
                      <AccordionItem key={`unit-${unidad.id}`} value={unidad.id} className="bg-white rounded-2xl px-5 border border-border shadow-sm overflow-hidden">
                        <AccordionTrigger className="hover:no-underline py-4">
                          <div className="flex items-center gap-3">
                            <span className="bg-primary/5 text-primary text-[10px] font-black px-2 py-0.5 rounded border border-primary/20 uppercase">Unidad {unidad.orden}</span>
                            <span className="font-bold text-sm md:text-base text-slate-800">{unidad.nombre}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4 pt-2">
                          <div className="space-y-6">
                            {!unidad.temas || unidad.temas.length === 0 ? (
                              <p className="text-[10px] text-muted-foreground italic px-2">No hay temas agregados.</p>
                            ) : (
                              unidad.temas.sort((a, b) => (a.orden || 0) - (b.orden || 0)).map((tema) => (
                                <div key={`topic-${tema.id}`} className="space-y-3">
                                  <h5 className="text-[11px] font-black text-slate-500 uppercase tracking-widest border-l-2 border-primary/30 pl-3 ml-1">{tema.titulo}</h5>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-4">
                                    {tema.slides && tema.slides.length > 0 && (
                                      <button
                                        onClick={() => {
                                          setActiveSlides(tema.slides || []);
                                          setActiveSlideIndex(0);
                                          setPresentationMode(true);
                                        }}
                                        className="col-span-full mb-2 flex items-center justify-between p-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl shadow-md transition-all group active:scale-[0.98]"
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                            <MonitorPlay className="w-5 h-5" />
                                          </div>
                                          <div className="flex flex-col text-left">
                                            <span className="text-sm font-bold truncate max-w-[200px] md:max-w-[400px]">Diapositivas de la Clase</span>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-100">{tema.slides.length} láminas</span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 pr-2 text-blue-50">
                                          <span className="text-xs font-black uppercase tracking-widest hidden sm:block">Presentar</span>
                                          <Play className="w-4 h-4 fill-current" />
                                        </div>
                                      </button>
                                    )}

                                    {tema.videos && tema.videos.length > 0 && (
                                      <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                        {tema.videos.map((vid: any, vIdx: number) => (
                                          <button
                                            key={`video-${tema.id}-${vIdx}`}
                                            onClick={() => setActiveVideo(vid)}
                                            className="flex items-start gap-3 p-3 bg-red-50/30 border border-red-100 rounded-2xl hover:border-red-400 hover:bg-white hover:shadow-xl transition-all group/vid active:scale-[0.98] text-left"
                                          >
                                            <div className="shrink-0 relative overflow-hidden rounded-xl shadow-lg group-hover/vid:scale-105 transition-transform w-[100px] aspect-video bg-red-600">
                                              {vid.url && getYouTubeId(vid.url) ? (
                                                <>
                                                  <img 
                                                    src={`https://img.youtube.com/vi/${getYouTubeId(vid.url)}/hqdefault.jpg`} 
                                                    alt={vid.titulo}
                                                    className="w-full h-full object-cover opacity-90 group-hover/vid:opacity-100 transition-opacity"
                                                  />
                                                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/vid:bg-black/0 transition-colors">
                                                    <div className="p-1 bg-red-600 rounded-full text-white shadow-xl">
                                                      <Play size={10} fill="currentColor" />
                                                    </div>
                                                  </div>
                                                </>
                                              ) : (
                                                <div className="w-full h-full flex items-center justify-center text-white">
                                                  <Youtube size={20} />
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex flex-col min-w-0 flex-1 pr-2">
                                              <span className="text-xs font-black text-slate-800 uppercase tracking-tight truncate line-clamp-1">{vid.titulo || 'Video de Clase'}</span>
                                              {vid.descripcion && (
                                                <span className="text-[9px] font-bold text-slate-500 leading-tight mt-0.5 line-clamp-2">{vid.descripcion}</span>
                                              )}
                                              <div className="flex items-center gap-1 mt-2 text-red-600 font-black text-[8px] uppercase tracking-widest opacity-70 group-hover/vid:opacity-100 transition-opacity">
                                                <Play size={8} fill="currentColor" /> Ver Video
                                              </div>
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    )}

                                    {!tema.recursos || tema.recursos.length === 0 ? (
                                      (!tema.slides || tema.slides.length === 0) && <p className="text-[10px] text-muted-foreground italic col-span-full">Sin recursos aún.</p>
                                    ) : (
                                      tema.recursos.map((res) => (
                                        <a 
                                          key={`resource-${res.id}`}
                                          href={res.url || '#'}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          download
                                          onClick={(e) => {
                                            if (!res.url) {
                                              e.preventDefault();
                                              return;
                                            }
                                          }}
                                          className={cn(
                                            "flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl transition-all group/res select-none",
                                            res.url 
                                              ? "hover:border-primary/40 hover:shadow-md cursor-pointer active:scale-[0.98]" 
                                              : "opacity-50 cursor-not-allowed"
                                          )}
                                        >
                                          <div className="shrink-0">
                                            {getResourceIcon(res.url, res.tipo)}
                                          </div>
                                          <div className="flex flex-col min-w-0 flex-1">
                                            <span className="text-xs font-bold text-slate-700 truncate" title={res.nombre}>
                                              {res.nombre}
                                            </span>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                              {getFileTypeLabel(res.url, res.tipo)}
                                            </span>
                                          </div>
                                          <div className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tighter shrink-0 transition-all shadow-sm",
                                            res.url
                                              ? "bg-emerald-50 text-emerald-600 group-hover/res:bg-emerald-600 group-hover/res:text-white"
                                              : "bg-slate-100 text-slate-400"
                                          )}>
                                            <Download size={12} strokeWidth={3} />
                                            <span className="hidden sm:inline">Descargar</span>
                                          </div>
                                        </a>
                                      ))
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))
                  )}
                </Accordion>
              </div>
            </TabsContent>

            {/* BARRA DE PROGRESO INFERIOR */}
            <div className="px-6 py-6 md:px-10 md:py-8 border-t border-border/20 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
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
                   <span>Próxima Evaluación: <strong className="text-foreground">{proximaEvaluacion ? new Date(proximaEvaluacion + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha asignada'}</strong></span>
                </div>
              </div>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
    
    {presentationMode && activeSlides.length > 0 && (
      <div 
        className={cn(
          "fixed inset-0 z-[100] grid grid-rows-[1fr_auto] overflow-hidden bg-gradient-to-br", 
          {
            'bg-slate-900 from-slate-900 to-blue-900 text-white': !activeSlides[activeSlideIndex]?.estilo || activeSlides[activeSlideIndex]?.estilo === 'azul',
            'bg-[#4c0519] from-[#4c0519] to-[#8B2332] text-white': activeSlides[activeSlideIndex]?.estilo === 'vino',
            'bg-[#064e3b] from-[#064e3b] to-[#1A4A3F] text-white': activeSlides[activeSlideIndex]?.estilo === 'verde',
            'bg-black from-black to-slate-900 text-white': activeSlides[activeSlideIndex]?.estilo === 'oscuro'
          }
        )}
      >
        <div className="absolute top-0 left-0 h-1.5 bg-blue-400/50 w-full z-50">
          <div 
            className="h-full bg-blue-400 transition-all duration-500 shadow-[0_0_15px_rgba(96,165,250,0.8)]" 
            style={{ width: `${((activeSlideIndex + 1) / activeSlides.length) * 100}%` }} 
          />
        </div>
        <div className="relative flex flex-col md:flex-row items-center justify-center gap-8 p-10 md:p-20 overflow-hidden">
          <div className="flex-1 flex flex-col justify-center max-w-full overflow-hidden">
            <h1 
              className="font-black uppercase tracking-tight mb-6 leading-tight" 
              style={{ fontSize: 'clamp(2rem, 8vw, 5rem)' }}
            >
              {activeSlides[activeSlideIndex]?.titulo}
            </h1>
            <div className="overflow-y-auto max-h-[50vh] pr-4 custom-scrollbar">
              <p 
                className="font-medium leading-relaxed opacity-90 whitespace-pre-wrap" 
                style={{ fontSize: 'clamp(1rem, 2.5vw, 2.2rem)' }}
              >
                {activeSlides[activeSlideIndex]?.contenido}
              </p>
            </div>
          </div>
          <div className="flex-1 w-full h-full max-h-[60vh] md:max-h-full flex items-center justify-center">
            {activeSlides[activeSlideIndex]?.imagen_url ? (
              <div className={cn(
                "grid gap-4 w-full h-full p-4", 
                splitImageUrls(activeSlides[activeSlideIndex]?.imagen_url || '').length === 1 ? "grid-cols-1" : "grid-cols-2"
              )}>
                {splitImageUrls(activeSlides[activeSlideIndex]?.imagen_url || '').map((url, i) => (
                  <div key={i} className="relative w-full h-full overflow-hidden rounded-2xl shadow-2xl border border-white/10">
                    <img src={url} alt="Slide" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full aspect-video flex flex-col items-center justify-center bg-white/5 rounded-3xl border-2 border-dashed border-white/10 opacity-30">
                <ImageIcon size={100} />
              </div>
            )}
          </div>
        </div>
        <div className="py-3 px-10 flex items-center justify-between bg-black/30 backdrop-blur-2xl border-t border-white/5 z-[110]">
          <div className="flex gap-4">
            <Button 
              variant="ghost" 
              className="h-12 w-12 rounded-full text-white hover:bg-white/10" 
              onClick={() => setActiveSlideIndex(Math.max(0, activeSlideIndex - 1))} 
              disabled={activeSlideIndex === 0}
            >
              <ChevronLeft size={32} />
            </Button>
            <div className="flex items-center px-4 text-xl font-black tabular-nums tracking-widest text-white/40">
              <span className="text-white">{activeSlideIndex + 1}</span> / {activeSlides.length}
            </div>
            <Button 
              variant="ghost" 
              className="h-12 w-12 rounded-full text-white hover:bg-white/10" 
              onClick={() => setActiveSlideIndex(Math.min(activeSlideIndex + 1, activeSlides.length - 1))} 
              disabled={activeSlideIndex === activeSlides.length - 1}
            >
              <ChevronRight size={32} />
            </Button>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
              <img src={LOGO_URL} alt="Logo" className="h-14 w-auto object-contain" />
              <span className="hidden lg:block text-[10px] font-black uppercase tracking-[0.3em] text-white/40">IEEZ Instituto Educativo Emiliano Zapata</span>
            </div>
            <Button 
              variant="outline" 
              className="h-10 px-6 rounded-xl font-black uppercase tracking-widest bg-red-600/20 border-red-600/30 text-red-100 hover:bg-red-600 shadow-lg" 
              onClick={() => setPresentationMode(false)}
            >
              <X size={18} className="mr-2" /> Salir (Esc)
            </Button>
          </div>
        </div>
      </div>
    )}
      {/* REPRODUCTOR DE VIDEO MODAL */}
      <Dialog open={!!activeVideo} onOpenChange={(open) => !open && setActiveVideo(null)}>
        <DialogContent className="max-w-4xl w-full sm:w-[95vw] p-0 overflow-hidden bg-black border-none gap-0 rounded-none sm:rounded-[32px] !translate-x-[-50%]">
          <DialogHeader className="p-4 sm:p-6 bg-white shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="h-10 w-10 shrink-0 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-200 animate-pulse-slow">
                  <Youtube size={20} />
                </div>
                <div className="flex flex-col min-w-0">
                  <DialogTitle className="text-sm sm:text-base font-black uppercase tracking-tight text-slate-800 truncate">{activeVideo?.titulo || 'Reproduciendo Video'}</DialogTitle>
                  <div className="flex items-center gap-2 mt-0.5">
                    <img src={LOGO_URL} alt="Logo IEEZ" className="h-4 sm:h-5 w-auto object-contain shrink-0" />
                    <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] truncate">Instituto Educativo Emiliano Zapata</p>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0 rounded-full hover:bg-slate-100 ml-2" onClick={() => setActiveVideo(null)}>
                <X size={20} />
              </Button>
            </div>
          </DialogHeader>
          
          <div ref={videoContainerRef} className="aspect-video w-full bg-slate-900 flex items-center justify-center relative group">
            {activeVideo && getYouTubeId(activeVideo.url) ? (
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${getYouTubeId(activeVideo.url)}?autoplay=1`}
                title={activeVideo.titulo}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full shadow-2xl"
              ></iframe>
            ) : (
              <div className="flex flex-col items-center gap-4 text-white">
                <AlertCircle size={48} className="text-red-500" />
                <div className="text-center">
                  <p className="font-black uppercase tracking-widest text-sm">No se pudo cargar el video</p>
                  <p className="text-xs text-slate-400 mt-1">El formato de la URL no es válido para el reproductor integrado.</p>
                  <Button 
                    variant="link" 
                    className="text-red-400 hover:text-red-300 font-bold uppercase text-[10px] mt-4"
                    onClick={() => window.open(activeVideo?.url, '_blank')}
                  >
                    Ver en sitio externo <ExternalLink size={12} className="ml-2" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Botón personalizado de pantalla completa — visible solo en móviles */}
          {activeVideo && getYouTubeId(activeVideo.url) && (
            <div className="flex sm:hidden items-center justify-start pl-3 py-3 bg-slate-900">
              <button
                onClick={toggleFullscreen}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600/80 hover:bg-red-600 active:scale-95 text-white rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-red-900/50"
              >
                <Maximize size={14} />
                Ver en Pantalla Completa
              </button>
            </div>
          )}

          {activeVideo?.descripcion && (
            <div className="p-6 bg-white border-t">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2 block">Información del Video</label>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">{activeVideo.descripcion}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
