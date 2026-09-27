'use client';

import React, { useEffect, useState, useRef, useTransition } from 'react';
import { Upload, FileText, FileSpreadsheet, File as FileIcon, CheckCircle2, Clock, AlertTriangle, Loader2, X, Camera, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { confirmarCargaEntregaAlumno, prepararCargaEntregaAlumno, confirmarCargaFotosAlumno, prepararCargaFotosAlumno } from '@/lib/actions/entregas';
import { AccionesArchivoEntrega } from '@/components/shared/AccionesArchivoEntrega';
import { GaleriaEntrega } from '@/components/shared/GaleriaEntrega';
import { MAX_GALLERY_BYTES, MAX_SUBMISSION_PHOTOS, isSubmissionPhotoFile, prepareSubmissionPhoto, readSubmissionPhotos } from '@/lib/storage/photo-gallery';
import { createClient } from '@/lib/supabase/client';
import {
  ACADEMIC_UPLOAD_MAX_MB,
  STUDENT_SUBMISSION_ACCEPT,
  academicUploadValidationMessage,
} from '@/lib/storage/academic-uploads';

interface EntregaAlumnoProps {
  ejercicioId: string;
  entregaExistente?: {
    archivo_nombre?: string | null;
    archivo_path?: string | null;
    fotos_json?: unknown;
    caduca_el?: string | null;
    primer_envio_en?: string | null;
    calificacion?: number | null;
  } | null;
  isPreview?: boolean;
}

function getIconForName(nombre: string) {
  const lower = nombre.toLowerCase();
  if (lower.endsWith('.pdf')) return <FileText className="w-8 h-8 text-red-500" />;
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) return <FileSpreadsheet className="w-8 h-8 text-emerald-500" />;
  if (/\.(jpe?g|png|webp|heic|heif)$/.test(lower)) return <ImageIcon className="w-8 h-8 text-primary" />;
  return <FileIcon className="w-8 h-8 text-blue-500" />;
}

function getDiasRestantes(caduca_el: string): { dias: number; horas: number; pct: number } {
  const ahora = Date.now();
  const caduca = new Date(caduca_el).getTime();
  const totalMs = 10 * 24 * 60 * 60 * 1000;
  const restanteMs = Math.max(0, caduca - ahora);
  const dias = Math.floor(restanteMs / (1000 * 60 * 60 * 24));
  const horas = Math.floor((restanteMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const pct = Math.min(100, (restanteMs / totalMs) * 100);
  return { dias, horas, pct };
}

function VistaPreviaFoto({ file, index }: { file: File; index: number }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // Blob local ya comprimido: no debe pasar por el optimizador remoto de Next.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={`Vista previa de la foto ${index + 1}`}
    className="h-full w-full rounded-lg object-cover" />
    : <ImageIcon className="h-8 w-8 text-slate-400" aria-hidden="true" />;
}

function CamaraContinua({ photos, error, onCapture, onClose, onNativeCamera }: {
  photos: File[];
  error: string | null;
  onCapture: (file: File) => Promise<void>;
  onClose: () => void;
  onNativeCamera: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureNumberRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const videoElement = videoRef.current;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Este navegador no permite mantener la cámara abierta desde la página.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
        });
        if (!mounted) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (mounted) setCameraError('No se pudo abrir la cámara. Revisa el permiso del navegador o usa la cámara del dispositivo.');
      }
    };
    void start();
    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoElement) videoElement.srcObject = null;
    };
  }, []);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !ready || busy || photos.length >= MAX_SUBMISSION_PHOTOS) return;
    setCaptureError(null);
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context || !canvas.width || !canvas.height) throw new Error('Espera a que la cámara termine de iniciar.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) throw new Error('No se pudo capturar la foto.');
      captureNumberRef.current += 1;
      await onCapture(new File([blob], `tarea-${Date.now()}-${captureNumberRef.current}.jpg`, { type: 'image/jpeg' }));
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'No se pudo capturar la foto.');
    } finally { setBusy(false); }
  };

  return <div role="dialog" aria-modal="true" aria-label="Tomar varias fotos" className="fixed inset-0 z-50 flex flex-col bg-slate-950 p-4 text-white sm:p-8">
    <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 pb-3">
      <div><h4 className="text-lg font-bold">Tomar fotos seguidas</h4><p className="text-sm text-slate-300">{photos.length}/{MAX_SUBMISSION_PHOTOS} fotos listas · toca el botón para cada foto</p></div>
      <button type="button" onClick={onClose} aria-label="Cerrar cámara" className="rounded-full bg-white/15 p-2"><X className="h-5 w-5" /></button>
    </div>
    <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 items-center justify-center overflow-hidden rounded-2xl bg-slate-900">
      {cameraError ? <p className="p-5 text-center text-sm" role="alert">{cameraError}</p> :
        <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={() => setReady(true)} className="max-h-full w-full object-contain" />}
    </div>
    {photos.length > 0 && <div className="mx-auto mt-3 flex w-full max-w-xl gap-2 overflow-x-auto" aria-label="Fotos preparadas">
      {photos.map((file, index) => <div key={`${file.name}-${index}`} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-800"><VistaPreviaFoto file={file} index={index} /></div>)}
    </div>}
    {(error || captureError) && <p className="mx-auto mt-3 w-full max-w-xl rounded-lg bg-red-950 p-2 text-sm" role="alert">{error || captureError}</p>}
    <div className="mx-auto mt-4 flex w-full max-w-xl flex-col gap-3 sm:flex-row">
      {!cameraError && <button type="button" onClick={() => void capture()} disabled={!ready || busy || photos.length >= MAX_SUBMISSION_PHOTOS}
        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white font-bold text-slate-950 disabled:opacity-50">
        <Camera className="h-5 w-5" /> {busy ? 'Preparando foto…' : photos.length >= MAX_SUBMISSION_PHOTOS ? 'Límite de fotos' : 'Tomar foto'}
      </button>}
      <button type="button" onClick={cameraError ? onNativeCamera : onClose}
        className="h-12 flex-1 rounded-xl border border-white/40 px-4 font-semibold">
        {cameraError ? 'Usar cámara del dispositivo (una foto por toma)' : 'Terminar y revisar fotos'}
      </button>
    </div>
  </div>;
}

export function EntregaAlumno({ ejercicioId, entregaExistente, isPreview }: EntregaAlumnoProps) {
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const fotosRef = useRef<File[]>([]);
  const procesandoRef = useRef(false);
  const subiendoRef = useRef(false);
  const [subiendo, setSubiendo] = useState(false);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [procesandoFotos, setProcesandoFotos] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [entrega, setEntrega] = useState(entregaExistente);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

  const actualizarFotos = (next: File[] | ((current: File[]) => File[])) => {
    const updated = typeof next === 'function' ? next(fotosRef.current) : next;
    fotosRef.current = updated;
    setFotos(updated);
  };

  const yaCalificado = entrega?.calificacion !== null && entrega?.calificacion !== undefined;
  const tieneArchivo = !!entrega?.archivo_nombre;
  const fotosConfirmadas = readSubmissionPhotos(entrega?.fotos_json).length;
  const bloqueado = isPending || subiendo || procesandoFotos;
  const { dias, horas, pct } = entrega?.caduca_el 
    ? getDiasRestantes(entrega.caduca_el) 
    : { dias: 0, horas: 0, pct: 0 };

  const validarArchivo = (file: File): string | null => {
    return academicUploadValidationMessage(file, { allowImages: true });
  };

  const handleFile = (file: File) => {
    if (subiendoRef.current || procesandoRef.current) return;
    if (isSubmissionPhotoFile(file)) { void addPhotos([file]); return; }
    if (fotosRef.current.length) {
      setErrorLocal('Ya tienes fotos preparadas. Quítalas antes de elegir un documento.'); return;
    }
    const err = validarArchivo(file);
    if (err) { setErrorLocal(err); return; }
    setErrorLocal(null);
    setArchivoSeleccionado(file);
  };

  const addPhotos = async (selected: FileList | File[] | null) => {
    if (!selected?.length) return;
    if (subiendoRef.current) return;
    if (archivoSeleccionado) {
      setErrorLocal('Ya tienes un documento preparado. Quítalo antes de añadir fotos.'); return;
    }
    if (procesandoRef.current) {
      setErrorLocal('Espera a que terminen de prepararse las fotos anteriores.'); return;
    }
    if (fotosRef.current.length + selected.length > MAX_SUBMISSION_PHOTOS) {
      setErrorLocal(`Máximo ${MAX_SUBMISSION_PHOTOS} fotos por entrega.`); return;
    }
    procesandoRef.current = true;
    setProcesandoFotos(true);
    try {
      const next: File[] = [];
      for (const file of Array.from(selected)) next.push(await prepareSubmissionPhoto(file));
      const combined = [...fotosRef.current, ...next];
      if (combined.reduce((sum, item) => sum + item.size, 0) > MAX_GALLERY_BYTES) {
        throw new Error('La galería supera 20 MB. Elimina algunas fotos.');
      }
      actualizarFotos(combined);
      setErrorLocal(null);
    } catch (error) {
      setErrorLocal(error instanceof Error ? error.message : 'No se pudieron procesar las fotos.');
    } finally { procesandoRef.current = false; setProcesandoFotos(false); }
  };

  const handleSelectedFiles = (selected: FileList | null) => {
    if (!selected?.length) return;
    const files = Array.from(selected);
    if (files.every(isSubmissionPhotoFile)) void addPhotos(files);
    else if (files.length === 1) handleFile(files[0]);
    else setErrorLocal('Elige hasta 15 fotos o un solo documento; no se pueden mezclar.');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (subiendoRef.current || procesandoRef.current) return;
    handleSelectedFiles(e.dataTransfer.files);
  };

  const handleSubir = () => {
    if ((!archivoSeleccionado && !fotosRef.current.length) || procesandoRef.current || subiendoRef.current) return;
    subiendoRef.current = true;
    setSubiendo(true);
    const fotosParaSubir = fotosRef.current;
    startTransition(async () => {
      setErrorLocal(null);
      try {
        if (fotosParaSubir.length) {
          const metadata = fotosParaSubir.map((file) => ({ ejercicioId, archivoNombre: file.name,
            archivoTipo: file.type, archivoTamano: file.size }));
          const prepared = await prepararCargaFotosAlumno(metadata);
          if (!prepared.uploads || !prepared.uploadIntentId) {
            setErrorLocal(prepared.error || 'No se pudo preparar la galería.'); return;
          }
          if (prepared.uploads.length !== fotosParaSubir.length) {
            setErrorLocal('No se prepararon todas las fotos. No se guardó la entrega.'); return;
          }
          for (let index = 0; index < fotosParaSubir.length; index++) {
            const upload = prepared.uploads[index];
            const { error } = await supabase.storage.from('entregas-alumnos')
              .uploadToSignedUrl(upload.path, upload.token, fotosParaSubir[index], { contentType: 'image/jpeg' });
            if (error) { setErrorLocal(`No se pudo subir la foto ${index + 1}: ${error.message}`); return; }
          }
          const saved = await confirmarCargaFotosAlumno({ ejercicioId, uploadIntentId: prepared.uploadIntentId, fotos: metadata });
          if (saved.error) { setErrorLocal(saved.error); return; }
          if (readSubmissionPhotos(saved.fotos_json).length !== fotosParaSubir.length) {
            setErrorLocal('El servidor no confirmó todas las fotos. Actualiza la página y revisa la entrega antes de volver a intentar.'); return;
          }
          setEntrega({ ...entrega, archivo_nombre: `${fotosParaSubir.length} fotos`, archivo_path: saved.archivo_path,
            fotos_json: saved.fotos_json, caduca_el: saved.caduca_el,
            primer_envio_en: entrega?.primer_envio_en || new Date().toISOString() });
          actualizarFotos([]); setExito(true); return;
        }
        if (!archivoSeleccionado) return;
        const metadata = {
          ejercicioId,
          archivoNombre: archivoSeleccionado.name,
          archivoTipo: archivoSeleccionado.type,
          archivoTamano: archivoSeleccionado.size,
        };
        const prepared = await prepararCargaEntregaAlumno(metadata);
        if (prepared.error || !prepared.uploadIntentId || !prepared.archivoPath || !prepared.token || !prepared.contentType) {
          setErrorLocal(prepared.error || 'No se pudo preparar la entrega.');
          return;
        }
        const { error: uploadError } = await supabase.storage
          .from('entregas-alumnos')
          .uploadToSignedUrl(prepared.archivoPath, prepared.token, archivoSeleccionado, {
            contentType: prepared.contentType,
          });
        if (uploadError) {
          setErrorLocal(`No se pudo subir el archivo: ${uploadError.message}`);
          return;
        }
        const res = await confirmarCargaEntregaAlumno({
          ...metadata,
          archivoPath: prepared.archivoPath,
          uploadIntentId: prepared.uploadIntentId,
        });
        if (res.error) {
          setErrorLocal(res.error);
          return;
        }
        setExito(true);
        setEntrega({
          ...entrega,
          archivo_nombre: archivoSeleccionado.name,
          archivo_path: res.archivo_path,
          fotos_json: null,
          caduca_el: res.caduca_el,
          primer_envio_en: entrega?.primer_envio_en || new Date().toISOString(),
        });
        setArchivoSeleccionado(null);
      } catch (error: any) {
        setErrorLocal(error?.message || 'No se pudo completar la entrega.');
      } finally {
        subiendoRef.current = false;
        setSubiendo(false);
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
            Hasta 15 fotos comprimidas o 1 archivo · Máx {ACADEMIC_UPLOAD_MAX_MB}MB
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
              Tu calificación: <span className="text-3xl font-black">{entrega?.calificacion}</span> / 10
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
              {fotosConfirmadas > 0 && <p className="text-xs font-bold text-emerald-700">{fotosConfirmadas} {fotosConfirmadas === 1 ? 'foto guardada' : 'fotos guardadas'} en esta entrega</p>}
            </div>
          </div>
          {readSubmissionPhotos(entrega?.fotos_json).length > 0 ? (
            <GaleriaEntrega photos={entrega?.fotos_json} />
          ) : entrega?.archivo_path && (
            <AccionesArchivoEntrega
              archivoPath={entrega.archivo_path}
              archivoNombre={entrega.archivo_nombre || 'entrega'}
            />
          )}
          
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

      {/* MODO PREVISUALIZACION (PROFESOR) */}
      {!yaCalificado && isPreview && (
        <div className="p-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl text-center space-y-3">
          <div className="mx-auto w-12 h-12 bg-slate-100 flex items-center justify-center rounded-full">
            <Upload className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <p className="font-black text-slate-500 uppercase tracking-widest text-sm">Modo de Vista Previa</p>
            <p className="text-[11px] text-slate-400 font-bold uppercase mt-1">
              La subida de archivos está deshabilitada porque eres un docente.
            </p>
          </div>
        </div>
      )}

      {/* FORMULARIO DE SUBIDA (ALUMNO) */}
      {!yaCalificado && !isPreview && (
        <div className="space-y-4">
          {/* Fuera de la zona clicable: abrir un selector no debe abrir otro por propagación. */}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={STUDENT_SUBMISSION_ACCEPT}
            multiple
            disabled={bloqueado}
            onChange={(e) => { handleSelectedFiles(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            capture="environment"
            disabled={bloqueado}
            onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }}
          />
          <input ref={photosInputRef} type="file" className="hidden" accept="image/*" multiple disabled={bloqueado}
            onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => { if (!bloqueado) inputRef.current?.click(); }}
            className={cn(
              "relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all",
              isDragging
                ? "border-primary bg-primary/5 scale-[1.01] shadow-lg"
                : archivoSeleccionado
                ? "border-emerald-400 bg-emerald-50"
                : "border-slate-200 hover:border-primary/40 hover:bg-slate-50/50"
            )}
          >
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
                  disabled={bloqueado}
                  aria-label="Quitar documento seleccionado"
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
                  <p className="font-black text-slate-600 text-sm">Arrastra fotos o un documento aquí, o haz clic</p>
                  <p className="text-[11px] text-slate-400 mt-1">Selecciona hasta 15 fotos juntas, o un solo PDF, Excel, CSV, Word o PowerPoint · máx {ACADEMIC_UPLOAD_MAX_MB}MB</p>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                if (archivoSeleccionado) setErrorLocal('Quita el documento preparado antes de tomar fotos.');
                else { setErrorLocal(null); setCamaraAbierta(true); }
              }}
              disabled={bloqueado || fotos.length >= MAX_SUBMISSION_PHOTOS}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 text-sm font-bold text-primary transition-colors hover:bg-primary/10"
            >
              <Camera className="h-4 w-4" /> Tomar fotos seguidas
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={bloqueado}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-bold text-foreground transition-colors hover:bg-muted"
            >
              <Upload className="h-4 w-4" /> Elegir fotos o documento
            </button>
            <button type="button" onClick={() => photosInputRef.current?.click()} disabled={bloqueado}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 text-sm font-bold text-primary">
              <ImageIcon className="h-4 w-4" /> Añadir varias fotos
            </button>
          </div>
          {procesandoFotos && <p className="text-sm text-slate-500">Preparando fotos en buena calidad…</p>}
          {fotos.length > 0 && <section aria-label="Fotos listas para enviar" className="space-y-3 rounded-xl border p-3">
            <p className="text-sm font-semibold">{fotos.length}/{MAX_SUBMISSION_PHOTOS} fotos listas · {(fotos.reduce((sum, file) => sum + file.size, 0) / 1048576).toFixed(1)} MB</p>
            <p className="text-xs text-slate-500">Revisa cada miniatura antes de enviar. Ninguna foto se sube hasta que confirmes la entrega.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {fotos.map((file, index) => <div key={`${file.name}-${index}`} className="min-w-0 rounded-xl border bg-slate-50 p-2">
                <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-slate-100">
                  <VistaPreviaFoto file={file} index={index} />
                  <span className="absolute left-1 top-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-xs font-bold text-white">{index + 1}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-1">
                  <span className="min-w-0 truncate text-xs text-slate-600" title={file.name}>{file.name}</span>
                  <button type="button" disabled={bloqueado}
                    onClick={() => actualizarFotos((current) => current.filter((_, position) => position !== index))}
                    aria-label={`Quitar foto ${index + 1}`} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>)}
            </div>
          </section>}

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
            disabled={(!archivoSeleccionado && !fotos.length) || bloqueado}
            className={cn(
              "w-full h-14 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all shadow-lg",
              (archivoSeleccionado || fotos.length) && !bloqueado
                ? "bg-primary text-white hover:opacity-90 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            )}
          >
            {isPending || subiendo ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Subiendo entrega...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                {tieneArchivo ? 'Actualizar Entrega' : 'Enviar Entrega'}
              </>
            )}
          </button>
          {camaraAbierta && <CamaraContinua photos={fotos} error={errorLocal} onCapture={(file) => addPhotos([file])}
            onClose={() => setCamaraAbierta(false)}
            onNativeCamera={() => { cameraInputRef.current?.click(); setCamaraAbierta(false); }} />}
        </div>
      )}
    </div>
  );
}
