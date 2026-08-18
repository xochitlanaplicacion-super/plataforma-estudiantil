"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import gsap from 'gsap';
import {
  BookMarked,
  FileText, // default PDF
  FileSpreadsheet, // Excel
  File, // Word
  Presentation, // PPT
  Download,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Plus,
  UploadCloud,
  Loader2,
  X,
  Database,
  FolderOpen,
  GraduationCap,
  Check,
  Search
} from 'lucide-react';
import {
  getNiveles,
  getTodosLosMateriales,
  deleteMaterial,
  togglePublicado,
  generateSignedUrl,
  getStorageUsed,
  guardarRegistrosMaterialMasivo,
  updateCategoriaCompleta,
  deleteCategoria
} from '@/lib/actions/material';
import { getCarreras } from '@/lib/actions/academic';
import { MaterialApoyo } from '@/lib/types';

export default function MaterialDeApoyoPage() {
  const { toast } = useToast();
  const supabase = createClient();
  const accordionRef = useRef<HTMLDivElement>(null);

  const [userId, setUserId] = useState<string>('');
  const [sessionToken, setSessionToken] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [niveles, setNiveles] = useState<any[]>([]);
  const [materiales, setMateriales] = useState<MaterialApoyo[]>([]);
  const [usedStorage, setUsedStorage] = useState(0);
  const STORAGE_LIMIT = 100; // 100 MB

  // Upload State
  const [modalUpload, setModalUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isAppending, setIsAppending] = useState(false);
  const [form, setForm] = useState({ nivel_id: '', categoria: '', descripcion: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Modal State
  const [modalEdit, setModalEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    oldNivelId: '',
    oldCategoria: '',
    newNivelId: '',
    newCategoria: '',
    newDescripcion: ''
  });

  // Carreras (Programas) State
  const [carrerasDisponibles, setCarrerasDisponibles] = useState<any[]>([]);
  const [selectedCarreras, setSelectedCarreras] = useState<string[]>([]);
  const [searchCarrera, setSearchCarrera] = useState('');

  // Tab State
  const [activeTab, setActiveTab] = useState<string>('');

  // Explorador State
  const [globalCarreras, setGlobalCarreras] = useState<Record<string, string>>({});
  const [searchFolders, setSearchFolders] = useState('');

  const fetchInitialData = async () => {
    setLoading(true);
    
    // Get user and token for XHR
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setUserId(session.user.id);
      setSessionToken(session.access_token);
    }

    // Get DB Data
    const [resNiveles, resMateriales, resStorage] = await Promise.all([
      getNiveles(),
      getTodosLosMateriales(),
      getStorageUsed()
    ]);

    if (resNiveles.success !== false && resNiveles.data) {
      setNiveles(resNiveles.data);
      if (resNiveles.data.length > 0) setActiveTab(resNiveles.data[0].id);
    }
    
    if (resMateriales.success !== false && resMateriales.data) {
      setMateriales(resMateriales.data as MaterialApoyo[]);
    }

    if (resStorage.success) {
      setUsedStorage(resStorage.usedMb);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // GSAP Animation when switching tabs
  useEffect(() => {
    if (!loading && materiales.length > 0 && accordionRef.current) {
      const cards = accordionRef.current.children;
      gsap.fromTo(cards, 
        { y: 20, opacity: 0 }, 
        { y: 0, opacity: 1, duration: 0.4, stagger: 0.1, ease: "power2.out", clearProps: "all" }
      );
    }
  }, [activeTab, loading, materiales, searchFolders]);

  // Fetch carreras globales para la vista del explorador
  useEffect(() => {
    if (activeTab) {
      getCarreras(activeTab).then(res => {
        if (res.data) {
          const map: Record<string, string> = {};
          res.data.forEach((c: any) => { map[c.id] = c.nombre; });
          setGlobalCarreras(map);
        }
      });
    }
  }, [activeTab]);

  // Fetch carreras when uploading/appending
  useEffect(() => {
    if (modalUpload && form.nivel_id) {
      getCarreras(form.nivel_id).then(res => {
        if (res.data && res.data.length > 0) {
          setCarrerasDisponibles(res.data);
        } else {
          setCarrerasDisponibles([]);
          setSelectedCarreras([]);
        }
      });
    }
  }, [form.nivel_id, modalUpload]);

  // Fetch carreras when editing
  useEffect(() => {
    if (modalEdit && editForm.newNivelId) {
      getCarreras(editForm.newNivelId).then(res => {
        if (res.data && res.data.length > 0) {
          setCarrerasDisponibles(res.data);
        } else {
          setCarrerasDisponibles([]);
          setSelectedCarreras([]);
        }
      });
    }
  }, [editForm.newNivelId, modalEdit]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const validFiles: File[] = [];

      for (const file of newFiles) {
        // 20 MB Limit = 20 * 1024 * 1024
        if (file.size > 20971520) {
          toast({ variant: 'destructive', title: 'Archivo omitido', description: `Las dimensiones de ${file.name} superan los 20MB permitidos.` });
        } else {
          // Prevenir duplicidad accidental
          if (!selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
            validFiles.push(file);
          }
        }
      }

      setSelectedFiles(prev => [...prev, ...validFiles]);
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setUploadProgress({}); // reset form visuals
  };

  const clearForm = () => {
    setForm({ nivel_id: activeTab || (niveles[0]?.id || ''), categoria: '', descripcion: '' });
    setSelectedFiles([]);
    setUploadProgress({});
    setSelectedCarreras([]);
    setSearchCarrera('');
    setIsAppending(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openAppendModal = (categoria: string, nivel_id: string, descripcion: string, carreras_ids: string[] = []) => {
    clearForm();
    setForm({ nivel_id, categoria, descripcion: descripcion || '' });
    setSelectedCarreras(carreras_ids || []);
    setIsAppending(true);
    setModalUpload(true);
  };

  const getExtType = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['doc', 'docx'].includes(ext)) return 'word';
    if (['xls', 'xlsx'].includes(ext)) return 'excel';
    if (['ppt', 'pptx'].includes(ext)) return 'powerpoint';
    return 'pdf';
  }

  // Sube un archivo con XHR para tener progreso real (Bypasses Next.js limits)
  const uploadFileWithRealProgress = (file: File, path: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Update specific file progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(prev => ({ ...prev, [file.name]: percent }));
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
          try {
             const jsonResponse = JSON.parse(xhr.responseText);
             // Return the storage path
             resolve(path);
          } catch(e) {
             resolve(path);
          }
        } else {
          reject(new Error(xhr.responseText));
        }
      });
      
      xhr.addEventListener('error', () => reject(new Error('Error de conexión o permisos en Supabase')));
      
      // We must construct the FormData as Supabase Storage Expects
      const formData = new FormData();
      formData.append('file', file);
      formData.append('cacheControl', '3600');
      
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      xhr.open('POST', `${supabaseUrl}/storage/v1/object/material-apoyo/${path}`);
      
      // Authorization
      xhr.setRequestHeader('Authorization', `Bearer ${sessionToken}`);
      // Usually not required if passing token via Bearer, but good practice
      if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      }

      xhr.send(formData);
    });
  };

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debes seleccionar al menos un archivo.' });
      return;
    }
    if (!form.categoria.trim() || !form.nivel_id) {
      toast({ variant: 'destructive', title: 'Error', description: 'El Título Global (Categoría) y Nivel son obligatorios.' });
      return;
    }
    if (!userId || !sessionToken) {
      toast({ variant: 'destructive', title: 'Error de Sesión', description: 'No se detectó la sesión de usuario. Refresca la ventana.' });
      return;
    }

    setUploading(true);
    setUploadProgress({}); // clear previews

    try {
      const insertDataArray: any[] = [];
      const timestampBase = Date.now();

      // Carga uno por uno (o en paralelo) directamente a Supabase Storage
      for (const [idx, file] of selectedFiles.entries()) {
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
        // Agregamos un leve delay en milisegundos para evitar bloqueos por mismos nombres
        const filePath = `${form.nivel_id}/${timestampBase + idx}_${cleanFileName}`;
        
        // Simular un poco de progreso de arranque (0 -> 1%)
        setUploadProgress(prev => ({ ...prev, [file.name]: 1 }));
        
        const storagePathObj = await uploadFileWithRealProgress(file, filePath);
        
        insertDataArray.push({
          nivel_id: form.nivel_id,
          titulo: file.name, // Nombre individual nativo
          categoria: form.categoria, // Carpeta
          descripcion: form.descripcion || null,
          archivo_url: storagePathObj, 
          tipo_archivo: getExtType(file.name),
          tamano_bytes: file.size,
          publicado: true,
          carreras_ids: selectedCarreras.length > 0 ? selectedCarreras : null,
          created_by: userId
        });
      }

      // Una vez que TODOS subieron a Storage, mandamos a insertar la data a la DB (No rompe los límites de JSON de Next.js)
      const resDb = await guardarRegistrosMaterialMasivo(insertDataArray);
      
      if (resDb.success) {
        toast({ title: '✅ Carga completada con éxito', description: `Se adjuntaron ${selectedFiles.length} documentos a Storage.` });
        setModalUpload(false);
        clearForm();
        fetchInitialData(); 
      } else {
        throw new Error(resDb.error || "No se pudo registrar la base de datos");
      }

    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Se produjo un error durante la carga.' });
    } finally {
      setUploading(false);
    }
  };

  const handleToggle = async (mat: MaterialApoyo) => {
    const res = await togglePublicado(mat.id, !mat.publicado);
    if (res.success) {
      toast({ title: 'Visibilidad actualizada' });
      setMateriales(prev => prev.map(m => m.id === mat.id ? { ...m, publicado: !mat.publicado } : m));
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
  };

  const handleDelete = async (mat: MaterialApoyo) => {
    if (!confirm(`¿Eliminar definitivamente el archivo "${mat.titulo}"?`)) return;
    const res = await deleteMaterial(mat.id, mat.archivo_url);
    if (res.success) {
      toast({ title: 'Archivo eliminado' });
      fetchInitialData();
    } else {
      toast({ variant: 'destructive', title: 'Error al eliminar', description: res.error });
    }
  };

  const handleDownload = async (mat: MaterialApoyo) => {
    try {
      toast({ title: 'Generando enlace...', description: 'Descarga comenzando...' });
      const res = await generateSignedUrl(mat.archivo_url, mat.titulo);
      if (res.success && res.signedUrl) {
        const a = document.createElement('a');
        a.href = res.signedUrl;
        a.download = mat.titulo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        throw new Error(res.error || 'No se pudo generar el enlace');
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error de descarga', description: e.message });
    }
  };

  const openEditCatModal = (nivelId: string, oldCat: string, oldDesc: string, carreras_ids: string[] = []) => {
    setEditForm({
      oldNivelId: nivelId,
      oldCategoria: oldCat,
      newNivelId: nivelId,
      newCategoria: oldCat,
      newDescripcion: oldDesc || ''
    });
    setSelectedCarreras(carreras_ids || []);
    setSearchCarrera('');
    setModalEdit(true);
  };

  const handleSaveEditCat = async () => {
    if (!editForm.newCategoria.trim() || !editForm.newNivelId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Título Global y Nivel son obligatorios.' });
      return;
    }
    setEditing(true);
    const res = await updateCategoriaCompleta(
      editForm.oldNivelId, 
      editForm.oldCategoria, 
      editForm.newNivelId, 
      editForm.newCategoria.trim(), 
      editForm.newDescripcion,
      selectedCarreras
    );
    
    if (res.success) {
      toast({ title: 'Carpeta actualizada exitosamente' });
      setModalEdit(false);
      fetchInitialData();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
    setEditing(false);
  };

  const handleDeleteCat = async (nivelId: string, catName: string, length: number) => {
    if (!window.confirm(`⚠️ ADVERTENCIA: ¿Estás seguro de borrar la carpeta "${catName}" y sus ${length} archivos?\n\nEsta acción eliminará todos los documentos y no se puede deshacer.`)) return;
    
    setLoading(true);
    const res = await deleteCategoria(nivelId, catName);
    if (res.success) {
      toast({ title: 'Carpeta eliminada por completo' });
      fetchInitialData();
    } else {
      toast({ variant: 'destructive', title: 'Error al eliminar', description: res.error });
      setLoading(false);
    }
  };

  const renderFolderBadges = (carrerasIds: string[] | null) => {
    if (!carrerasIds || carrerasIds.length === 0) {
      return <Badge variant="outline" className="bg-emerald-50/80 text-emerald-700 border-emerald-200 mt-1 font-medium hover:bg-emerald-100 transition-colors">Público / Global</Badge>;
    }
    
    // Asignador de colores estático basado en UUID
    const getBadgeColor = (id: string) => {
      const colors = [
        "bg-blue-50/80 text-blue-700 border-blue-200 hover:bg-blue-100",
        "bg-purple-50/80 text-purple-700 border-purple-200 hover:bg-purple-100",
        "bg-amber-50/80 text-amber-700 border-amber-200 hover:bg-amber-100",
        "bg-rose-50/80 text-rose-700 border-rose-200 hover:bg-rose-100",
        "bg-teal-50/80 text-teal-700 border-teal-200 hover:bg-teal-100",
        "bg-indigo-50/80 text-indigo-700 border-indigo-200 hover:bg-indigo-100",
        "bg-pink-50/80 text-pink-700 border-pink-200 hover:bg-pink-100",
      ];
      let sum = 0;
      for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
      return colors[sum % colors.length];
    };

    const maxVisible = 2;
    const visibleIds = carrerasIds.slice(0, maxVisible);
    const hiddenIds = carrerasIds.slice(maxVisible);

    return (
      <div className="flex items-center gap-1.5 flex-wrap mt-1">
        {visibleIds.map(id => (
          <Badge key={id} variant="outline" className={cn("text-[10px] py-0 font-medium transition-colors cursor-default", getBadgeColor(id))}>
            {globalCarreras[id] || "Cargando..."}
          </Badge>
        ))}
        {hiddenIds.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Badge variant="outline" className="cursor-pointer hover:bg-slate-100 text-[10px] py-0 transition-colors bg-white font-medium shadow-sm">
                +{hiddenIds.length} Más
              </Badge>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 bg-white/95 backdrop-blur-md shadow-xl border-slate-200 rounded-xl" align="start">
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b pb-2">
                  <GraduationCap size={14} /> Todas las Carreras
                </p>
                <div className="flex flex-col gap-1.5">
                  {hiddenIds.map(id => (
                    <Badge key={id} variant="outline" className={cn("text-[10px] py-0 w-fit font-medium", getBadgeColor(id))}>
                      {globalCarreras[id] || "Cargando..."}
                    </Badge>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  };

  const renderCarrerasSelector = () => {
    if (carrerasDisponibles.length === 0) return null;

    const filteredCarreras = carrerasDisponibles.filter(c => 
      c.nombre.toLowerCase().includes(searchCarrera.toLowerCase())
    );

    const toggleCarrera = (id: string) => {
      setSelectedCarreras(prev => 
        prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
      );
    };

    const selectAll = () => {
      setSelectedCarreras(carrerasDisponibles.map(c => c.id));
    };

    const deselectAll = () => {
      setSelectedCarreras([]);
    };

    return (
      <div className="space-y-3 pt-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <GraduationCap size={14} /> Selecciona Carreras (Exclusividad)
          </Label>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px]" onClick={selectAll}>Todos</Button>
            <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px]" onClick={deselectAll}>Ninguno</Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0">Si no seleccionas ninguna, el material será visible globalmente para todo el Nivel.</p>
        
        <Input 
          placeholder="Buscar carrera..." 
          value={searchCarrera} 
          onChange={(e) => setSearchCarrera(e.target.value)}
          className="h-8 text-xs bg-white"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 bg-slate-50/50 rounded-xl border">
          {filteredCarreras.map(c => {
            const isSelected = selectedCarreras.includes(c.id);
            return (
              <div 
                key={c.id} 
                onClick={() => toggleCarrera(c.id)}
                className={cn(
                  "flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-xs",
                  isSelected ? "bg-primary/10 border-primary/50 text-primary font-medium shadow-sm" : "bg-white hover:bg-slate-50 border-slate-200"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors mt-0.5",
                  isSelected ? "bg-primary border-primary text-white" : "border-slate-300"
                )}>
                  {isSelected && <Check size={10} strokeWidth={4} />}
                </div>
                <span className="leading-tight">{c.nombre}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const getFileIcon = (tipo: string) => {
    switch(tipo) {
      case 'word': return <File className="text-blue-500" />;
      case 'excel': return <FileSpreadsheet className="text-green-600" />;
      case 'powerpoint': return <Presentation className="text-orange-500" />;
      default: return <FileText className="text-red-500" />; // PDF
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '0 MB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const progressPct = Math.min((usedStorage / STORAGE_LIMIT) * 100, 100);

  return (
    <div className="space-y-8 pb-10">
      
      {/* HEADER COLOFON */}
      <div className="relative overflow-hidden rounded-2xl bg-primary/5 border border-primary/20 p-6 md:p-8">
        <div className="absolute top-0 right-0 p-8 opacity-5 transform translate-x-4 -translate-y-4 pointer-events-none">
          <BookMarked size={180} />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-black text-primary flex items-center gap-3">
              <BookMarked size={32} /> 
              Material de Apoyo Oficial
            </h2>
            <p className="mt-2 text-muted-foreground leading-relaxed">
              Sube y administra documentos de guía, reglamentos o catálogos agrupados por Temáticas. Los archivos estarán disponibles para los profesores y alumnos según su nivel académico estructural.
            </p>
          </div>
          
          <Card className="min-w-[280px] bg-white/80 backdrop-blur border-primary/10 shadow-sm shrink-0">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Database size={14}/> Almacenamiento
                </span>
                <Badge variant={progressPct > 90 ? 'destructive' : 'outline'} className="text-[10px] bg-white">
                  {usedStorage.toFixed(1)} MB / {STORAGE_LIMIT} MB
                </Badge>
              </div>
              <Progress value={progressPct} className={cn("h-2", progressPct > 90 ? "[&>div]:bg-red-500" : "[&>div]:bg-primary")} />
              {progressPct > 90 && (
                <p className="text-[10px] text-red-500 font-bold leading-tight">
                  Has alcanzado el 90% de capacidad. Elimina material viejo para liberar espacio.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end">
        <Button 
          onClick={() => { clearForm(); setModalUpload(true); }} 
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md hover:shadow-lg transition-all"
        >
          <UploadCloud size={18} className="mr-2" />
          Carga Masiva Material
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-primary">
          <Loader2 className="animate-spin mb-4" size={32} />
          <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Cargando Plataforma...</p>
        </div>
      ) : niveles.length === 0 ? (
        <Card className="bg-muted/30 border-dashed"><CardContent className="p-12 text-center text-muted-foreground">
          No hay niveles académicos configurados.
        </CardContent></Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent justify-start mb-6">
            {niveles.map(nivel => (
              <TabsTrigger 
                key={nivel.id} 
                value={nivel.id}
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-full px-6 py-2 text-sm font-bold uppercase tracking-wide transition-all border border-muted"
              >
                {nivel.nombre}
              </TabsTrigger>
            ))}
          </TabsList>

          {niveles.map(nivel => {
            const matA = materiales.filter(m => m.nivel_id === nivel.id);

            // Group by categoria
            const categoriesObj = matA.reduce((acc, current) => {
              const cat = current.categoria || 'Sin Categoría';
              if (!acc[cat]) acc[cat] = [];
              acc[cat].push(current);
              return acc;
            }, {} as Record<string, MaterialApoyo[]>);

            const categories = Object.entries(categoriesObj).sort((a,b) => a[0].localeCompare(b[0]));
            
            // Search filter
            const filteredCategories = categories.filter(([catName, items]) => {
              if (!searchFolders.trim()) return true;
              const term = searchFolders.toLowerCase();
              
              // 1. Título
              if (catName.toLowerCase().includes(term)) return true;
              
              // 2. Descripción
              const desc = items[0]?.descripcion || '';
              if (desc.toLowerCase().includes(term)) return true;
              
              // 3. Nombres de las Carreras (usando el mapa global)
              const cIds = items[0]?.carreras_ids || [];
              const matchCarrera = cIds.some(id => {
                const nombre = globalCarreras[id] || '';
                return nombre.toLowerCase().includes(term);
              });
              
              return matchCarrera;
            });

            return (
              <TabsContent key={nivel.id} value={nivel.id} className="mt-0 outline-none">
                {matA.length > 0 && (
                  <div className="relative max-w-sm mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input 
                      placeholder="Buscar por carpeta, descripción o carrera..." 
                      className="pl-9 h-10 bg-white/60 focus:bg-white shadow-sm border-primary/20 rounded-xl"
                      value={searchFolders}
                      onChange={(e) => setSearchFolders(e.target.value)}
                    />
                  </div>
                )}
                
                {filteredCategories.length === 0 ? (
                   <Card className="bg-muted/10 border-dashed shadow-none">
                    <CardContent className="p-16 flex flex-col items-center justify-center text-center">
                      <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center mb-4 text-muted-foreground shadow-sm">
                         <FolderOpen size={30} />
                      </div>
                      <p className="font-bold text-lg text-primary">Carpeta Vacía en {nivel.nombre}</p>
                      <p className="text-sm text-muted-foreground mt-1 max-w-md">Realiza una Carga Masiva para compartir recursos organizados por carpetas / categorías con esta división.</p>
                    </CardContent>
                   </Card>
                ) : (
                  <div ref={accordionRef} className="space-y-6">
                    {filteredCategories.map(([catName, items]) => (
                      <Card key={catName} className="overflow-hidden border-primary/20 shadow-sm transition-all hover:shadow-md">
                        <CardHeader className="bg-primary/5 p-4 md:px-6 border-b border-primary/10 flex flex-row items-start gap-4">
                          <div className="h-12 w-12 flex shrink-0 items-center justify-center bg-white rounded-xl shadow-sm border border-primary/10 text-primary">
                            <FolderOpen size={24} />
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <CardTitle className="text-lg font-black text-primary flex items-center gap-2 truncate">
                              {catName}
                            </CardTitle>
                            {items[0]?.descripcion && (
                              <CardDescription className="text-xs text-muted-foreground leading-tight mt-0.5 line-clamp-1 mb-1">
                                {items[0].descripcion}
                              </CardDescription>
                            )}
                            {renderFolderBadges(items[0]?.carreras_ids || null)}
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-auto flex-wrap justify-end">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors" 
                              title="Editar Atributos de Carpeta"
                              onClick={() => openEditCatModal(nivel.id, catName, items[0]?.descripcion || '', items[0]?.carreras_ids || [])}
                            >
                              <Edit size={14} />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors mr-1" 
                              title="Borrar Carpeta y Todos sus Archivos"
                              onClick={() => handleDeleteCat(nivel.id, catName, items.length)}
                            >
                              <Trash2 size={14} />
                            </Button>
                            <Badge variant="outline" className="bg-white text-xs">
                              {items.length} Archivos
                            </Badge>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 shadow-sm text-primary hover:text-primary-foreground hover:bg-primary border-primary/20 transition-colors" 
                              onClick={() => openAppendModal(catName, nivel.id, items[0]?.descripcion || '', items[0]?.carreras_ids || [])}
                            >
                              <Plus size={14} className="mr-1" /> Añadir Más
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="divide-y divide-border">
                            {items.map(m => (
                               <div key={m.id} className={cn(
                                 "flex flex-col md:flex-row md:items-center justify-between p-4 md:px-6 gap-4 hover:bg-slate-50 transition-colors",
                                 !m.publicado && "bg-gray-50/50 grayscale-[50%]"
                               )}>
                                 
                                 {/* File Identity */}
                                 <div className="flex items-start gap-4 flex-1">
                                    <div className="bg-white border rounded p-2 shadow-sm shrink-0">
                                      {getFileIcon(m.tipo_archivo)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className={cn("text-sm font-semibold truncate", m.publicado ? "text-slate-800" : "text-slate-500 line-through decoration-1")}>{m.titulo}</p>
                                      
                                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                                        <Badge variant="outline" className={cn("text-[9px] pointer-events-none", m.publicado ? 'border-primary/20 bg-primary/5 text-primary' : 'bg-gray-200 text-gray-500 border-transparent')}>
                                          {m.publicado ? 'PÚBLICO' : 'OCULTO'}
                                        </Badge>
                                        <span className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground">
                                          {formatSize(m.tamano_bytes)}
                                        </span>
                                        {m.profiles && (
                                          <span className="text-[10px] text-muted-foreground">
                                            Por: {m.profiles.nombre} {m.profiles.apellidos}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                 </div>

                                 {/* Actions */}
                                 <div className="flex items-center gap-2 shrink-0 md:ml-auto self-end md:self-auto">
                                   <Button size="sm" variant="outline" className="h-8 gap-1 shadow-sm text-xs" onClick={() => handleDownload(m)}>
                                     <Download size={14} /> Descargar
                                   </Button>
                                   <Button size="icon" variant="ghost" className={cn("h-8 w-8 text-muted-foreground", m.publicado ? "hover:text-amber-500 hover:bg-amber-50" : "hover:text-emerald-500 hover:bg-emerald-50")} onClick={() => handleToggle(m)} title={m.publicado ? "Ocultar material" : "Publicar material"}>
                                      {m.publicado ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200" onClick={() => handleDelete(m)}>
                                      <Trash2 size={14} />
                                    </Button>
                                 </div>

                               </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {/* Upload Modal (Carga Masiva) */}
      <Dialog open={modalUpload} onOpenChange={(open) => { if(!open && !uploading) setModalUpload(false); }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-xl"><UploadCloud size={24} className="text-primary"/> Carga Masiva Material</DialogTitle>
            <DialogDescription>Sube múltiples documentos de forma simultánea. Puedes seguir su progreso independiente.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-2 overflow-y-auto flex-1 pr-2 -mr-2">
            
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">1. Archivos Adjuntos (Múltiples permitidos)</Label>
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-primary/30 rounded-xl cursor-pointer bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <p className="text-sm font-bold text-gray-700">Arrastra archivos o click para explorar</p>
                  <p className="text-xs text-muted-foreground mt-1 text-center font-medium">Hasta 20 MB por archivo independiente.</p>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  ref={fileInputRef} 
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" 
                  onChange={handleFileChange}
                />
              </label>

              {/* LISTA DE ARCHIVOS CON PROGRESO */}
              {selectedFiles.length > 0 && (
                <div className="mt-3 bg-muted/30 border rounded-xl overflow-hidden divide-y divide-border/50 max-h-48 overflow-y-auto">
                   {selectedFiles.map((f, i) => {
                     const pct = uploadProgress[f.name] !== undefined ? uploadProgress[f.name] : 0;
                     const isUploading = uploading && pct < 100 && pct > 0;
                     const isDone = pct === 100;
                     
                     return (
                       <div key={i} className="flex flex-col p-2.5 px-3 bg-white/50 hover:bg-white transition-colors gap-2 relative">
                          <div className="flex items-center justify-between z-10 relative">
                             <div className="flex items-center gap-3 overflow-hidden">
                                <div className="shrink-0">{getFileIcon(f.name.split('.').pop() || 'pdf')}</div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-700 truncate max-w-[250px]" title={f.name}>{f.name}</p>
                                  <div className="text-[9px] text-muted-foreground font-mono flex gap-2">
                                    <span>{formatSize(f.size)}</span>
                                    {uploading && (
                                      <span className={cn("font-bold", isDone ? "text-emerald-500" : "text-amber-500")}>
                                        {isDone ? '✓ COMPLETO' : `${pct}%`}
                                      </span>
                                    )}
                                  </div>
                                </div>
                             </div>
                             <Button size="icon" variant="ghost" disabled={uploading} className="h-6 w-6 text-slate-400 hover:text-red-500 hover:bg-red-50 shrink-0" onClick={() => removeFile(i)}>
                               <X size={12} />
                             </Button>
                          </div>
                          
                          {/* Barra de progreso de fondo */}
                          {(uploading || isDone) && (
                            <div className="absolute top-0 left-0 bottom-0 bg-emerald-100/40 z-0 transition-all duration-300 ease-out" style={{ width: `${pct}%` }}></div>
                          )}
                          {/* Progress Line */}
                          {uploading && (
                            <Progress value={pct} className="h-1 bg-gray-100 z-10 [&>div]:bg-emerald-500" />
                          )}
                       </div>
                     )
                   })}
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  2. Título Global (Carpeta) 
                  {isAppending && <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-600 border-amber-200">SECCIÓN EXISTENTE</Badge>}
                </Label>
                <Input 
                  placeholder="Ej. Req. de Admisión 2026" 
                  value={form.categoria} 
                  disabled={isAppending}
                  className={cn(isAppending && "bg-muted cursor-not-allowed text-muted-foreground")}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">3. Nivel Destino</Label>
                <Select value={form.nivel_id} disabled={isAppending} onValueChange={(val) => setForm(f => ({ ...f, nivel_id: val}))}>
                  <SelectTrigger className={cn(isAppending && "bg-muted cursor-not-allowed text-muted-foreground")}><SelectValue placeholder="Selecciona un nivel" /></SelectTrigger>
                  <SelectContent>
                    {niveles.map(n => (
                      <SelectItem key={n.id} value={n.id}>{n.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">4. Descripción Compartida (Opcional)</Label>
              <Textarea 
                placeholder="Breve explicación de la carpeta o el uso de estos recursos..." 
                className={cn("h-20 resize-none", isAppending && "bg-muted cursor-not-allowed text-muted-foreground")}
                value={form.descripcion} 
                disabled={isAppending}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              />
            </div>

            {renderCarrerasSelector()}

          </div>

          <DialogFooter className="border-t pt-4 shrink-0 mt-2">
            <Button variant="outline" onClick={() => setModalUpload(false)} disabled={uploading}>Cancelar</Button>
            <Button onClick={handleUploadSubmit} disabled={uploading || selectedFiles.length === 0 || !form.categoria || !form.nivel_id} className="min-w-[150px]">
              {uploading ? <Loader2 className="animate-spin" size={16} /> : `Subir ${selectedFiles.length} doc(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Category Modal */}
      <Dialog open={modalEdit} onOpenChange={(open) => { if(!open && !editing) setModalEdit(false); }}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2"><Edit size={20} className="text-primary"/> Editar Atributos de Carpeta</DialogTitle>
            <DialogDescription>Modificar el título, el nivel destino o la descripción actualizará todos los archivos internos en cascada.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2 overflow-y-auto flex-1 pr-2 -mr-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Título Global (Categoría)</Label>
              <Input 
                value={editForm.newCategoria} 
                onChange={e => setEditForm(f => ({ ...f, newCategoria: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nivel Destino</Label>
              <Select value={editForm.newNivelId} onValueChange={(val) => setEditForm(f => ({ ...f, newNivelId: val}))}>
                <SelectTrigger><SelectValue placeholder="Selecciona un nivel" /></SelectTrigger>
                <SelectContent>
                  {niveles.map(n => (
                    <SelectItem key={n.id} value={n.id}>{n.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Descripción Compartida</Label>
              <Textarea 
                className="h-20 resize-none"
                value={editForm.newDescripcion} 
                onChange={e => setEditForm(f => ({ ...f, newDescripcion: e.target.value }))}
              />
            </div>

            {renderCarrerasSelector()}
          </div>
          
          <DialogFooter className="border-t pt-4 shrink-0 mt-2">
            <Button variant="outline" onClick={() => setModalEdit(false)} disabled={editing}>Cancelar</Button>
            <Button onClick={handleSaveEditCat} disabled={editing || !editForm.newCategoria || !editForm.newNivelId} className="min-w-[120px]">
              {editing ? <Loader2 className="animate-spin" size={16} /> : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
