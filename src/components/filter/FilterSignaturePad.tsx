'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function FilterSignaturePad({ label, help, file, onChange, required = true }: {
  label: string;
  help: string;
  file: File | null;
  onChange: (file: File | null) => void;
  required?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(Boolean(file));

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const context = canvas.getContext('2d'); if (!context) return;
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#cbd5e1'; context.lineWidth = 2; context.setLineDash([10, 8]);
    context.beginPath(); context.moveTo(60, canvas.height - 70); context.lineTo(canvas.width - 60, canvas.height - 70); context.stroke();
    context.setLineDash([]); setHasInk(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    if (!file) return clearCanvas();
    const url = URL.createObjectURL(file); const image = new Image();
    image.onload = () => { const context = canvas.getContext('2d'); if (context) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); setHasInk(true); } URL.revokeObjectURL(url); };
    image.onerror = () => { URL.revokeObjectURL(url); clearCanvas(); };
    image.src = url;
  }, [clearCanvas, file]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget; const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  };
  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault(); const canvas = event.currentTarget; canvas.setPointerCapture(event.pointerId); drawingRef.current = true;
    const context = canvas.getContext('2d'); if (!context) return; const current = point(event);
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    context.strokeStyle = primary ? `hsl(${primary})` : '#0f172a'; context.lineWidth = 5; context.lineCap = 'round'; context.lineJoin = 'round';
    context.beginPath(); context.moveTo(current.x, current.y); setHasInk(true);
  };
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return; event.preventDefault(); const context = event.currentTarget.getContext('2d'); if (!context) return;
    const current = point(event); context.lineTo(current.x, current.y); context.stroke();
  };
  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return; drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.toBlob((blob) => { if (blob) onChange(new File([blob], `firma-${Date.now()}.png`, { type: 'image/png' })); }, 'image/png');
  };
  const reset = () => { clearCanvas(); onChange(null); };

  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-3"><Label>{label}{required ? ' *' : ''}</Label>{hasInk && <span className="text-xs font-medium text-primary">Firma capturada</span>}</div>
    <div className="overflow-hidden rounded-xl border-2 border-dashed border-primary/30 bg-white shadow-inner">
      <canvas ref={canvasRef} width={1000} height={360} onPointerDown={begin} onPointerMove={draw} onPointerUp={finish} onPointerCancel={finish} className="block aspect-[25/9] w-full touch-none cursor-crosshair" aria-label={label} />
    </div>
    <div className="flex items-start justify-between gap-3"><p className="flex-1 text-xs text-muted-foreground"><PenLine className="mr-1 inline h-3 w-3" />{help}</p><Button type="button" size="sm" variant="outline" onClick={reset}><Eraser className="mr-2 h-4 w-4" />Limpiar</Button></div>
  </div>;
}
