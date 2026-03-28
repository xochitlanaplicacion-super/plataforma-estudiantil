
"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { 
  BookOpen, 
  ListTree, 
  FileText, 
  Sparkles, 
  ChevronRight, 
  Plus, 
  Edit, 
  Trash2, 
  Loader2, 
  ArrowLeft,
  Users,
  Presentation,
  Play,
  X,
  ChevronLeft,
  Image as ImageIcon,
  Palette,
  FileUp,
  Download,
  File,
  Paperclip,
  Info,
  CheckCircle2,
  HelpCircle,
  Hash,
  Type,
  AlignLeft,
  Layout
} from 'lucide-react';
import { 
  getMyAsignaciones, 
  getUnidades, 
  getTemas, 
  getEjercicios, 
  upsertUnidad, 
  upsertTema, 
  upsertEjercicio, 
  deleteUnidad, 
  deleteTema, 
  deleteEjercicio,
  getSlides,
  upsertSlide,
  deleteSlide,
  getResources,
  upsertResource,
  deleteResourceRecord
} from '@/lib/actions/academic';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const LOGO_URL = '/images/logo_zapata.png';

const ACTIVITY_TEMPLATES = [
  { id: 'opcion_multiple', label: 'Opción Múltiple', icon: <CheckCircle2 size={16} />, color: 'bg-blue-500' },
  { id: 'verdadero_falso', label: 'Verdadero / Falso', icon: <HelpCircle size={16} />, color: 'bg-emerald-500' },
  { id: 'emparejamiento', label: 'Emparejamiento', icon: <Layout size={16} />, color: 'bg-purple-500' },
  { id: 'ordenar_secuencia', label: 'Ordenar Secuencia', icon: <Hash size={16} />, color: 'bg-orange-500' },
  { id: 'completar_espacios', label: 'Completar Espacios', icon: <Type size={16} />, color: 'bg-pink-500' },
  { id: 'sopa_letras', label: 'Sopa de Letras', icon: <AlignLeft size={16} />, color: 'bg-indigo-500' },
  { id: 'flashcards', label: 'Flashcards', icon: <Sparkles size={16} />, color: 'bg-amber-500' },
];

export default function ProfesorDashboard() {
  const { toast } = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  
  const [selectedMateria, setSelectedMateria] = useState<any>(null);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [selectedUnidad, setSelectedUnidad] = useState<any>(null);
  const [temas, setTemas] = useState<any[]>([]);
  const [selectedTema, setSelectedTema] = useState<any>(null);
  const [ejercicios, setEjercicios] = useState<any[]>([]);
  
  const [slides, setSlides] = useState<any[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [presentationMode, setPresentationMode] = useState(false);
  const [slideDialogOpen, setSlideDialogOpne] = useState(false);

  const [resources, setResources] = useState<any[]>([]);
  const [isResourceDialogOpen, setIsResourceDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [currentTab, setCurrentTab] = useState('materias');
  const [dialog, setDialog] = useState<any>({ open: false, type: '', data: {} });

  const fetchInitialData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await getMyAsignaciones(user.id);
      if (data) setAsignaciones(data);
    }
    setLoading(false);
  };

  useEffect(() => { fetchInitialData(); }, []);

  const fetchUnidades = async (mId: string) => {
    const { data } = await getUnidades(mId);
    if (data) setUnidades(data);
  };

  const fetchTemas = async (uId: string) => {
    const { data } = await getTemas(uId);
    if (data) setTemas(data);
  };

  const fetchEjercicios = async (tId: string) => {
    const { data } = await getEjercicios(tId);
    if (data) setEjercicios(data);
  };

  const fetchSlides = async (tId: string) => {
    const { data } = await getSlides(tId);
    if (data) setSlides(data || []);
  };

  const fetchResources = async (tId: string) => {
    const { data } = await getResources(tId);
    if (data) setResources(data || []);
  };

  const handleSave = async () => {
    let result;
    const d = dialog.data;
    const { data: { user } } = await supabase.auth.getUser();
    
    try {
      if (dialog.type === 'unidad') {
        if (!selectedMateria?.id) {
          toast({ variant: "destructive", title: "Error", description: "No hay una materia seleccionada." });
          return;
        }
        result = await upsertUnidad({...d, materia_id: selectedMateria.id, created_by: user?.id});
      }
      
      if (dialog.type === 'tema') {
        if (!selectedUnidad?.id) {
          toast({ variant: "destructive", title: "Error", description: "No hay una unidad seleccionada." });
          return;
        }
        result = await upsertTema({...d, unidad_id: selectedUnidad.id, created_by: user?.id});
      }
      
      if (dialog.type === 'ejercicio') {
        if (!selectedTema?.id) {
          toast({ variant: "destructive", title: "Error", description: "No hay un tema seleccionado." });
          return;
        }
        // Asegurar que el contenido sea un objeto serializable
        const finalContent = typeof d.contenido === 'string' ? d.contenido : JSON.stringify(d.contenido || {});
        result = await upsertEjercicio({...d, contenido: finalContent, tema_id: selectedTema.id, created_by: user?.id});
      }

      if (result && !result.error) {
        toast({ title: "Guardado con éxito" });
        setDialog({ ...dialog, open: false });
        if (dialog.type === 'unidad') fetchUnidades(selectedMateria.id);
        if (dialog.type === 'tema') fetchTemas(selectedUnidad.id);
        if (dialog.type === 'ejercicio') fetchEjercicios(selectedTema.id);
      } else if (result) {
        toast({ variant: "destructive", title: "Error", description: result.error?.message || "No se pudo guardar." });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (type: string, id: string) => {
    let error;
    if (type === 'unidad') ({ error } = await deleteUnidad(id));
    if (type === 'tema') ({ error } = await deleteTema(id));
    if (type === 'ejercicio') ({ error } = await deleteEjercicio(id));

    if (!error) {
      toast({ title: "Eliminado correctamente" });
      if (type === 'unidad') { fetchUnidades(selectedMateria.id); setSelectedUnidad(null); }
      if (type === 'tema') { fetchTemas(selectedUnidad.id); setSelectedTema(null); }
      if (type === 'ejercicio') fetchEjercicios(selectedTema.id);
    }
  };

  const handleOpenSlideEditor = (tema: any) => {
    setSelectedTema(tema);
    fetchSlides(tema.id);
    setSlideDialogOpne(true);
  };

  const handleAddSlide = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const newSlide = {
      tema_id: selectedTema.id,
      titulo: 'Nueva Diapositiva',
      contenido: 'Contenido de la diapositiva...',
      orden: slides.length + 1,
      created_by: user?.id,
      estilo: 'azul'
    };
    const { data, error } = await upsertSlide(newSlide);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Ocurrió un problema al crear la diapositiva." });
      return;
    }
    if (data) {
      setSlides([...slides, data]);
      setActiveSlideIndex(slides.length);
    }
  };

  const handleUpdateSlide = async (id: string, updates: any) => {
    const slideToUpdate = slides.find(s => s.id === id);
    if (!slideToUpdate) return;
    const updated = { ...slideToUpdate, ...updates };
    setSlides(slides.map(s => s.id === id ? updated : s));
    await upsertSlide(updated);
  };

  const handleDeleteSlide = async (id: string) => {
    const { error } = await deleteSlide(id);
    if (!error) {
      const newSlides = slides.filter(s => s.id !== id);
      setSlides(newSlides);
      if (activeSlideIndex >= newSlides.length) setActiveSlideIndex(Math.max(0, newSlides.length - 1));
    }
  };

  const handleOpenResourceDialog = (tema: any) => {
    setSelectedTema(tema);
    fetchResources(tema.id);
    setIsResourceDialogOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Archivo demasiado grande", description: "El límite es de 3MB por archivo." });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedTema.id}/${Date.now()}.${fileExt}`;
      const filePath = `recursos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('recursos-educativos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('recursos-educativos')
        .getPublicUrl(filePath);

      const newResource = {
        tema_id: selectedTema.id,
        titulo: file.name,
        archivo_url: publicUrl,
        file_path: filePath,
        tipo: fileExt?.toLowerCase(),
        created_by: user.id
      };

      const { error: dbError } = await upsertResource(newResource);
      if (dbError) throw dbError;

      toast({ title: "Archivo cargado", description: "El recurso está disponible para los alumnos." });
      fetchResources(selectedTema.id);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error al cargar", description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteResource = async (resource: any) => {
    try {
      const { error: storageError } = await supabase.storage
        .from('recursos-educativos')
        .remove([resource.file_path]);

      if (storageError) console.warn("Error al borrar de Storage:", storageError);

      const { error: dbError } = await deleteResourceRecord(resource.id);
      if (dbError) throw dbError;

      toast({ title: "Recurso eliminado" });
      setResources(resources.filter(r => r.id !== resource.id));
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (presentationMode) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        setActiveSlideIndex((prev) => Math.min(prev + 1, slides.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setActiveSlideIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Escape') {
        setPresentationMode(false);
      }
    }
  }, [presentationMode, slides.length]);

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
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.warn(`Error al intentar entrar en pantalla completa: ${err.message}`);
        });
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch((err) => {
          console.warn(`Error al intentar salir de pantalla completa: ${err.message}`);
        });
      }
    }
  }, [presentationMode]);

  const splitImageUrls = (urls: string) => {
    if (!urls) return [];
    return urls.split(/,(?=http|data:)/).map(u => u.trim()).filter(Boolean);
  };

  const ImageGrid = ({ urls }: { urls: string }) => {
    const list = splitImageUrls(urls);
    if (list.length === 0) return null;
    
    return (
      <div className={cn(
        "grid gap-4 w-full h-full p-4",
        list.length === 1 ? "grid-cols-1" : 
        list.length === 2 ? "grid-cols-2" : 
        list.length >= 3 ? "grid-cols-2 grid-rows-2" : ""
      )}>
        {list.map((url, i) => (
          <div key={i} className="relative w-full h-full overflow-hidden rounded-2xl shadow-2xl border border-white/10">
            <img src={url} alt="Slide content" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    );
  };

  // Helper para inicializar el contenido de una actividad según su tipo
  const initActivityContent = (type: string) => {
    switch(type) {
      case 'opcion_multiple': return { items: [{ question: '', options: [{id: '1', text: ''}], correctId: '1', feedback: '' }] };
      case 'verdadero_falso': return { items: [{ statement: '', correct: true, feedback: '' }] };
      case 'emparejamiento': return { items: [{ left: '', right: '' }] };
      case 'ordenar_secuencia': return { items: [''] };
      case 'completar_espacios': return { text: '', bank: [] };
      case 'sopa_letras': return { words: [''], clues: [''], size: 12 };
      case 'flashcards': return { items: [{ front: '', back: '' }] };
      default: return {};
    }
  };

  // Renderizador del editor de plantillas
  const TemplateEditor = () => {
    const type = dialog.data.tipo;
    const content = dialog.data.contenido || initActivityContent(type);

    const updateContent = (newContent: any) => {
      setDialog({ ...dialog, data: { ...dialog.data, contenido: newContent } });
    };

    if (type === 'opcion_multiple') {
      return (
        <div className="space-y-6">
          {content.items.map((item: any, qIdx: number) => (
            <div key={qIdx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black text-primary uppercase">Pregunta {qIdx + 1}</span>
                {content.items.length > 1 && (
                  <Button variant="ghost" size="sm" className="text-destructive h-6" onClick={() => {
                    const newItems = [...content.items];
                    newItems.splice(qIdx, 1);
                    updateContent({ ...content, items: newItems });
                  }}><Trash2 size={14} /></Button>
                )}
              </div>
              <Input placeholder="Enunciado de la pregunta..." value={item.question} onChange={(e) => {
                const newItems = [...content.items];
                newItems[qIdx].question = e.target.value;
                updateContent({ ...content, items: newItems });
              }} />
              <div className="space-y-2">
                {item.options.map((opt: any, oIdx: number) => (
                  <div key={oIdx} className="flex gap-2 items-center">
                    <input type="radio" checked={item.correctId === opt.id} onChange={() => {
                      const newItems = [...content.items];
                      newItems[qIdx].correctId = opt.id;
                      updateContent({ ...content, items: newItems });
                    }} />
                    <Input placeholder={`Opción ${oIdx + 1}`} value={opt.text} onChange={(e) => {
                      const newItems = [...content.items];
                      newItems[qIdx].options[oIdx].text = e.target.value;
                      updateContent({ ...content, items: newItems });
                    }} />
                    <Button variant="ghost" size="sm" onClick={() => {
                      const newItems = [...content.items];
                      newItems[qIdx].options.splice(oIdx, 1);
                      updateContent({ ...content, items: newItems });
                    }}><X size={14} /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full text-[10px] uppercase font-bold" onClick={() => {
                  const newItems = [...content.items];
                  newItems[qIdx].options.push({ id: Math.random().toString(), text: '' });
                  updateContent({ ...content, items: newItems });
                }}>+ Añadir Opción</Button>
              </div>
            </div>
          ))}
          <Button className="w-full bg-primary/10 text-primary border-none font-black text-xs uppercase" onClick={() => {
            updateContent({ ...content, items: [...content.items, { question: '', options: [{id: '1', text: ''}], correctId: '1', feedback: '' }] });
          }}>+ Añadir Pregunta</Button>
        </div>
      );
    }

    if (type === 'verdadero_falso') {
      return (
        <div className="space-y-4">
          {content.items.map((item: any, idx: number) => (
            <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-4">
              <Input placeholder="Afirmación..." value={item.statement} className="flex-1" onChange={(e) => {
                const newItems = [...content.items];
                newItems[idx].statement = e.target.value;
                updateContent({ ...content, items: newItems });
              }} />
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-black uppercase">{item.correct ? 'Verdadero' : 'Falso'}</span>
                <Switch checked={item.correct} onCheckedChange={(val) => {
                  const newItems = [...content.items];
                  newItems[idx].correct = val;
                  updateContent({ ...content, items: newItems });
                }} />
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                const newItems = [...content.items];
                newItems.splice(idx, 1);
                updateContent({ ...content, items: newItems });
              }}><X size={14} /></Button>
            </div>
          ))}
          <Button variant="outline" className="w-full text-xs font-black uppercase" onClick={() => {
            updateContent({ ...content, items: [...content.items, { statement: '', correct: true, feedback: '' }] });
          }}>+ Nueva Afirmación</Button>
        </div>
      );
    }

    if (type === 'emparejamiento') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 px-4 text-[10px] font-black uppercase text-slate-400">
            <span>Concepto (Izq)</span>
            <span>Relación (Der)</span>
          </div>
          {content.items.map((item: any, idx: number) => (
            <div key={idx} className="flex gap-2 items-center">
              <Input placeholder="Concepto..." value={item.left} onChange={(e) => {
                const newItems = [...content.items];
                newItems[idx].left = e.target.value;
                updateContent({ ...content, items: newItems });
              }} />
              <Input placeholder="Definición..." value={item.right} onChange={(e) => {
                const newItems = [...content.items];
                newItems[idx].right = e.target.value;
                updateContent({ ...content, items: newItems });
              }} />
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => {
                const newItems = [...content.items];
                newItems.splice(idx, 1);
                updateContent({ ...content, items: newItems });
              }}><Trash2 size={14} /></Button>
            </div>
          ))}
          <Button variant="outline" className="w-full text-xs font-black uppercase" onClick={() => {
            updateContent({ ...content, items: [...content.items, { left: '', right: '' }] });
          }}>+ Añadir Par</Button>
        </div>
      );
    }

    if (type === 'ordenar_secuencia') {
      return (
        <div className="space-y-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase italic">Ingresa los pasos en el orden correcto. El sistema los mezclará automáticamente para el alumno.</p>
          {content.items.map((item: string, idx: number) => (
            <div key={idx} className="flex gap-2 items-center">
              <span className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center font-black text-xs">{idx + 1}</span>
              <Input placeholder="Describe el paso..." value={item} onChange={(e) => {
                const newItems = [...content.items];
                newItems[idx] = e.target.value;
                updateContent({ ...content, items: newItems });
              }} />
              <Button variant="ghost" size="sm" onClick={() => {
                const newItems = [...content.items];
                newItems.splice(idx, 1);
                updateContent({ ...content, items: newItems });
              }}><X size={14} /></Button>
            </div>
          ))}
          <Button variant="outline" className="w-full text-xs font-black uppercase" onClick={() => {
            updateContent({ ...content, items: [...content.items, ''] });
          }}>+ Añadir Paso</Button>
        </div>
      );
    }

    if (type === 'completar_espacios') {
      return (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-[11px] text-amber-800 leading-relaxed">
            <strong>Instrucciones:</strong> Escribe tu texto normal y encierra entre corchetes dobles <code>[[ ]]</code> las palabras que quieres que el alumno complete.
            <br/><br/>
            <em>Ejemplo: La célula es la [[unidad básica]] de los seres vivos.</em>
          </div>
          <textarea rows={8} className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:ring-primary/20 outline-none" placeholder="Redacta el texto aquí..." value={content.text} onChange={(e) => updateContent({ ...content, text: e.target.value })} />
        </div>
      );
    }

    if (type === 'flashcards') {
      return (
        <div className="space-y-6">
          {content.items.map((item: any, idx: number) => (
            <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 relative group">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-slate-400">Frente (Término)</label>
                <textarea rows={3} className="w-full p-3 rounded-xl border-slate-200 text-sm outline-none" value={item.front} onChange={(e) => {
                  const newItems = [...content.items];
                  newItems[idx].front = e.target.value;
                  updateContent({ ...content, items: newItems });
                }} />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-slate-400">Reverso (Definición)</label>
                <textarea rows={3} className="w-full p-3 rounded-xl border-slate-200 text-sm outline-none" value={item.back} onChange={(e) => {
                  const newItems = [...content.items];
                  newItems[idx].back = e.target.value;
                  updateContent({ ...content, items: newItems });
                }} />
              </div>
              <button className="absolute -top-2 -right-2 bg-white shadow-md rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity text-destructive" onClick={() => {
                const newItems = [...content.items];
                newItems.splice(idx, 1);
                updateContent({ ...content, items: newItems });
              }}><X size={16} /></button>
            </div>
          ))}
          <Button variant="outline" className="w-full text-xs font-black uppercase" onClick={() => {
            updateContent({ ...content, items: [...content.items, { front: '', back: '' }] });
          }}>+ Nueva Tarjeta</Button>
        </div>
      );
    }

    return (
      <div className="p-8 text-center opacity-30 italic">
        Configura los parámetros de esta plantilla.
      </div>
    );
  };

  if (presentationMode && slides.length > 0) {
    const slide = slides[activeSlideIndex];
    const styleMap: any = {
      'azul': 'bg-slate-900 from-slate-900 to-blue-900 text-white',
      'vino': 'bg-[#4c0519] from-[#4c0519] to-[#8B2332] text-white',
      'verde': 'bg-[#064e3b] from-[#064e3b] to-[#1A4A3F] text-white',
      'oscuro': 'bg-black from-black to-slate-900 text-white'
    };

    return (
      <div className={cn(
        "fixed inset-0 z-[100] grid grid-rows-[1fr_auto] overflow-hidden animate-in fade-in duration-500 bg-gradient-to-br",
        styleMap[slide.estilo || 'azul']
      )}>
        <div className="absolute top-0 left-0 h-1.5 bg-blue-400/50 w-full z-50">
          <div className="h-full bg-blue-400 transition-all duration-500 shadow-[0_0_15px_rgba(96,165,250,0.8)]" style={{ width: `${((activeSlideIndex + 1) / slides.length) * 100}%` }} />
        </div>
        <div className="relative flex flex-col md:flex-row items-center justify-center gap-8 p-10 md:p-20 overflow-hidden">
          <div className="flex-1 flex flex-col justify-center max-w-full overflow-hidden">
            <h1 className="font-black uppercase tracking-tight mb-6 leading-tight animate-in slide-in-from-left-8 duration-700" style={{ fontSize: 'clamp(2rem, 8vw, 5rem)' }}>{slide.titulo || 'Sin Título'}</h1>
            <div className="overflow-y-auto max-h-[50vh] pr-4 custom-scrollbar">
              <p className="font-medium leading-relaxed opacity-90 animate-in slide-in-from-bottom-8 duration-700 delay-200" style={{ fontSize: 'clamp(1rem, 2.5vw, 2.2rem)' }}>{slide.contenido || ''}</p>
            </div>
          </div>
          <div className="flex-1 w-full h-full max-h-[60vh] md:max-h-full flex items-center justify-center animate-in zoom-in-95 duration-700">
            {slide.imagen_url ? <ImageGrid urls={slide.imagen_url} /> : <div className="w-full aspect-video flex flex-col items-center justify-center bg-white/5 rounded-3xl border-2 border-dashed border-white/10 opacity-30"><ImageIcon size={100} /></div>}
          </div>
        </div>
        <div className="py-3 px-6 md:px-10 flex items-center justify-between bg-black/30 backdrop-blur-2xl border-t border-white/5 z-[110]">
          <div className="flex gap-4">
            <Button variant="ghost" className="h-12 w-12 rounded-full text-white hover:bg-white/10" onClick={() => setActiveSlideIndex(Math.max(0, activeSlideIndex - 1))} disabled={activeSlideIndex === 0}><ChevronLeft size={32} /></Button>
            <div className="flex items-center px-4 text-xl font-black tabular-nums tracking-widest text-white/40"><span className="text-white">{activeSlideIndex + 1}</span> / {slides.length}</div>
            <Button variant="ghost" className="h-12 w-12 rounded-full text-white hover:bg-white/10" onClick={() => setActiveSlideIndex(Math.min(activeSlideIndex + 1, slides.length - 1))} disabled={activeSlideIndex === slides.length - 1}><ChevronRight size={32} /></Button>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
              <img src={LOGO_URL} alt="Logo IEEZ" className="h-20 w-auto object-contain" />
              <span className="hidden lg:block text-[10px] font-black uppercase tracking-[0.3em] text-white/40">IEEZ Plataforma de Enseñanza</span>
            </div>
            <Button variant="outline" className="h-10 px-6 rounded-xl font-black uppercase tracking-widest bg-red-600/20 border-red-600/30 text-red-100 hover:bg-red-600 hover:text-white transition-all shadow-lg" onClick={() => setPresentationMode(false)}><X size={18} className="mr-2" /> Salir (Esc)</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black font-headline tracking-tight text-primary uppercase">Panel Docente</h2>
          <p className="text-muted-foreground font-medium">Gestiona el contenido de tus materias asignadas.</p>
        </div>
      </div>

      {asignaciones.length === 0 ? (
        <Card className="border-2 border-dashed rounded-[40px] p-20 text-center bg-white shadow-inner">
          <BookOpen className="mx-auto h-20 w-20 text-slate-200 mb-6" />
          <h3 className="text-xl font-black text-slate-800 uppercase">Sin materias asignadas</h3>
          <p className="text-slate-500 mt-2 max-w-sm mx-auto">Aún no tienes carga académica vinculada. Contacta a la dirección para habilitar tus materias.</p>
        </Card>
      ) : (
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-14 bg-muted/50 rounded-2xl p-1 shadow-sm border mb-8">
            <TabsTrigger value="materias" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Mis Materias</TabsTrigger>
            <TabsTrigger value="unidades" disabled={!selectedMateria} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Unidades</TabsTrigger>
            <TabsTrigger value="temas" disabled={!selectedUnidad} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Temas</TabsTrigger>
            <TabsTrigger value="ejercicios" disabled={!selectedTema} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Actividades</TabsTrigger>
          </TabsList>

          <TabsContent value="materias" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {asignaciones.map((asig) => (
                <Card 
                  key={asig.id} 
                  onClick={() => { 
                    setSelectedMateria({ ...asig.materias, id: asig.materia_id }); 
                    fetchUnidades(asig.materia_id); 
                    setCurrentTab('unidades'); 
                  }} 
                  className="cursor-pointer hover:shadow-2xl transition-all duration-300 border-2 border-slate-100 hover:border-primary/40 group relative overflow-hidden bg-white rounded-3xl"
                >
                  <div className="h-2 bg-primary/20 group-hover:bg-primary transition-colors" />
                  <CardHeader className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <Badge variant="outline" className="text-[9px] font-black bg-primary/5 text-primary border-primary/20 uppercase tracking-tighter">{asig.niveles?.nombre}</Badge>
                      <div className="p-2 rounded-xl bg-slate-50 text-slate-400 group-hover:text-primary transition-colors"><ChevronRight size={20} /></div>
                    </div>
                    <CardTitle className="text-xl font-black text-slate-800 uppercase leading-tight group-hover:text-primary transition-colors">{asig.materias?.nombre}</CardTitle>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mt-2">{asig.carreras?.nombre}</p>
                  </CardHeader>
                  <CardContent className="px-6 pb-6 pt-0 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-tighter bg-slate-50 p-2 rounded-xl border border-slate-100"><Users size={14} className="text-primary/60" /> GRUPOS: {asig.grupo_id ? asig.grupo_id.split(',').length : 'GENERAL'}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="unidades" className="mt-0">
            <Card className="rounded-[32px] border-muted/60 shadow-xl overflow-hidden h-[70vh] flex flex-col">
              <CardHeader className="bg-slate-50/50 pb-6 border-b shrink-0">
                <div className="flex flex-row items-center justify-between">
                  <div>
                    <Button variant="ghost" size="sm" onClick={() => setCurrentTab('materias')} className="mb-2 -ml-2 text-primary font-black uppercase text-[10px] tracking-widest hover:bg-primary/5"><ArrowLeft size={14} className="mr-1" /> Volver a Materias</Button>
                    <CardTitle className="text-2xl font-black uppercase text-slate-800 flex items-center gap-3"><ListTree className="text-primary" size={24} /> {selectedMateria?.nombre}</CardTitle>
                    <CardDescription className="text-xs font-bold uppercase tracking-tight text-slate-500 mt-1">Gestión de unidades didácticas</CardDescription>
                  </div>
                  <Button size="lg" className="rounded-2xl bg-primary text-white font-black uppercase tracking-widest gap-2 shadow-lg" onClick={() => setDialog({ open: true, type: 'unidad', data: { titulo: '', orden: unidades.length + 1 } })}><Plus size={18} /> Nueva Unidad</Button>
                </div>
              </CardHeader>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="space-y-4">
                  {unidades.length === 0 ? <div className="py-20 text-center text-muted-foreground italic bg-slate-50 rounded-3xl border-2 border-dashed">No has creado unidades para esta materia aún.</div> : unidades.map((u) => (
                    <div key={u.id} onClick={() => { setSelectedUnidad(u); fetchTemas(u.id); setCurrentTab('temas'); }} className={`p-6 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition-all duration-300 group ${selectedUnidad?.id === u.id ? 'bg-primary/5 border-primary shadow-md' : 'border-slate-50 hover:border-primary/20 hover:bg-white hover:shadow-lg'}`}>
                      <div className="flex items-center gap-6">
                        <span className="h-12 w-12 rounded-2xl bg-primary text-white flex items-center justify-center font-black text-lg shadow-lg group-hover:scale-110 transition-transform">{u.orden}</span>
                        <div className="flex flex-col">
                          <span className="font-black text-slate-800 text-lg uppercase leading-none">{u.titulo}</span>
                          <span className="text-[10px] font-bold text-slate-400 mt-2 tracking-widest uppercase">Unidad de aprendizaje</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                         <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-400 hover:text-primary hover:bg-primary/5" onClick={(e) => { e.stopPropagation(); setDialog({ open: true, type: 'unidad', data: u }); }}><Edit size={18}/></Button>
                         <ChevronRight size={20} className="text-slate-300 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="temas" className="mt-0">
             <Card className="rounded-[32px] border-muted/60 shadow-xl overflow-hidden h-[70vh] flex flex-col">
               <CardHeader className="bg-slate-50/50 pb-6 border-b shrink-0">
                 <div className="flex flex-row items-center justify-between">
                   <div>
                     <Button variant="ghost" size="sm" onClick={() => setCurrentTab('unidades')} className="mb-2 -ml-2 text-primary font-black uppercase text-[10px] tracking-widest hover:bg-primary/5"><ArrowLeft size={14} className="mr-1" /> Volver a Unidades</Button>
                     <CardTitle className="text-2xl font-black uppercase text-slate-800 flex items-center gap-3"><FileText className="text-primary" size={24} /> {selectedUnidad?.titulo}</CardTitle>
                     <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Temarios y contenido didáctico</p>
                   </div>
                   <Button size="lg" className="rounded-2xl bg-primary text-white font-black uppercase tracking-widest gap-2 shadow-lg" onClick={() => setDialog({ open: true, type: 'tema', data: { titulo: '', contenido: '', orden: temas.length + 1 } })}><Plus size={18} /> Nuevo Tema</Button>
                 </div>
               </CardHeader>
               <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {temas.length === 0 ? <div className="md:col-span-2 py-20 text-center text-muted-foreground italic bg-slate-50 rounded-3xl border-2 border-dashed">Esta unidad aún no tiene temas publicados.</div> : temas.map((t) => (
                     <div key={t.id} onClick={() => { setSelectedTema(t); fetchEjercicios(t.id); setCurrentTab('ejercicios'); }} className="p-6 border-2 border-slate-50 rounded-[24px] flex flex-col gap-4 cursor-pointer hover:bg-white hover:shadow-xl hover:border-primary/20 transition-all group">
                       <div className="flex items-center justify-between">
                         <div className="flex flex-col">
                           <span className="font-black text-slate-700 uppercase tracking-tight leading-tight">{t.titulo}</span>
                           <span className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Contenido disponible</span>
                         </div>
                         <div className="flex items-center gap-1">
                           <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500" onClick={(e) => { e.stopPropagation(); handleOpenSlideEditor(t); }} title="Presentación PowerPoint"><Presentation size={18}/></Button>
                           <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500" onClick={(e) => { e.stopPropagation(); handleOpenResourceDialog(t); }} title="Subir Recursos/Archivos"><Paperclip size={18}/></Button>
                           <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={(e) => { e.stopPropagation(); setDialog({ open: true, type: 'tema', data: t }); }} title="Editar Tema"><Edit size={16}/></Button>
                         </div>
                       </div>
                       <Separator className="opacity-50" />
                       <div className="flex justify-between items-center text-[10px] font-black uppercase text-primary tracking-widest"><span>Ver Actividades</span><ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" /></div>
                     </div>
                   ))}
                 </div>
               </div>
             </Card>
          </TabsContent>

          <TabsContent value="ejercicios" className="mt-0">
             <Card className="rounded-[32px] border-muted/60 shadow-xl overflow-hidden h-[70vh] flex flex-col">
               <CardHeader className="bg-slate-50/50 pb-6 border-b shrink-0">
                 <div className="flex flex-row items-center justify-between">
                   <div>
                     <Button variant="ghost" size="sm" onClick={() => setCurrentTab('temas')} className="mb-2 -ml-2 text-primary font-black uppercase text-[10px] tracking-widest hover:bg-primary/5"><ArrowLeft size={14} className="mr-1" /> Volver a Temas</Button>
                     <CardTitle className="text-2xl font-black uppercase text-slate-800 flex items-center gap-3"><Sparkles className="text-amber-500" size={24} /> Actividades de {selectedTema?.titulo}</CardTitle>
                     <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Prácticas y reforzamiento interactivo</p>
                   </div>
                   <Button size="lg" className="rounded-2xl bg-amber-500 text-white font-black uppercase tracking-widest gap-2 shadow-lg hover:bg-amber-600" onClick={() => setDialog({ open: true, type: 'ejercicio', data: { titulo: '', tipo: 'opcion_multiple', contenido: initActivityContent('opcion_multiple'), orden: ejercicios.length + 1 } })}><Plus size={18} /> Nueva Actividad</Button>
                 </div>
               </CardHeader>
               <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                 <Table>
                   <TableHeader className="bg-slate-50/50"><TableRow><TableHead className="font-black uppercase text-[10px] text-slate-500">Orden</TableHead><TableHead className="font-black uppercase text-[10px] text-slate-500">Actividad</TableHead><TableHead className="font-black uppercase text-[10px] text-slate-500">Tipo</TableHead><TableHead className="text-right font-black uppercase text-[10px] text-slate-500">Acciones</TableHead></TableRow></TableHeader>
                   <TableBody>
                     {ejercicios.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground italic">Sin actividades registradas.</TableCell></TableRow> : ejercicios.map((e) => {
                       const template = ACTIVITY_TEMPLATES.find(t => t.id === e.tipo);
                       // Parsear contenido si es string
                       const safeContent = typeof e.contenido === 'string' ? JSON.parse(e.contenido || '{}') : e.contenido;
                       
                       return (
                        <TableRow key={e.id} className="hover:bg-amber-50/30 transition-colors">
                          <TableCell className="font-black text-slate-400">{e.orden}</TableCell>
                          <TableCell className="font-bold text-slate-700 uppercase tracking-tight">{e.titulo}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[9px] font-black uppercase border-none text-white", template?.color || 'bg-slate-400')}>
                              {template?.label || 'General'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => {
                                setDialog({ open: true, type: 'ejercicio', data: { ...e, contenido: safeContent } });
                              }}><Edit size={16}/></Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-red-50"><Trash2 size={16}/></Button></AlertDialogTrigger>
                                <AlertDialogContent className="rounded-3xl">
                                  <AlertDialogHeader><AlertDialogTitle className="font-black uppercase">¿Eliminar actividad?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer. Los alumnos ya no verán esta tarea en su portal.</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive rounded-xl" onClick={() => handleDelete('ejercicio', e.id)}>Eliminar Permanentemente</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                       );
                     })}
                   </TableBody>
                 </Table>
               </div>
             </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* PROFESSOR ACADEMIC DIALOG */}
      <Dialog open={dialog.open} onOpenChange={o => setDialog({...dialog, open: o})}>
        <DialogContent className={cn(
          "w-[95vw] max-h-[90vh] flex flex-col p-0 rounded-[32px] overflow-hidden",
          dialog.type === 'ejercicio' ? 'max-w-4xl' : 'max-w-xl'
        )}>
          <DialogHeader className="p-6 md:p-8 pb-4 shrink-0 bg-slate-50 border-b">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-3 rounded-2xl text-white",
                dialog.type === 'ejercicio' ? 'bg-amber-500' : 'bg-primary'
              )}>
                {dialog.type === 'ejercicio' ? <Sparkles size={24} /> : <FileText size={24} />}
              </div>
              <div>
                <DialogTitle className="capitalize font-black text-2xl uppercase tracking-tight text-slate-800">
                  {dialog.data.id ? 'Editar' : 'Nueva'} {dialog.type}
                </DialogTitle>
                <DialogDescription className="text-xs uppercase font-bold text-slate-400">
                  {dialog.type === 'ejercicio' ? 'Selecciona una plantilla y configura los reactivos.' : 'Completa la información técnica del contenido.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6 custom-scrollbar">
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Título Principal</label>
                  <Input placeholder="EJ. EVALUACIÓN DE CONCEPTOS" className="h-12 rounded-xl bg-white border-slate-200 focus:ring-primary/20 uppercase font-bold" value={dialog.data.titulo || ''} onChange={e => setDialog({...dialog, data: {...dialog.data, titulo: e.target.value.toUpperCase()}})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Orden</label>
                  <Input type="number" className="h-12 rounded-xl bg-white border-slate-200" value={dialog.data.orden || 1} onChange={e => setDialog({...dialog, data: {...dialog.data, orden: parseInt(e.target.value)}})} />
                </div>
              </div>

              {dialog.type === 'tema' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Contenido / Descripción</label>
                  <textarea rows={6} className="w-full p-4 rounded-xl bg-slate-50 border-slate-200 text-sm focus:ring-primary/20 outline-none" placeholder="Redacta aquí el contenido del tema..." value={dialog.data.contenido || ''} onChange={e => setDialog({...dialog, data: {...dialog.data, contenido: e.target.value}})} />
                </div>
              )}

              {dialog.type === 'ejercicio' && (
                <div className="space-y-10">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-primary tracking-[0.2em] flex items-center gap-2">
                      <Layout size={14} /> Seleccionar Plantilla de Actividad
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {ACTIVITY_TEMPLATES.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => {
                            setDialog({
                              ...dialog,
                              data: {
                                ...dialog.data,
                                tipo: tmpl.id,
                                contenido: initActivityContent(tmpl.id)
                              }
                            });
                          }}
                          className={cn(
                            "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all group",
                            dialog.data.tipo === tmpl.id 
                              ? "bg-primary/5 border-primary shadow-md" 
                              : "bg-white border-slate-100 hover:border-slate-200"
                          )}
                        >
                          <div className={cn(
                            "h-10 w-10 rounded-xl flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-110",
                            tmpl.color,
                            dialog.data.tipo === tmpl.id ? "scale-110" : ""
                          )}>
                            {tmpl.icon}
                          </div>
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-tighter text-center leading-tight",
                            dialog.data.tipo === tmpl.id ? "text-primary" : "text-slate-500"
                          )}>{tmpl.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-amber-600 tracking-[0.2em] flex items-center gap-2">
                      <Edit size={14} /> Configuración de Reactivos
                    </label>
                    <TemplateEditor />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="p-6 md:p-8 shrink-0 border-t bg-slate-50 gap-2">
            {dialog.data.id && (
              <Button variant="ghost" className="text-destructive font-black uppercase text-[10px] tracking-widest mr-auto hover:bg-red-50" onClick={() => { handleDelete(dialog.type, dialog.data.id); setDialog({...dialog, open: false}); }}>
                Eliminar {dialog.type}
              </Button>
            )}
            <Button variant="outline" className="rounded-2xl px-8 font-black uppercase text-[10px] tracking-widest h-12" onClick={() => setDialog({ ...dialog, open: false })}>
              Cancelar
            </Button>
            <Button className="bg-primary px-10 rounded-2xl font-black uppercase tracking-widest shadow-lg h-12" onClick={handleSave}>
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SLIDE EDITOR DIALOG */}
      <Dialog open={slideDialogOpen} onOpenChange={setSlideDialogOpne}>
        <DialogContent className="max-w-[95vw] w-[1300px] h-[90vh] flex flex-col p-0 rounded-3xl overflow-hidden shadow-2xl border-none">
          <DialogHeader className="p-6 bg-slate-900 border-b border-white/5 flex flex-row justify-between items-center space-y-0 shrink-0">
            <div>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-3">
                <Presentation className="text-blue-400" /> Diseño de Clase: {selectedTema?.titulo}
              </DialogTitle>
              <DialogDescription className="text-xs font-bold text-slate-400 uppercase">
                Organiza tus diapositivas y elige estilos visuales.
              </DialogDescription>
            </div>
            <div className="flex gap-3">
              <Button variant="default" className="bg-blue-600 hover:bg-blue-700 rounded-xl font-black uppercase tracking-widest gap-2 shadow-lg h-12 px-6" onClick={() => setPresentationMode(true)} disabled={slides.length === 0}>
                <Play size={18} fill="currentColor" /> Presentar
              </Button>
              <Button variant="ghost" className="rounded-xl font-bold text-white hover:bg-white/5 h-12 px-6 border border-white/10" onClick={() => setSlideDialogOpne(false)}>
                Cerrar
              </Button>
            </div>
          </DialogHeader>
          
          <div className="flex-1 flex overflow-hidden bg-slate-950">
            <aside className="w-72 bg-slate-900 border-r border-white/5 flex flex-col shrink-0">
              <div className="p-4 border-b border-white/5">
                <Button className="w-full gap-2 rounded-xl bg-blue-600 font-black uppercase text-[10px] tracking-widest h-12" onClick={handleAddSlide}>
                  <Plus size={14} /> Nueva Diapositiva
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {slides.map((s, idx) => (
                  <div key={s.id} onClick={() => setActiveSlideIndex(idx)} className={cn("p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-3 relative group", activeSlideIndex === idx ? "bg-blue-600/10 border-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.2)]" : "border-transparent hover:bg-white/5")}>
                    <span className="text-xs font-black text-slate-500">{idx + 1}</span>
                    <div className="flex-1 truncate">
                      <p className={cn("text-[11px] font-bold uppercase truncate", activeSlideIndex === idx ? "text-blue-400" : "text-slate-300")}>
                        {s.titulo || 'Sin Título'}
                      </p>
                    </div>
                    <button className="opacity-0 group-hover:opacity-100 h-7 w-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteSlide(s.id); }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </aside>
            <main className="flex-1 bg-slate-950 p-6 md:p-10 overflow-y-auto custom-scrollbar">
              {slides.length > 0 && slides[activeSlideIndex] ? (
                <div className="max-w-4xl mx-auto space-y-10">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] flex items-center gap-2">
                      <Palette size={14} /> Estilo Visual de la Diapositiva
                    </label>
                    <div className="grid grid-cols-4 gap-4">
                      {['azul', 'vino', 'verde', 'oscuro'].map((est) => (
                        <button key={est} onClick={() => handleUpdateSlide(slides[activeSlideIndex].id, { estilo: est })} className={cn("h-12 rounded-xl font-black text-[10px] uppercase transition-all border-2", slides[activeSlideIndex].estilo === est ? "border-blue-500 scale-105 shadow-lg" : "border-white/5 opacity-50 hover:opacity-100", est === 'azul' ? 'bg-blue-900 text-white' : est === 'vino' ? 'bg-rose-900 text-white' : est === 'verde' ? 'bg-emerald-900 text-white' : 'bg-slate-800 text-white')}>
                          {est}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Título Principal</label>
                    <Input className="text-2xl h-16 font-black uppercase border-none bg-white/5 text-white focus:bg-white/10 focus:ring-blue-500/50 rounded-2xl px-6 transition-all" placeholder="ESCRIBE EL TÍTULO AQUÍ..." value={slides[activeSlideIndex]?.titulo || ''} onChange={(e) => handleUpdateSlide(slides[activeSlideIndex].id, { titulo: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Cuerpo de Texto</label>
                    <textarea className="w-full p-6 text-lg min-h-[200px] font-medium leading-relaxed bg-white/5 border-none text-slate-200 focus:bg-white/10 focus:ring-blue-500/50 rounded-3xl outline-none resize-none transition-all" placeholder="Redacta los puntos clave de esta diapositiva..." value={slides[activeSlideIndex]?.contenido || ''} onChange={(e) => handleUpdateSlide(slides[activeSlideIndex].id, { contenido: e.target.value })} />
                  </div>
                  <div className="bg-blue-600/5 p-8 rounded-3xl border border-white/5 flex flex-col gap-6">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase text-blue-400 tracking-[0.2em] flex items-center gap-2">
                        <ImageIcon size={14} /> Enlaces de Imágenes (Separados por coma)
                      </label>
                      <textarea className="w-full p-4 bg-slate-900 border-white/10 rounded-2xl text-white text-sm focus:ring-blue-500/50 outline-none min-h-[80px]" placeholder="https://img1.jpg, https://img2.jpg o data:image/..." value={slides[activeSlideIndex]?.imagen_url || ''} onChange={(e) => handleUpdateSlide(slides[activeSlideIndex].id, { imagen_url: e.target.value })} />
                      <p className="text-[10px] text-slate-500 font-bold uppercase italic">Puedes agregar hasta 4 imágenes por diapositiva separadas por comas. El formato Base64 es compatible.</p>
                    </div>
                    <div className="h-48 grid grid-cols-2 md:grid-cols-4 gap-4">
                      {splitImageUrls(slides[activeSlideIndex]?.imagen_url).map((url: string, i: number) => (
                        <div key={i} className="relative group rounded-xl overflow-hidden border border-white/10">
                          <img src={url.trim()} alt="Pre" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      <div className="border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-600">
                        <Plus size={24} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-20">
                  <Presentation size={100} className="mb-6 text-white" />
                  <h3 className="text-3xl font-black uppercase text-white">Laboratorio Creativo</h3>
                  <p className="max-w-xs mt-4 text-slate-400">Haz clic en "+ Nueva Diapositiva" para comenzar a diseñar tu material educativo.</p>
                </div>
              )}
            </main>
          </div>
        </DialogContent>
      </Dialog>

      {/* RESOURCE MANAGEMENT DIALOG */}
      <Dialog open={isResourceDialogOpen} onOpenChange={setIsResourceDialogOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-0 rounded-[32px] overflow-hidden shadow-2xl">
          <DialogHeader className="p-6 md:p-8 bg-slate-50 border-b shrink-0">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                <Paperclip size={24} />
              </div>
              <div>
                <DialogTitle className="text-xl md:text-2xl font-black uppercase tracking-tight text-slate-800">Recursos de {selectedTema?.titulo}</DialogTitle>
                <DialogDescription className="text-xs font-bold text-slate-500 uppercase">Gestiona materiales descargables para tus alumnos.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
            <div className="space-y-8 pr-2">
              <div className="border-2 border-dashed border-slate-200 rounded-[24px] p-6 md:p-10 text-center hover:border-emerald-400 transition-colors bg-slate-50/50 group">
                <label className="cursor-pointer flex flex-col items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-white shadow-md flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                    {uploading ? <Loader2 className="animate-spin" size={32} /> : <FileUp size={32} />}
                  </div>
                  <div>
                    <p className="font-black text-slate-700 uppercase tracking-widest text-sm">
                      {uploading ? "Subiendo archivo..." : "Haz clic para subir un recurso"}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-tighter">PDF, WORD, EXCEL, PPTX o CSV (Máx. 3MB)</p>
                  </div>
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv" />
                </label>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
                  <File size={12} /> Archivos actuales ({resources.length})
                </h4>
                
                {resources.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 opacity-30 italic">
                    <Info size={32} className="mb-2" />
                    <p className="text-xs font-bold uppercase">No hay archivos en este tema</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {resources.map((res) => (
                      <div key={res.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:shadow-md transition-shadow group">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "h-10 w-10 rounded-xl flex items-center justify-center text-white font-black text-[10px] uppercase",
                            res.tipo === 'pdf' ? 'bg-red-500' : 
                            res.tipo === 'xls' || res.tipo === 'xlsx' || res.tipo === 'csv' ? 'bg-emerald-500' :
                            res.tipo === 'doc' || res.tipo === 'docx' ? 'bg-blue-500' :
                            res.tipo === 'ppt' || res.tipo === 'pptx' ? 'bg-orange-500' : 'bg-slate-500'
                          )}>
                            {res.tipo}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-700 uppercase text-xs truncate max-w-[150px] md:max-w-[250px]">{res.titulo}</span>
                            <span className="text-[9px] text-slate-400 font-bold uppercase">{new Date(res.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <a href={res.archivo_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:bg-blue-50">
                              <Download size={16} />
                            </Button>
                          </a>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-red-50" onClick={() => handleDeleteResource(res)}>
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 bg-slate-50 border-t shrink-0">
            <Button variant="outline" className="rounded-xl px-8 font-bold uppercase text-[10px] tracking-widest w-full md:w-auto" onClick={() => setIsResourceDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
