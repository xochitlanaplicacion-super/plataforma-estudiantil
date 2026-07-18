'use client';

import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, CheckCircle2, MonitorPlay, ExternalLink, Youtube, Maximize, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import TrackedVideoPlayer from '@/components/shared/TrackedVideoPlayer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { useInstitucion } from '@/hooks/use-institucion';

const LOGO_FALLBACK = '/images/logo_placeholder.svg';

interface VideoProgress {
  video_url: string;
  progreso_segundos: number;
  duracion_total: number;
  completado: boolean;
}

interface Video {
  titulo: string;
  url: string;
  descripcion?: string;
  tema_id: string;
  materia_nombre: string;
  unidad_nombre: string;
  tema_titulo: string;
}

interface VideoCarouselProps {
  unidades: any[];
  videoProgress: VideoProgress[];
}

export default function VideoCarousel({ unidades, videoProgress }: VideoCarouselProps) {
  const { config: inst } = useInstitucion();
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [activeProgress, setActiveProgress] = useState<number>(0);
  const [filtroMateria, setFiltroMateria] = useState<string>('Todas');
  const [filtroUnidad, setFiltroUnidad] = useState<string>('Todas');
  const [filtroTema, setFiltroTema] = useState<string>('Todos');
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const getYouTubeId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const toggleFullscreen = () => {
    const el = videoContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Flatten videos from unidades
  const allVideos: Video[] = [];
  unidades.forEach((u) => {
    u.temas?.forEach((t: any) => {
      t.videos?.forEach((v: any) => {
        allVideos.push({
          ...v,
          tema_id: t.id,
          materia_nombre: u.materias?.nombre || 'General',
          unidad_nombre: u.titulo || u.nombre || 'Unidad',
          tema_titulo: t.titulo
        });
      });
    });
  });

  if (allVideos.length === 0) return null;

  const progressMap = new Map<string, VideoProgress>();
  videoProgress.forEach(vp => {
    // Only track by URL for simplicity here
    progressMap.set(vp.video_url, vp);
  });

  // Handle cascading filter resets
  const handleFiltroMateriaChange = (materia: string) => {
    setFiltroMateria(materia);
    setFiltroUnidad('Todas');
    setFiltroTema('Todos');
  };

  const handleFiltroUnidadChange = (unidad: string) => {
    setFiltroUnidad(unidad);
    setFiltroTema('Todos');
  };

  const uniqueMaterias = Array.from(new Set(allVideos.map(v => v.materia_nombre)));
  
  const uniqueUnidades = Array.from(new Set(
    allVideos
      .filter(v => filtroMateria === 'Todas' || v.materia_nombre === filtroMateria)
      .map(v => v.unidad_nombre)
  ));

  const uniqueTemas = Array.from(new Set(
    allVideos
      .filter(v => filtroMateria === 'Todas' || v.materia_nombre === filtroMateria)
      .filter(v => filtroUnidad === 'Todas' || v.unidad_nombre === filtroUnidad)
      .map(v => v.tema_titulo)
  ));

  // Group videos based on filters
  const continueWatching: Video[] = [];
  const byMateria: Record<string, Video[]> = {};

  allVideos.forEach(v => {
    const passMateria = filtroMateria === 'Todas' || v.materia_nombre === filtroMateria;
    const passUnidad = filtroUnidad === 'Todas' || v.unidad_nombre === filtroUnidad;
    const passTema = filtroTema === 'Todos' || v.tema_titulo === filtroTema;

    if (passMateria && passUnidad && passTema) {
      const prog = progressMap.get(v.url);
      if (prog && !prog.completado && prog.progreso_segundos > 0) {
        continueWatching.push(v);
      }
      
      if (!byMateria[v.materia_nombre]) {
        byMateria[v.materia_nombre] = [];
      }
      byMateria[v.materia_nombre].push(v);
    }
  });

  const handlePlayVideo = (video: Video) => {
    const prog = progressMap.get(video.url);
    setActiveProgress(prog?.progreso_segundos || 0);
    setActiveVideo(video);
  };

  // renderRow extracted to VideoRow component below

  return (
    <div className="w-full space-y-2 mt-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <MonitorPlay className="w-6 h-6 text-red-600" />
          <h3 className="text-xl md:text-2xl font-black font-headline text-slate-800">Videoteca</h3>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select 
            value={filtroMateria} 
            onChange={(e) => handleFiltroMateriaChange(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 text-xs md:text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block p-2 md:p-2.5 shadow-sm font-medium flex-1 md:flex-none cursor-pointer"
          >
            <option value="Todas">Todas las materias</option>
            {uniqueMaterias.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          
          <select 
            value={filtroUnidad} 
            onChange={(e) => handleFiltroUnidadChange(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 text-xs md:text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block p-2 md:p-2.5 shadow-sm font-medium flex-1 md:flex-none cursor-pointer"
            disabled={uniqueUnidades.length === 0}
          >
            <option value="Todas">Todas las unidades</option>
            {uniqueUnidades.map(u => <option key={u} value={u}>{u}</option>)}
          </select>

          <select 
            value={filtroTema} 
            onChange={(e) => setFiltroTema(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 text-xs md:text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block p-2 md:p-2.5 shadow-sm font-medium flex-1 md:flex-none cursor-pointer"
            disabled={uniqueTemas.length === 0}
          >
            <option value="Todos">Todos los temas</option>
            {uniqueTemas.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      
      {continueWatching.length > 0 && (
        <VideoRow 
          title="Continuar Viendo" 
          videos={continueWatching} 
          isContinueWatching={true} 
          progressMap={progressMap}
          handlePlayVideo={handlePlayVideo}
          getYouTubeId={getYouTubeId}
        />
      )}
      
      {Object.entries(byMateria).map(([materia, videos]) => (
        <VideoRow 
          key={materia}
          title={materia} 
          videos={videos} 
          progressMap={progressMap}
          handlePlayVideo={handlePlayVideo}
          getYouTubeId={getYouTubeId}
        />
      ))}

      <Dialog open={!!activeVideo} onOpenChange={(open) => !open && setActiveVideo(null)}>
        <DialogContent className="max-w-5xl w-full sm:w-[95vw] p-0 overflow-hidden bg-black border-none gap-0 rounded-none sm:rounded-[32px] !translate-x-[-50%]">
          <DialogHeader className="p-4 sm:p-6 bg-white shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="h-10 w-10 shrink-0 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-200 animate-pulse-slow">
                  <Youtube size={20} />
                </div>
                <div className="flex flex-col min-w-0">
                  <DialogTitle className="text-sm sm:text-base font-black uppercase tracking-tight text-slate-800 truncate">{activeVideo?.titulo || 'Reproduciendo Video'}</DialogTitle>
                  <div className="flex items-center gap-2 mt-0.5 text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                    <span>{activeVideo?.materia_nombre}</span> • <span>{activeVideo?.unidad_nombre}</span>
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
              <TrackedVideoPlayer
                videoId={getYouTubeId(activeVideo.url)!}
                videoUrl={activeVideo.url}
                temaId={activeVideo.tema_id}
                initialProgressSeconds={activeProgress}
                onClose={() => setActiveVideo(null)}
              />
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

          {activeVideo && getYouTubeId(activeVideo.url) && (
            <div className="flex sm:hidden items-center justify-start pl-3 py-3 bg-slate-900">
              <button
                onClick={toggleFullscreen}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600/80 hover:bg-red-600 active:scale-95 text-white rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-red-900/50"
              >
                <Maximize size={14} />
                Pantalla Completa
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VideoRow({ 
  title, 
  videos, 
  isContinueWatching = false, 
  progressMap, 
  handlePlayVideo, 
  getYouTubeId 
}: { 
  title: string; 
  videos: Video[]; 
  isContinueWatching?: boolean; 
  progressMap: Map<string, VideoProgress>; 
  handlePlayVideo: (v: Video) => void;
  getYouTubeId: (url: string) => string | null;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (videos.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const amount = scrollContainerRef.current.clientWidth * 0.75;
      scrollContainerRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    }
  };

  return (
    <div className="mb-8 relative group" key={title}>
      <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3 px-1">{title}</h4>
      
      <div className="relative">
        <button 
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-white via-white/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-start hover:w-16"
        >
          <div className="bg-white rounded-full p-2 shadow-lg -ml-4 border border-slate-100">
            <ChevronLeft size={24} className="text-slate-700" />
          </div>
        </button>
        
        <div 
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4 pt-2 px-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {videos.map((vid, idx) => {
            const ytId = getYouTubeId(vid.url);
            const prog = progressMap.get(vid.url);
            const isCompleted = prog?.completado;
            const percent = prog ? Math.min(100, (prog.progreso_segundos / (prog.duracion_total || 1)) * 100) : 0;

            return (
              <div 
                key={`${vid.tema_id}-${idx}`}
                className="shrink-0 snap-start relative group/card cursor-pointer w-[280px] md:w-[320px] transition-all duration-300 hover:-translate-y-2"
                onClick={() => handlePlayVideo(vid)}
              >
                <div className="aspect-video rounded-xl overflow-hidden bg-slate-900 relative shadow-md group-hover/card:shadow-xl transition-shadow border border-slate-200 group-hover/card:border-red-200">
                  {ytId ? (
                    <img 
                      src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                      alt={vid.titulo}
                      className="w-full h-full object-cover opacity-80 group-hover/card:opacity-100 transition-opacity"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500">
                      <MonitorPlay size={32} />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/40 group-hover/card:bg-black/10 transition-colors flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-red-600/90 text-white flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all scale-75 group-hover/card:scale-100 shadow-xl">
                      <Play size={20} className="ml-1" fill="currentColor" />
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {prog && !isCompleted && percent > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/50 backdrop-blur-sm">
                      <div className="h-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.8)]" style={{ width: `${percent}%` }} />
                    </div>
                  )}
                  
                  {/* Completion Checkmark */}
                  {isCompleted && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1 shadow-lg">
                      <CheckCircle2 size={16} />
                    </div>
                  )}
                </div>
                
                <div className="mt-3 px-1">
                  <h5 className="font-bold text-slate-800 text-sm line-clamp-1 group-hover/card:text-red-600 transition-colors">{vid.titulo}</h5>
                  <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{vid.unidad_nombre} • {vid.tema_titulo}</p>
                  {isContinueWatching && prog && (
                    <p className="text-[10px] text-red-500 font-bold uppercase mt-1">
                      Restan {Math.max(0, Math.floor(((prog.duracion_total || 0) - prog.progreso_segundos) / 60))} min
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button 
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-white via-white/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end hover:w-16"
        >
          <div className="bg-white rounded-full p-2 shadow-lg -mr-4 border border-slate-100">
            <ChevronRight size={24} className="text-slate-700" />
          </div>
        </button>
      </div>
    </div>
  );
}
