'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, UploadCloud, AlertCircle, CheckCircle2, MessageSquare, Loader2, X, Cpu } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { procesarDocumentoOCR } from '@/lib/actions/acreditaciones';
import { convertirPDFaImagenes } from '@/lib/utils/pdfToImage';

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

  useEffect(() => { cargarMensajes(); }, []);

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

    setIsProcessing(true);
    setResultados([]);
    const nuevosResultados: ResultadoArchivo[] = [];

    const procesarLote = async (files: File[], expectedStatus: string) => {
      // Paso 1: Convertir PDFs a imágenes
      const archivosPreparados = await prepararArchivos(files);

      // Paso 2: Procesar cada imagen con la IA
      for (const { original, images } of archivosPreparados) {
        if (images.length === 0) {
          // PDF que falló al convertir
          nuevosResultados.push({ fileName: original, success: false, error: "No se pudo convertir el PDF a imagen." });
          setResultados([...nuevosResultados]);
          continue;
        }

        for (const imgFile of images) {
          setProcessingFile(imgFile.name);
          const formData = new FormData();
          formData.append('file', imgFile);
          formData.append('expectedStatus', expectedStatus);
          formData.append('fileName', imgFile.name);

          const result = await procesarDocumentoOCR(formData);
          nuevosResultados.push({
            fileName: imgFile.name,
            success: result.success,
            curp: result.success ? (result as any).curp : undefined,
            nombre: result.success ? (result as any).nombre : undefined,
            engine: result.success ? (result as any).engine : undefined,
            error: !result.success ? result.error : undefined,
            warning: result.success ? (result as any).warning : undefined,
          });
          setResultados([...nuevosResultados]);
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dictámenes de Acreditación</h1>
        <p className="text-muted-foreground mt-1">Sube imágenes (JPG, PNG) o PDFs de los dictámenes de la SEP. Los PDFs se convierten automáticamente.</p>
      </div>

      <Tabs defaultValue="documentos" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="documentos" className="flex items-center gap-2"><FileText size={16} /> Carga de Documentos (OCR)</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
