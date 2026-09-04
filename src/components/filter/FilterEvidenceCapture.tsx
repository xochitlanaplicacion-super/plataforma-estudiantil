'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Check, FileText, SwitchCamera, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { filePreviewDataUrl, normalizeEvidenceFile } from '@/lib/mobile-evidence';

type Guide = 'none' | 'adult' | 'adult-child';

export function FilterEvidenceCapture({
  label, help, file, onChange, allowPdf = false, guide = 'none', required = true,
}: {
  label: string;
  help: string;
  file: File | null;
  onChange: (file: File | null) => void;
  allowPdf?: boolean;
  guide?: Guide;
  required?: boolean;
}) {
  const id = useId();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let active = true;
    if (!file || !file.type.startsWith('image/')) { setPreview(null); return; }
    void filePreviewDataUrl(file).then((url) => { if (active) setPreview(url); }).catch(() => { if (active) setPreview(null); });
    return () => { active = false; };
  }, [file]);
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream, cameraOpen]);
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);

  const choose = async (selected?: File) => {
    if (!selected) return;
    setProcessing(true);
    try { onChange(await normalizeEvidenceFile(selected, allowPdf)); }
    catch (error) { toast({ variant: 'destructive', title: 'No se pudo preparar el archivo', description: error instanceof Error ? error.message : 'Selecciona otro archivo.' }); }
    finally { setProcessing(false); if (inputRef.current) inputRef.current.value = ''; }
  };
  const stopCamera = () => {
    stream?.getTracks().forEach((track) => track.stop()); setStream(null); setCameraOpen(false);
  };
  const startCamera = async (nextFacing: 'user' | 'environment' = facing) => {
    if (!navigator.mediaDevices?.getUserMedia) return toast({ variant: 'destructive', title: 'Cámara no disponible', description: 'Puedes elegir una imagen desde los archivos del dispositivo.' });
    stream?.getTracks().forEach((track) => track.stop()); setStream(null); setFacing(nextFacing); setCameraOpen(true); setCameraLoading(true);
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }));
    } catch {
      setCameraOpen(false); toast({ variant: 'destructive', title: 'No se pudo abrir la cámara', description: 'Revisa el permiso del navegador o elige una foto existente.' });
    } finally { setCameraLoading(false); }
  };
  const takePhoto = async () => {
    const video = videoRef.current; if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return toast({ variant: 'destructive', title: 'No se pudo capturar la fotografía' });
    await choose(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' })); stopCamera();
  };

  return <div className="space-y-2">
    <Label htmlFor={id}>{label}{required ? ' *' : ''}</Label>
    <input ref={inputRef} id={id} className="hidden" type="file" accept={allowPdf ? 'image/*,application/pdf' : 'image/*'} onChange={(event) => void choose(event.target.files?.[0])} />
    <div className="grid gap-2 sm:grid-cols-2">
      <Button type="button" variant="outline" disabled={processing} onClick={() => inputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />{processing ? 'Optimizando…' : 'Elegir archivo'}</Button>
      <Button type="button" disabled={processing} onClick={() => startCamera('environment')}><Camera className="mr-2 h-4 w-4" />Tomar foto</Button>
    </div>
    {file && <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      {preview ? <img src={preview} className="h-16 w-16 shrink-0 rounded-md object-cover" alt="Vista previa de la evidencia" /> : <FileText className="h-8 w-8 text-primary" />}
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{file.name}</p><p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB · protegido en este dispositivo</p></div>
      <Button type="button" variant="ghost" size="icon" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = ''; }} aria-label={`Quitar ${label}`}><Trash2 className="h-4 w-4" /></Button>
    </div>}
    <p className="text-xs text-muted-foreground">{help}</p>

    <Dialog open={cameraOpen} onOpenChange={(open) => { if (!open) stopCamera(); }}>
      <DialogContent className="max-w-2xl p-4 sm:p-6"><DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <div className="relative aspect-[3/4] max-h-[65vh] overflow-hidden rounded-xl bg-black sm:aspect-video">
          {cameraLoading && <div className="absolute inset-0 z-20 flex items-center justify-center text-sm text-white">Abriendo cámara…</div>}
          <video ref={videoRef} autoPlay muted playsInline className={`h-full w-full object-contain ${facing === 'user' ? '-scale-x-100' : ''}`} />
          {guide !== 'none' && <CameraGuide kind={guide} />}
        </div>
        <p className="text-center text-xs text-muted-foreground">Cámara {facing === 'environment' ? 'trasera' : 'frontal'} · Alinea a {guide === 'adult-child' ? 'la persona adulta y al alumno' : 'la persona'} dentro de la guía.</p>
        <DialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button type="button" variant="outline" onClick={stopCamera}>Cancelar</Button>
          <Button type="button" variant="outline" disabled={cameraLoading} onClick={() => startCamera(facing === 'environment' ? 'user' : 'environment')}><SwitchCamera className="mr-2 h-4 w-4" />Cambiar cámara</Button>
          <Button type="button" disabled={cameraLoading || !stream} onClick={takePhoto}><Check className="mr-2 h-4 w-4" />Usar fotografía</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function CameraGuide({ kind }: { kind: Exclude<Guide, 'none'> }) {
  return <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
    <div className={`absolute bottom-[8%] ${kind === 'adult-child' ? 'left-[18%] w-[34%]' : 'left-1/2 w-[45%] -translate-x-1/2'} top-[9%] rounded-[48%_48%_30%_30%] border-2 border-dashed border-white/80 shadow-[0_0_0_1px_rgba(0,0,0,.35)]`}>
      <div className="absolute left-1/2 top-[4%] aspect-square w-[35%] -translate-x-1/2 rounded-full border-2 border-dashed border-white/80" />
      <div className="absolute bottom-[5%] left-[12%] right-[12%] top-[40%] rounded-[45%_45%_25%_25%] border-2 border-dashed border-white/80" />
    </div>
    {kind === 'adult-child' && <div className="absolute bottom-[8%] right-[15%] top-[34%] w-[27%] rounded-[48%_48%_30%_30%] border-2 border-dashed border-white/80 shadow-[0_0_0_1px_rgba(0,0,0,.35)]">
      <div className="absolute left-1/2 top-[4%] aspect-square w-[38%] -translate-x-1/2 rounded-full border-2 border-dashed border-white/80" />
      <div className="absolute bottom-[5%] left-[12%] right-[12%] top-[40%] rounded-[45%_45%_25%_25%] border-2 border-dashed border-white/80" />
    </div>}
  </div>;
}
