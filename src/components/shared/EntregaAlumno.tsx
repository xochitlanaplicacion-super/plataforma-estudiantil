'use client';

import React, { useState, useRef, useTransition } from 'react';
import { Upload, FileText, FileSpreadsheet, File, CheckCircle2, Clock, AlertTriangle, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { subirEntregaAlumno } from '@/lib/actions/entregas';

interface EntregaAlumnoProps {
  ejercicioId: string;
  entregaExistente?: {
    archivo_nombre?: string | null;
    caduca_el?: string | null;
    primer_envio_en?: string | null;
    calificacion_manual?: number | null;
  } | null;
}

const MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.ms-excel': 'Excel (.xls)',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (.xlsx)',
  'text/csv': 'CSV',
  'application/msword': 'Word (.doc)',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (.docx)',
  'application/vnd.ms-powerpoint': 'PowerPoint (.ppt)',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint (.pptx)',
};

const ALLOWED_MIME = Object.keys(MIME_LABELS);
const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function getIconForName(nombre: string) {
  const lower = nombre.toLowerCase();
  if (lower.endsWith('.pdf')) return <FileText className="w-8 h-8 text-red-500" />;
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) return <FileSpreadsheet className="w-8 h-8 text-emerald-500" />;
  return <File className="w-8 h-8 text-blue-500" />;
}

function getDiasRestantes(caduca_el: string): { dias: number; horas: number; pct: number } {
  const ahora = Date.now();
  const caduca = new Date(caduca_el).getTime();
  const totalMs = 5 * 24 * 60 * 60 * 1000;
  const restanteMs = Math.max(0, caduca - ahora);
  const dias = Math.floor(restanteMs / (1000 * 60 * 60 * 24));
  const horas = Math.floor((restanteMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const pct = Math.min(100, (restanteMs / totalMs) * 100);
  return { dias, horas, pct };
}

export function EntregaAlumno({ ejercicioId, entregaExistente }: EntregaAlumnoProps) {
  const [isPending, startTransition] = useTransition();
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [entrega, setEntrega] = useState(entregaExistente);
  const inputRef = useRef<HTMLInputElement>(null);

  const yaCalificado = !!entrega?.calificacion_manual;
  const tieneArchivo = !!entrega?.archivo_nombre;
  const { dias, horas, pct } = entrega?.caduca_el 
    ? getDiasRestantes(entrega.caduca_el) 
    : { dias: 0, horas: 0, pct: 0 };

  const validarArchivo = (file: File): string | null => {
    if (file.size > MAX_SIZE_BYTES) return `El archivo supera ${MAX_SIZE_MB}MB (tamaño: ${(file.size / 1024 / 1024).toFixed(1)}MB)`;
    if (!ALLOWED_MIME.includes(file.type)) return 'Tipo no permitido. Solo PDF, Excel, CSV, Word o PowerPoint.';
    return null;
  };

  const handleFile = (file: File) => {
    const err = validarArchivo(file);
    if (err) { setErrorLocal(err); setArchivoSeleccionado(null); return; }
    setErrorLocal(null);
    setArchivoSeleccionado(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubir = () => {
    if (!archivoSeleccionado) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append('archivo', archivoSeleccionado);
      fd.append('ejercicioId', ejercicioId);
      const res = await subirEntregaAlumno(fd);
      if (res.error) {
        setErrorLocal(res.error);
      } else {
        setExito(true);
        setEntrega({
          ...entrega,
          archivo_nombre: archivoSeleccionado.name,
          caduca_el: res.caduca_el,
          primer_envio_en: entrega?.primer_envio_en || new Date().toISOString(),
        });
        setArchivoSeleccionado(null);
      }
    });
  };

  return (
    <div className="mt-10 space-y-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="p-2 bg-primary/10 rounded-xl">
          <Upload className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Tu Entrega</h3>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
            PDF, Excel, CSV, Word o PowerPoint · Máx {MAX_SIZE_MB}MB · 1 archivo
          </p>
        </div>
      </div>

      {/* ESTADO: YA CALIFICADO */}
      {yaCalificado && (
        <div className="flex flex-col items-center gap-4 p-8 bg-emerald-50 border-2 border-emerald-200 rounded-3xl text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500" />
          <div>
            <p className="font-black text-emerald-800 text-xl uppercase">Actividad Calificada</p>
            <p className="text-emerald-600 font-bold mt-1">
              Tu calificación: <span className="text-3xl font-black">{entrega?.calificacion_manual}</span> / 10
            </p>
            <p className="text-xs text-emerald-500 mt-2 uppercase tracking-wider">El profesor ha revisado y evaluado tu entrega.</p>
          </div>
        </div>
      )}

      {/* ESTADO: ARCHIVO ENTREGADO, PENDIENTE DE CALIFICAR */}
      {!yaCalificado && tieneArchivo && (
        <div className="p-5 bg-blue-50 border-2 border-blue-200 rounded-2xl space-y-4">
          <div className="flex items-center gap-4">
            {getIconForName(entrega?.archivo_nombre || '')}
            <div className="flex-1 min-w-0">
              <p className="font-black text-slate-800 truncate">{entrega?.archivo_nombre}</p>
              <p className="text-xs text-slate-500 font-semibold">Entregado · Pendiente de calificación</p>
            </div>
          </div>
          
          {/* Barra de caducidad */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Tiempo antes de eliminación automática
              </span>
              <span className={cn(
                "text-[10px] font-black uppercase",
                pct > 40 ? "text-emerald-600" : pct > 20 ? "text-amber-600" : "text-red-600"
              )}>
                {dias}d {horas}h
              </span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  pct > 40 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-red-500"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Opción de resubida */}
          {exito ? (
            <div className="flex items-center gap-2 text-emerald-600 font-black text-sm">
              <CheckCircle2 className="w-4 h-4" /> ¡Archivo actualizado correctamente!
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 font-semibold">
              ⚠ Si subes otro archivo, reemplazará al anterior. La fecha de caducidad{' '}
              <strong className="text-slate-600">no se reiniciará</strong>.
            </p>
          )}
        </div>
      )}

      {/* FORMULARIO DE SUBIDA (excepto si ya fue calificado) */}
      {!yaCalificado && (
        <div className="space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all",
              isDragging
                ? "border-primary bg-primary/5 scale-[1.01] shadow-lg"
                : archivoSeleccionado
                ? "border-emerald-400 bg-emerald-50"
                : "border-slate-200 hover:border-primary/40 hover:bg-slate-50/50"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={ALLOWED_MIME.join(',')}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {archivoSeleccionado ? (
              <>
                {getIconForName(archivoSeleccionado.name)}
                <div className="text-center">
                  <p className="font-black text-slate-800">{archivoSeleccionado.name}</p>
                  <p className="text-xs text-slate-400">{(archivoSeleccionado.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setArchivoSeleccionado(null); setErrorLocal(null); }}
                  className="absolute top-3 right-3 p-1 bg-slate-200 rounded-full hover:bg-red-100 hover:text-red-600 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <div className="p-4 bg-slate-100 rounded-2xl">
                  <Upload className="w-8 h-8 text-slate-400" />
                </div>
                <div className="text-center">
                  <p className="font-black text-slate-600 text-sm">Arrastra tu archivo aquí o haz clic</p>
                  <p className="text-[11px] text-slate-400 mt-1">PDF · Excel · CSV · Word · PowerPoint · máx 5MB</p>
                </div>
              </>
            )}
          </div>

          {/* Error de validación */}
          {errorLocal && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {errorLocal}
            </div>
          )}

          {/* Botón de subida */}
          <button
            onClick={handleSubir}
            disabled={!archivoSeleccionado || isPending}
            className={cn(
              "w-full h-14 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all shadow-lg",
              archivoSeleccionado && !isPending
                ? "bg-primary text-white hover:opacity-90 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            )}
          >
            {isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Subiendo archivo...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                {tieneArchivo ? 'Actualizar Entrega' : 'Enviar Entrega'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
