'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, UploadCloud, AlertCircle, CheckCircle2, MessageSquare, Loader2, X, Cpu, History } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { procesarDocumentoOCR } from '@/lib/actions/acreditaciones';
import { convertirPDFaImagenes } from '@/lib/utils/pdfToImage';
import { HistoricoTab } from './HistoricoTab';

// --- Tipos ---
type ResultadoArchivo = {
  fileName: string;
  success: boolean;
  curp?: string;
  nombre?: string;
  engine?: string;
  error?: string;
  warning?: string;
};

// --- Helper para comprimir imágenes a ~100KB en el cliente ---
const compressImage = async (file: File): Promise<File> => {
  // Si ya pesa menos de 100KB y es imagen (no PDF), no hacemos nada
  if (file.size <= 100 * 1024 && file.type.startsWith('image/')) return file;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        
        // Reducir la resolución si es absurdamente grande
        const MAX_WIDTH = 1000; // 1000px es más que suficiente para OCR y ahorra peso
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(file);

        // Fondo blanco (para PNGs transparentes)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.8;
        const compress = () => {
          canvas.toBlob((blob) => {
            if (!blob) return resolve(file);
            
            // Si el blob pesa <= 100KB (102400 bytes) o ya bajamos mucho la calidad, lo regresamos
            if (blob.size <= 100 * 1024 || quality <= 0.2) {
              const baseName = file.name.replace(/\.[^/.]+$/, "");
              const newFile = new File([blob], `${baseName}.jpg`, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(newFile);
            } else {
              // Bajamos la calidad de manera más agresiva e intentamos de nuevo
              quality -= 0.15;
              compress();
            }
          }, 'image/jpeg', quality);
        };
        
        compress();
      };
      img.onerror = () => resolve(file); // Si hay un error, devuelve la original
    };
  });
};

export default function AcreditacionesPage() {
  const { toast } = useToast();
  const supabase = createClient();

  const [mensajeAprobado, setMensajeAprobado] = useState('');
  const [mensajeNoAprobado, setMensajeNoAprobado] = useState('');
  const [isSavingMessages, setIsSavingMessages] = useState(false);

  const [aprobadosFiles, setAprobadosFiles] = useState<File[]>([]);
  const [noAprobadosFiles, setNoAprobadosFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingFile, setProcessingFile] = useState<string>('');
  const [resultados, setResultados] = useState<ResultadoArchivo[]>([]);

  // --- CUOTA MENSUAL ---
  const LIMITE_MENSUAL = 50;
  const [quotaCount, setQuotaCount] = useState(0);
  const [showQuotaModal, setShowQuotaModal] = useState(false);

  useEffect(() => {
    cargarMensajes();
    cargarCuotaMensual();

    // --- SUSCRIPCIÓN REALTIME: actualiza la barra de cuota al instante ---
    // Cada vez que la IA guarda un nuevo registro en acreditaciones_alumnos,
    // la barra sube automáticamente sin recargar la página.
    const ahora = new Date();
    const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();

    const channel = supabase
      .channel('quota-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'acreditaciones_alumnos',
        },
        (payload) => {
          // Solo contar si el nuevo registro pertenece al mes actual
          const createdAt = payload.new?.created_at;
          if (createdAt && createdAt >= primerDiaMes) {
            setQuotaCount(prev => prev + 1);
          }
        }
      )
      .subscribe();

    // Limpiar la suscripción cuando el componente se desmonte
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const cargarCuotaMensual = async () => {
    const ahora = new Date();
    const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
    const { count } = await supabase
      .from('acreditaciones_alumnos')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', primerDiaMes);
    setQuotaCount(count ?? 0);
  };

  const cargarMensajes = async () => {
    const { data, error } = await supabase.from('mensajes_acreditacion').select('*');
    if (!error && data) {
      const msgAprobado = data.find(m => m.tipo === 'APROBADO');
      const msgNoAprobado = data.find(m => m.tipo === 'NO_APROBADO');
      if (msgAprobado) setMensajeAprobado(msgAprobado.contenido);
      if (msgNoAprobado) setMensajeNoAprobado(msgNoAprobado.contenido);
    }
  };

  const guardarMensajes = async () => {
    setIsSavingMessages(true);
    try {
      await supabase.from('mensajes_acreditacion').upsert({ tipo: 'APROBADO', contenido: mensajeAprobado, updated_at: new Date().toISOString() }, { onConflict: 'tipo' });
      await supabase.from('mensajes_acreditacion').upsert({ tipo: 'NO_APROBADO', contenido: mensajeNoAprobado, updated_at: new Date().toISOString() }, { onConflict: 'tipo' });
      toast({ title: "Mensajes guardados", description: "Los mensajes se han actualizado correctamente." });
    } catch {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setIsSavingMessages(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  const onDrop = (e: React.DragEvent, tipo: 'APROBADO' | 'NO_APROBADO') => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (tipo === 'APROBADO') setAprobadosFiles(prev => [...prev, ...files]);
    else setNoAprobadosFiles(prev => [...prev, ...files]);
  };

  // Convierte PDFs a imágenes PNG y deja las imágenes intactas
  const prepararArchivos = async (files: File[]): Promise<{original: string, images: File[]}[]> => {
    const resultado: {original: string, images: File[]}[] = [];
    for (const file of files) {
      if (file.type === 'application/pdf') {
        setProcessingFile(`Convirtiendo PDF: ${file.name}`);
        try {
          const imgs = await convertirPDFaImagenes(file);
          resultado.push({ original: file.name, images: imgs });
        } catch (e: any) {
          console.error(`Error convirtiendo PDF ${file.name}:`, e);
          resultado.push({ original: file.name, images: [] }); // Se marcará como fallo
        }
      } else {
        resultado.push({ original: file.name, images: [file] });
      }
    }
    return resultado;
  };

  const procesarDocumentos = async () => {
    if (aprobadosFiles.length === 0 && noAprobadosFiles.length === 0) {
      toast({ title: "Sin archivos", description: "Sube al menos un documento para procesar.", variant: "destructive" });
      return;
    }

    // --- VERIFICAR CUOTA MENSUAL ANTES DE PROCESAR ---
    if (quotaCount >= LIMITE_MENSUAL) {
      setShowQuotaModal(true);
      return;
    }

    setIsProcessing(true);
    setResultados([]);
    const nuevosResultados: ResultadoArchivo[] = [];

    const procesarLote = async (files: File[], expectedStatus: string) => {
      // Paso 1: Convertir PDFs a imágenes
      const archivosPreparados = await prepararArchivos(files);

      // Paso 2: Procesar cada imagen con la IA
      for (const { original, images } of archivosPreparados) {
        if (images.length === 0) {
          nuevosResultados.push({ fileName: original, success: false, error: "No se pudo convertir el PDF a imagen." });
          setResultados([...nuevosResultados]);
          continue;
        }

        let todasExitosas = true;
        for (let imgFile of images) {
          setProcessingFile(`Reduciendo peso: ${imgFile.name}`);
          const compressedFile = await compressImage(imgFile);

          setProcessingFile(`Procesando IA: ${compressedFile.name}`);
          const formData = new FormData();
          formData.append('file', compressedFile);
          formData.append('expectedStatus', expectedStatus);
          formData.append('fileName', imgFile.name);

          const result = await procesarDocumentoOCR(formData);
          if (!result.success) todasExitosas = false;

          nuevosResultados.push({
            fileName: original, // Siempre mostramos el nombre del archivo original (PDF o imagen)
            success: result.success,
            curp: result.success ? (result as any).curp : undefined,
            nombre: result.success ? (result as any).nombre : undefined,
            engine: result.success ? (result as any).engine : undefined,
            error: !result.success ? result.error : undefined,
            warning: result.success ? (result as any).warning : undefined,
          });
          setResultados([...nuevosResultados]);
        }

        // Si todas las páginas del archivo se procesaron bien, marcar el original para borrar
        if (todasExitosas) {
          setAprobadosFiles(prev => prev.filter(f => f.name !== original));
          setNoAprobadosFiles(prev => prev.filter(f => f.name !== original));
        }
      }
    };

    await procesarLote(aprobadosFiles, 'APROBADO');
    await procesarLote(noAprobadosFiles, 'NO_APROBADO');

    setProcessingFile('');
    setIsProcessing(false);

    const exitosos = nuevosResultados.filter(r => r.success).length;
    const fallidos = nuevosResultados.filter(r => !r.success).length;

    toast({
      title: `Procesamiento finalizado`,
      description: `✅ ${exitosos} exitosos / ❌ ${fallidos} fallidos`,
      variant: fallidos > 0 && exitosos === 0 ? "destructive" : "default",
    });

    // Solo limpiar los archivos que sí se procesaron
    const nombresExitosos = nuevosResultados.filter(r => r.success).map(r => r.fileName);
    setAprobadosFiles(prev => prev.filter(f => !nombresExitosos.includes(f.name)));
    setNoAprobadosFiles(prev => prev.filter(f => !nombresExitosos.includes(f.name)));
  };

  const removeFile = (tipo: 'APROBADO' | 'NO_APROBADO', index: number) => {
    if (tipo === 'APROBADO') setAprobadosFiles(prev => prev.filter((_, i) => i !== index));
    else setNoAprobadosFiles(prev => prev.filter((_, i) => i !== index));
  };

  const FileList = ({ files, tipo }: { files: File[], tipo: 'APROBADO' | 'NO_APROBADO' }) => (
    <div className="mt-4 space-y-2">
      <h4 className="text-sm font-semibold text-slate-700 flex justify-between">
        Archivos cargados
        <span className={`px-2 rounded-full text-xs py-0.5 ${tipo === 'APROBADO' ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100'}`}>{files.length}</span>
      </h4>
      <div className="max-h-[180px] overflow-y-auto space-y-1.5 pr-1">
        {files.map((f, i) => {
          const esPDF = f.type === 'application/pdf';
          return (
            <div key={i} className="flex items-center justify-between rounded-md p-2 text-sm shadow-sm border bg-white border-slate-200">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={14} className="text-slate-400 shrink-0" />
                <span className="truncate text-slate-600 text-xs" title={f.name}>{f.name}</span>
                {esPDF && <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-semibold shrink-0">PDF → se convertirá a imagen</span>}
              </div>
              <button onClick={() => removeFile(tipo, i)} className="text-red-400 hover:text-red-600 ml-2 shrink-0">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto pb-10">

      {/* ===== MODAL DE CUOTA AGOTADA ===== */}
      {showQuotaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            {/* Header rojo */}
            <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-full p-2">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Tarifa Agotada</h2>
                  <p className="text-red-100 text-sm">Plan Mensual — {new Date().toLocaleString('es-MX', { month: 'long', year: 'numeric' })}</p>
                </div>
              </div>
            </div>
            {/* Body */}
            <div className="px-6 py-6 space-y-4">
              <div className="flex items-center justify-between bg-red-50 rounded-xl px-4 py-3 border border-red-100">
                <span className="text-slate-600 font-medium">Documentos procesados</span>
                <span className="text-2xl font-bold text-red-600">{quotaCount} / {LIMITE_MENSUAL}</span>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed">
                Has alcanzado el límite de <strong>{LIMITE_MENSUAL} documentos</strong> procesados con IA este mes. Para continuar utilizando el servicio debes actualizar tu plan.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-amber-800 font-semibold text-sm">¿Qué puedes hacer?</p>
                <ul className="text-amber-700 text-sm mt-2 space-y-1 list-disc list-inside">
                  <li>Contacta al administrador para ampliar tu cuota</li>
                  <li>Espera al inicio del próximo mes para que se resetee</li>
                  <li>Considera actualizar a un plan superior</li>
                </ul>
              </div>
            </div>
            {/* Footer */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowQuotaModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl transition-colors"
              >
                Cerrar
              </button>
              <a
                href="mailto:admin@institutoemilianozapata.edu.mx?subject=Ampliar%20plan%20de%20acreditaciones"
                className="flex-1 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold py-2.5 rounded-xl transition-all text-center"
              >
                Contactar Admin
              </a>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dictámenes de Acreditación</h1>
        <p className="text-muted-foreground mt-1">Sube imágenes (JPG, PNG) o PDFs de los dictámenes de la SEP. Los PDFs se convierten automáticamente.</p>
      </div>

      {/* Indicador de Cuota Mensual */}
      <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${quotaCount >= LIMITE_MENSUAL ? 'bg-red-50 border-red-200' : quotaCount >= LIMITE_MENSUAL * 0.8 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
        <div className="flex items-center gap-2">
          <Cpu size={16} className={quotaCount >= LIMITE_MENSUAL ? 'text-red-500' : quotaCount >= LIMITE_MENSUAL * 0.8 ? 'text-amber-500' : 'text-green-500'} />
          <span className="text-sm font-medium text-slate-700">Cuota mensual de procesamiento IA</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${quotaCount >= LIMITE_MENSUAL ? 'bg-red-500' : quotaCount >= LIMITE_MENSUAL * 0.8 ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min((quotaCount / LIMITE_MENSUAL) * 100, 100)}%` }}
            />
          </div>
          <span className={`text-sm font-bold ${quotaCount >= LIMITE_MENSUAL ? 'text-red-600' : quotaCount >= LIMITE_MENSUAL * 0.8 ? 'text-amber-600' : 'text-green-700'}`}>
            {quotaCount} / {LIMITE_MENSUAL}
          </span>
        </div>
      </div>

      <Tabs defaultValue="documentos" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="documentos" className="flex items-center gap-2"><FileText size={16} /> Carga de Documentos (OCR)</TabsTrigger>
          <TabsTrigger value="historico" className="flex items-center gap-2"><History size={16} /> Histórico y Edición</TabsTrigger>
          <TabsTrigger value="mensajes" className="flex items-center gap-2"><MessageSquare size={16} /> Mensajes Personalizados</TabsTrigger>
        </TabsList>

        <TabsContent value="documentos" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Zona Aprobados */}
            <Card className="border-green-200 shadow-sm">
              <CardHeader className="bg-green-50/50 border-b border-green-100 pb-4">
                <CardTitle className="text-green-700 flex items-center gap-2"><CheckCircle2 size={20} /> Alumnos Aprobados</CardTitle>
                <CardDescription>Imágenes JPG/PNG de dictámenes APROBADOS.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div onDragOver={onDragOver} onDrop={(e) => onDrop(e, 'APROBADO')}
                  className="border-2 border-dashed border-green-200 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-green-50/50 transition-colors cursor-pointer">
                  <UploadCloud className="h-10 w-10 text-green-400 mb-3" />
                  <p className="text-sm font-medium text-slate-700 mb-1">Arrastra imágenes aquí</p>
                  <p className="text-xs text-slate-500 mb-4">JPG, PNG, WEBP o PDF</p>
                  <label className="cursor-pointer bg-white border border-slate-200 shadow-sm px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                    Seleccionar Archivos
                    <input type="file" multiple className="hidden" accept="image/*,.pdf" onChange={(e) => {
                      if (e.target.files) setAprobadosFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                    }} />
                  </label>
                </div>
                {aprobadosFiles.length > 0 && <FileList files={aprobadosFiles} tipo="APROBADO" />}
              </CardContent>
            </Card>

            {/* Zona No Aprobados */}
            <Card className="border-red-200 shadow-sm">
              <CardHeader className="bg-red-50/50 border-b border-red-100 pb-4">
                <CardTitle className="text-red-700 flex items-center gap-2"><AlertCircle size={20} /> Alumnos No Aprobados</CardTitle>
                <CardDescription>Imágenes JPG/PNG de dictámenes NO APROBADOS.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div onDragOver={onDragOver} onDrop={(e) => onDrop(e, 'NO_APROBADO')}
                  className="border-2 border-dashed border-red-200 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-red-50/50 transition-colors cursor-pointer">
                  <UploadCloud className="h-10 w-10 text-red-400 mb-3" />
                  <p className="text-sm font-medium text-slate-700 mb-1">Arrastra imágenes aquí</p>
                  <p className="text-xs text-slate-500 mb-4">JPG, PNG, WEBP o PDF</p>
                  <label className="cursor-pointer bg-white border border-slate-200 shadow-sm px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                    Seleccionar Archivos
                    <input type="file" multiple className="hidden" accept="image/*,.pdf" onChange={(e) => {
                      if (e.target.files) setNoAprobadosFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                    }} />
                  </label>
                </div>
                {noAprobadosFiles.length > 0 && <FileList files={noAprobadosFiles} tipo="NO_APROBADO" />}
              </CardContent>
            </Card>
          </div>

          {/* Botón Procesar */}
          <div className="flex justify-end">
            <Button size="lg" onClick={procesarDocumentos}
              disabled={isProcessing || (aprobadosFiles.length === 0 && noAprobadosFiles.length === 0)}
              className="bg-primary hover:bg-primary/90 text-white font-bold px-8 shadow-md">
              {isProcessing ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Procesando: {processingFile || '...'}</>
              ) : (
                <><FileText className="mr-2 h-5 w-5" /> Iniciar Procesamiento OCR</>
              )}
            </Button>
          </div>

          {/* ─── TABLA DE RESULTADOS ─── */}
          {resultados.length > 0 && (
            <Card className="border shadow-sm mt-4">
              <CardHeader className="bg-slate-50 border-b pb-4">
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <Cpu size={18} /> Reporte de Procesamiento
                </CardTitle>
                <CardDescription>
                  {resultados.filter(r => r.success).length} exitosos · {resultados.filter(r => !r.success).length} fallidos de {resultados.length} archivos
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 px-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50/50 text-xs text-slate-500 uppercase tracking-wider">
                        <th className="text-left px-4 py-2">Archivo</th>
                        <th className="text-left px-4 py-2">Estado</th>
                        <th className="text-left px-4 py-2">CURP Extraído</th>
                        <th className="text-left px-4 py-2">Nombre</th>
                        <th className="text-left px-4 py-2">Motor / Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultados.map((r, i) => (
                        <tr key={i} className={`border-b last:border-0 ${r.success ? 'hover:bg-green-50/30' : 'hover:bg-red-50/30 bg-red-50/10'}`}>
                          <td className="px-4 py-2.5 font-medium text-slate-700 max-w-[160px] truncate" title={r.fileName}>{r.fileName}</td>
                          <td className="px-4 py-2.5">
                            {r.success
                              ? <span className="flex items-center gap-1 text-green-600 font-semibold"><CheckCircle2 size={14} /> Guardado</span>
                              : <span className="flex items-center gap-1 text-red-600 font-semibold"><X size={14} /> Falló</span>
                            }
                            {r.warning && <p className="text-amber-600 text-xs mt-0.5">⚠ {r.warning}</p>}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{r.curp || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600 max-w-[180px] truncate">{r.nombre || '—'}</td>
                          <td className="px-4 py-2.5 text-xs">
                            {r.success
                              ? <span className="text-slate-500">{r.engine}</span>
                              : <span className="text-red-500 max-w-[200px] block truncate" title={r.error}>{r.error}</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* PESTAÑA 2: MENSAJES */}
        <TabsContent value="mensajes">
          <Card className="border shadow-sm">
            <CardHeader className="bg-slate-50 border-b pb-4">
              <CardTitle>Mensajes Predeterminados</CardTitle>
              <CardDescription>Estos mensajes aparecerán en el panel del alumno.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <h3 className="font-bold text-slate-800">Mensaje para Aprobados</h3>
                </div>
                <Textarea placeholder="Ej: ¡Felicidades! Has acreditado exitosamente..." className="min-h-[120px] text-sm"
                  value={mensajeAprobado} onChange={(e) => setMensajeAprobado(e.target.value)} />
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <h3 className="font-bold text-slate-800">Mensaje para No Aprobados</h3>
                </div>
                <Textarea placeholder="Ej: Estimado alumno, te informamos que en esta ocasión..." className="min-h-[120px] text-sm border-red-200 focus-visible:ring-red-500"
                  value={mensajeNoAprobado} onChange={(e) => setMensajeNoAprobado(e.target.value)} />
              </div>
              <div className="flex justify-end pt-4 border-t">
                <Button onClick={guardarMensajes} disabled={isSavingMessages} className="min-w-[150px]">
                  {isSavingMessages ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Guardar Mensajes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* PESTAÑA 3: HISTORICO */}
        <TabsContent value="historico">
          <HistoricoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
