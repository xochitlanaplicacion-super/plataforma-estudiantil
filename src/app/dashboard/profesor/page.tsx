
"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  CheckCircle2,
  HelpCircle,
  Hash,
  Type,
  AlignLeft,
  Layout,
  Eye,
  FileSearch,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Grid3X3,
  EyeOff,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  XCircle,
  CalendarClock
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
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter, 
  DialogDescription 
} from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import confetti from 'canvas-confetti';
import { polyfill } from "mobile-drag-drop";
import "mobile-drag-drop/default.css";
import { ActivityPreview } from '@/components/shared/ActivityPreview';
import { PanelEntregasProfesor } from '@/components/shared/PanelEntregasProfesor';

const LOGO_URL = '/images/logo_zapata.png';


// --- CONFIGURACIÓN DE PLANTILLAS ---
const ACTIVITY_TEMPLATES = [
  { id: 'actividad_descriptiva', label: 'Actividad Descriptiva', icon: <FileSearch size={16} />, color: 'bg-slate-700' },
  { id: 'crucigrama', label: 'Crucigrama', icon: <Grid3X3 size={16} />, color: 'bg-rose-600' },
  { id: 'opcion_multiple', label: 'Opción Múltiple', icon: <CheckCircle2 size={16} />, color: 'bg-blue-500' },
  { id: 'verdadero_falso', label: 'Verdadero / Falso', icon: <HelpCircle size={16} />, color: 'bg-emerald-500' },
  { id: 'emparejamiento', label: 'Emparejamiento', icon: <Layout size={16} />, color: 'bg-purple-500' },
  { id: 'ordenar_secuencia', label: 'Ordenar Secuencia', icon: <Hash size={16} />, color: 'bg-orange-500' },
  { id: 'completar_espacios', label: 'Completar Espacios', icon: <Type size={16} />, color: 'bg-pink-500' },
  { id: 'sopa_letras', label: 'Sopa de Letras', icon: <AlignLeft size={16} />, color: 'bg-indigo-500' },
  { id: 'flashcards', label: 'Flashcards', icon: <Sparkles size={16} />, color: 'bg-amber-500' },
];

const initActivityContent = (type: string) => {
  switch(type) {
    case 'actividad_descriptiva': return { fileUrl: '', fileName: '' };
    case 'crucigrama': return { words: [''], clues: [''], showWordList: false };
    case 'opcion_multiple': return { items: [{ question: '', options: [{id: '1', text: ''}], correctId: '1', feedback: '' }] };
    case 'verdadero_falso': return { items: [{ statement: '', correct: true, feedback: '' }] };
    case 'emparejamiento': return { items: [{ left: '', right: '' }] };
    case 'ordenar_secuencia': return { items: [''] };
    case 'completar_espacios': return { text: '', bank: [] };
    case 'sopa_letras': return { words: [''], clues: [''], size: 12, showWordList: false };
    case 'flashcards': return { items: [{ front: '', back: '' }] };
    default: return {};
  }
};

interface Token {
  id: string;
  text: string;
  isMissing: boolean;
}

function CompletarEspaciosEditor({ content, updateContent }: { content: any, updateContent: (newContent: any) => void }) {
  const [appState, setAppState] = useState<'INPUT' | 'SELECT'>('INPUT');
  const [text, setText] = useState(content.text || '');
  const [tokens, setTokens] = useState<Token[]>(content.tokens || []);

  const handleInputNext = () => {
    const words = text.split(/(\s+)/).filter((w: string) => w.length > 0);
    if (words.join("") !== tokens.map(t => t.text).join("")) {
      setTokens(words.map((word: string, i: number) => ({ id: `token-${Date.now()}-${i}`, text: word, isMissing: false })));
    }
    setAppState("SELECT");
  };

  const handleToggleToken = (id: string) => {
    setTokens(prev => prev.map(t => t.id === id ? { ...t, isMissing: !t.isMissing } : t));
  };

  if (appState === 'INPUT') {
    return (
      <div className="space-y-4">
        <label className="text-[10px] font-black uppercase text-slate-400">Texto del Ejercicio</label>
        <textarea 
          rows={8} 
          className="w-full p-6 rounded-3xl bg-slate-50 border-2 border-slate-200 text-lg focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none transition-all shadow-sm" 
          placeholder="Ejemplo: La célula es la unidad básica de la vida..." 
          value={text} 
          onChange={(e) => setText(e.target.value)} 
        />
        <Button onClick={() => { handleInputNext(); updateContent({ ...content, text }); }} disabled={!text.trim()} className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-sm shadow-xl transition-all">
          Elegir Palabras Ocultas <ArrowRight className="ml-2 w-5 h-5" />
        </Button>
      </div>
    );
  }

  const missingCount = tokens.filter(t => t.isMissing && t.text.trim() !== "").length;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 mb-4">
        <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Selecciona las Palabras a Ocultar</h3>
        <p className="text-xs text-slate-500 font-bold uppercase">Haz clic en las palabras que el alumno deberá arrastrar y soltar.</p>
      </div>
      <div className="bg-white p-8 rounded-3xl shadow-lg border-2 border-slate-100 flex flex-wrap gap-x-1 gap-y-3 leading-loose">
        {tokens.map((token) => {
          if (!token.text.trim()) return <span key={token.id} className="w-2">{token.text}</span>;
          return (
            <button
              key={token.id}
              onClick={() => handleToggleToken(token.id)}
              className={cn("px-2 py-1 rounded-lg transition-all font-black text-lg border-b-4", token.isMissing ? "bg-indigo-600 border-indigo-800 text-white shadow-xl transform scale-110 -translate-y-1 mx-1 z-10" : "bg-slate-50 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-700")}
            >
              {token.text}
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-between px-2 pt-2">
        <Button variant="ghost" onClick={() => setAppState('INPUT')} className="text-slate-600 font-black text-xs uppercase hover:bg-slate-100"><ArrowLeft className="mr-2 w-4 h-4" /> Volver a Editar Texto</Button>
        <div className="text-xs font-black uppercase text-slate-400">Ocultas seleccionadas: <span className="text-indigo-600 text-base">{missingCount}</span></div>
      </div>
      <Button onClick={() => updateContent({ ...content, text, tokens })} className="w-full h-16 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest shadow-xl transition-all text-sm">
        <CheckCircle2 className="w-5 h-5 mr-2" /> Guardar Configuración
      </Button>
    </div>
  );
}


const TemplateEditor = ({ type, content, updateContent }: { type: string, content: any, updateContent: (newContent: any) => void }) => {
  const supabase = createClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  if (!type) return <div className="p-8 text-center opacity-30 italic">Selecciona una plantilla para comenzar.</div>;

  if (type === 'actividad_descriptiva') {
    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) {
        toast({ variant: "destructive", title: "Archivo demasiado grande", description: "Máximo 3MB" });
        return;
      }
      setUploading(true);
      try {
        const filePath = `actividades-guia/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from('recursos-educativos').upload(filePath, file);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('recursos-educativos').getPublicUrl(filePath);
        updateContent({ ...content, fileUrl: publicUrl, fileName: file.name });
        toast({ title: "Guía cargada" });
      } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
      } finally {
        setUploading(false);
      }
    };

    return (
      <div className="space-y-6">
        <div className="p-6 bg-slate-50 border-2 border-dashed rounded-3xl text-center">
          <label className="cursor-pointer flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-600">
              {uploading ? <Loader2 className="animate-spin" /> : <FileUp size={24} />}
            </div>
            <div className="space-y-1">
              <p className="font-black uppercase text-xs tracking-widest text-slate-700">Subir Documento Guía (Opcional)</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase">PDF, Word o Excel (Máx. 3MB)</p>
            </div>
            <input type="file" className="hidden" onChange={handleFile} disabled={uploading} />
          </label>
          {content.fileName && (
            <div className="mt-4 p-3 bg-white rounded-xl border flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <File size={14} className="text-primary" /> {content.fileName}
              </div>
              <button className="h-6 w-6 text-destructive" onClick={() => updateContent({...content, fileUrl: '', fileName: ''})}>
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (type === 'opcion_multiple') {
    return (
      <div className="space-y-6">
        {content.items?.map((item: any, qIdx: number) => (
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
            <Input 
              placeholder="Enunciado de la pregunta..." 
              value={item.question} 
              className="uppercase font-bold"
              onChange={(e) => {
                const newItems = [...content.items];
                newItems[qIdx].question = e.target.value.toUpperCase();
                updateContent({ ...content, items: newItems });
              }} 
            />
            <div className="space-y-2">
              {item.options?.map((opt: any, oIdx: number) => (
                <div key={oIdx} className="flex gap-2 items-center">
                  <input type="radio" checked={item.correctId === opt.id} onChange={() => {
                    const newItems = [...content.items];
                    newItems[qIdx].correctId = opt.id;
                    updateContent({ ...content, items: newItems });
                  }} />
                  <Input 
                    placeholder={`Opción ${oIdx + 1}`} 
                    value={opt.text} 
                    onChange={(e) => {
                      const newItems = [...content.items];
                      newItems[qIdx].options[oIdx].text = e.target.value;
                      updateContent({ ...content, items: newItems });
                    }} 
                  />
                  <Button variant="ghost" size="sm" onClick={() => {
                    const newItems = [...content.items];
                    newItems[qIdx].options.splice(oIdx, 1);
                    updateContent({ ...content, items: newItems });
                  }}><X size={14} /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full text-[10px] uppercase font-bold" onClick={() => {
                const newItems = content.items ? [...content.items] : [];
                if (!newItems[qIdx].options) newItems[qIdx].options = [];
                newItems[qIdx].options.push({ id: Math.random().toString(), text: '' });
                updateContent({ ...content, items: newItems });
              }}>+ Añadir Opción</Button>
            </div>
          </div>
        ))}
        <Button className="w-full bg-primary/10 text-primary border-none font-black text-xs uppercase" onClick={() => {
          const newItems = content.items ? [...content.items] : [];
          updateContent({ ...content, items: [...newItems, { question: '', options: [{id: '1', text: ''}], correctId: '1', feedback: '' }] });
        }}>+ Añadir Pregunta</Button>
      </div>
    );
  }

  if (type === 'verdadero_falso') {
    return (
      <div className="space-y-4">
        {content.items?.map((item: any, idx: number) => (
          <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-4">
            <Input 
              placeholder="Afirmación..." 
              value={item.statement} 
              className="flex-1 uppercase font-bold text-xs" 
              onChange={(e) => {
                const newItems = [...content.items];
                newItems[idx].statement = e.target.value.toUpperCase();
                updateContent({ ...content, items: newItems });
              }} 
            />
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
          const newItems = content.items ? [...content.items] : [];
          updateContent({ ...content, items: [...newItems, { statement: '', correct: true, feedback: '' }] });
        }}>+ Nueva Afirmación</Button>
      </div>
    );
  }

  if (type === 'emparejamiento') {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2 mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-widest">Pares de Emparejamiento</h3>
          <p className="text-xs text-slate-500 font-bold uppercase">Agrega los conceptos y sus definiciones. El alumno deberá unirlos correctamente.</p>
        </div>
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          {content.items?.map((item: any, idx: number) => (
            <div key={idx} className="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 relative group transition-all hover:border-purple-200 hover:shadow-md">
              <span className="absolute -left-3 -top-3 w-8 h-8 bg-purple-100 text-purple-700 font-black rounded-full flex items-center justify-center border-4 border-white shadow-sm">{idx + 1}</span>
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Concepto</label>
                <Input placeholder="Ej. Mitocondria" value={item.left} className="font-bold border-slate-200 bg-white" onChange={(e) => {
                  const newItems = [...content.items];
                  newItems[idx].left = e.target.value;
                  updateContent({ ...content, items: newItems });
                }} />
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Definición</label>
                <Input placeholder="Ej. Organelo generador de energía" value={item.right} className="font-bold border-slate-200 bg-white" onChange={(e) => {
                  const newItems = [...content.items];
                  newItems[idx].right = e.target.value;
                  updateContent({ ...content, items: newItems });
                }} />
              </div>
              <Button variant="ghost" size="icon" className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600 self-end mb-1" onClick={() => {
                const newItems = [...content.items];
                newItems.splice(idx, 1);
                updateContent({ ...content, items: newItems });
              }}><Trash2 size={18} /></Button>
            </div>
          ))}
        </div>
        <Button className="w-full h-14 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-black uppercase tracking-widest text-xs border-2 border-dashed border-purple-200 transition-all" onClick={() => {
          const newItems = content.items ? [...content.items] : [];
          updateContent({ ...content, items: [...newItems, { left: '', right: '' }] });
        }}><Plus className="w-4 h-4 mr-2" /> Añadir Nuevo Par</Button>
      </div>
    );
  }

  if (type === 'ordenar_secuencia') {
    const move = (idx: number, dir: number) => {
      const newItems = [...content.items];
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= newItems.length) return;
      [newItems[idx], newItems[targetIdx]] = [newItems[targetIdx], newItems[idx]];
      updateContent({ ...content, items: newItems });
    };

    return (
      <div className="space-y-6">
        <div className="text-center space-y-2 mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-widest">Secuencia Correcta</h3>
          <p className="text-xs text-slate-500 font-bold uppercase">Ingresa los pasos en el orden correcto. En el ejercicio aparecerán desordenados.</p>
        </div>
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          {content.items?.map((item: string, idx: number) => (
            <div key={idx} className="flex gap-3 items-center bg-white p-3 rounded-2xl border-2 border-slate-100 shadow-sm group hover:border-orange-200 transition-all">
              <div className="flex flex-col gap-1">
                <button className="text-slate-300 hover:text-orange-500 disabled:opacity-30 disabled:hover:text-slate-300" disabled={idx === 0} onClick={() => move(idx, -1)}><ArrowUp size={16} /></button>
                <button className="text-slate-300 hover:text-orange-500 disabled:opacity-30 disabled:hover:text-slate-300" disabled={idx === content.items.length - 1} onClick={() => move(idx, 1)}><ArrowDown size={16} /></button>
              </div>
              <span className="h-10 w-10 flex-shrink-0 rounded-xl bg-orange-100 flex items-center justify-center font-black text-orange-600 text-sm">{idx + 1}</span>
              <Input placeholder={`Paso ${idx + 1}...`} value={item} className="font-bold border-none shadow-none focus-visible:ring-0 px-2 bg-transparent h-auto text-base" onChange={(e) => {
                const newItems = [...content.items];
                newItems[idx] = e.target.value;
                updateContent({ ...content, items: newItems });
              }} />
              <Button variant="ghost" size="icon" className="text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-opacity" onClick={() => {
                const newItems = [...content.items];
                newItems.splice(idx, 1);
                updateContent({ ...content, items: newItems });
              }}><X size={16} /></Button>
            </div>
          ))}
        </div>
        <Button className="w-full h-14 rounded-2xl bg-orange-50 hover:bg-orange-100 text-orange-700 font-black uppercase tracking-widest text-xs border-2 border-dashed border-orange-200 transition-all" onClick={() => {
          const newItems = content.items ? [...content.items] : [];
          updateContent({ ...content, items: [...newItems, ''] });
        }}><Plus className="w-4 h-4 mr-2" /> Añadir Paso</Button>
      </div>
    );
  }

  if (type === 'completar_espacios') {
    return <CompletarEspaciosEditor content={content} updateContent={updateContent} />;
  }

  if (type === 'flashcards') {
    return (
      <div className="space-y-8">
        <div className="text-center space-y-2 mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-widest">Tarjetas de Repaso (Flashcards)</h3>
          <p className="text-xs text-slate-500 font-bold uppercase">Agrega un término en el frente y su definición en el reverso.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
          {content.items?.map((item: any, idx: number) => (
            <div key={idx} className="relative bg-white p-6 rounded-3xl border-2 border-amber-100 shadow-sm group hover:border-amber-300 transition-all">
              <span className="absolute -left-3 -top-3 w-8 h-8 bg-amber-400 text-white font-black rounded-full flex items-center justify-center border-4 border-white shadow-sm z-10">{idx + 1}</span>
              <button className="absolute -right-3 -top-3 w-8 h-8 bg-white text-red-500 hover:bg-red-50 hover:scale-110 font-black rounded-full flex items-center justify-center border-2 border-slate-100 shadow-sm opacity-0 group-hover:opacity-100 transition-all z-10" onClick={() => {
                const newItems = [...content.items];
                newItems.splice(idx, 1);
                updateContent({ ...content, items: newItems });
              }}><X size={14} /></button>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3 bg-amber-50/50 p-4 rounded-2xl border border-amber-100/50">
                  <label className="text-[10px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-400"/> Frente (Término)</label>
                  <textarea rows={3} className="w-full bg-transparent border-none text-slate-700 font-bold text-lg resize-none focus:ring-0 outline-none placeholder:text-slate-300" placeholder="Escribe el concepto..." value={item.front} onChange={(e) => {
                    const newItems = [...content.items];
                    newItems[idx].front = e.target.value;
                    updateContent({ ...content, items: newItems });
                  }} />
                </div>
                <div className="space-y-3 bg-yellow-50/50 p-4 rounded-2xl border border-yellow-100/50">
                  <label className="text-[10px] font-black uppercase tracking-widest text-yellow-600 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-yellow-400"/> Reverso (Definición)</label>
                  <textarea rows={3} className="w-full bg-transparent border-none text-slate-700 font-medium text-base resize-none focus:ring-0 outline-none placeholder:text-slate-300" placeholder="Escribe la explicación o respuesta..." value={item.back} onChange={(e) => {
                    const newItems = [...content.items];
                    newItems[idx].back = e.target.value;
                    updateContent({ ...content, items: newItems });
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button className="w-full h-14 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-700 font-black uppercase tracking-widest text-xs border-2 border-dashed border-amber-300 transition-all" onClick={() => {
          const newItems = content.items ? [...content.items] : [];
          updateContent({ ...content, items: [...newItems, { front: '', back: '' }] });
        }}><Plus className="w-4 h-4 mr-2" /> Añadir Nueva Tarjeta</Button>
      </div>
    );
  }

  if (type === 'sopa_letras' || type === 'crucigrama') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
          <div className="space-y-1">
            <p className="text-xs font-black text-indigo-900 uppercase">Lista de Apoyo visible</p>
            <p className="text-[10px] text-indigo-600 font-bold">Si se apaga, el alumno solo verá las pistas.</p>
          </div>
          <Switch 
            checked={content.showWordList} 
            onCheckedChange={(val) => updateContent({ ...content, showWordList: val })} 
          />
        </div>

        <div className="grid grid-cols-2 gap-4 px-4 text-[10px] font-black uppercase text-slate-400">
          <span>Palabra</span>
          <span>Pista</span>
        </div>
        {content.words?.map((word: string, idx: number) => (
          <div key={idx} className="flex gap-2 items-center">
            <Input 
              placeholder="PALABRA" 
              className="uppercase"
              value={word} 
              onChange={(e) => {
                const newWords = [...(content.words || [])];
                newWords[idx] = e.target.value.toUpperCase();
                const newClues = content.clues ? [...content.clues] : [];
                updateContent({ ...content, words: newWords, clues: newClues });
              }} 
            />
            <Input 
              placeholder="PISTA" 
              value={content.clues?.[idx] || ''} 
              onChange={(e) => {
                const newClues = content.clues ? [...content.clues] : [];
                newClues[idx] = e.target.value;
                const newWords = content.words ? [...content.words] : [];
                updateContent({ ...content, words: newWords, clues: newClues });
              }} 
            />
            <Button variant="ghost" size="sm" onClick={() => {
              const newWords = [...(content.words || [])];
              newWords.splice(idx, 1);
              const newClues = [...(content.clues || [])];
              newClues.splice(idx, 1);
              updateContent({ ...content, words: newWords, clues: newClues });
            }}><X size={14} /></Button>
          </div>
        ))}
        <Button variant="outline" className="w-full text-xs font-black uppercase" onClick={() => {
          const newWords = [...(content.words || []), ''];
          const newClues = [...(content.clues || []), ''];
          updateContent({ ...content, words: newWords, clues: newClues });
        }}>+ Añadir Palabra</Button>
      </div>
    );
  }

  return null;
};

// COMPONENTE DE PREVISUALIZACIÓN DE ALUMNO
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<any>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [slideToDelete, setSlideToDelete] = useState<string | null>(null);
  
  const [previewActivity, setPreviewActivity] = useState<any | null>(null);

  const fetchInitialData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await getMyAsignaciones(user.id);
      if (data) setAsignaciones(data);
    }
    setLoading(false);
  };

  useEffect(() => { 
    fetchInitialData(); 
    // Inicializar polyfill para drag and drop en móviles
    polyfill({
      dragImageTranslateOverride: (event, hoverCoordinates, hoveredElement, translateDragImageFn) => {
        translateDragImageFn(hoverCoordinates.x, hoverCoordinates.y);
      }
    });
  }, []);

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
    
    if (!d.titulo || d.titulo.trim() === '') {
      toast({ variant: "destructive", title: "Campo requerido", description: "El título principal es obligatorio para guardar." });
      return;
    }

    // Validación obligatoria: fecha de entrega en ejercicios
    if (dialog.type === 'ejercicio' && (!d.fecha_entrega || d.fecha_entrega.trim() === '')) {
      toast({ variant: "destructive", title: "Fecha de entrega requerida", description: "Debes establecer una fecha límite de entrega para la actividad. Este campo es obligatorio." });
      return;
    }

    try {
      if (dialog.type === 'unidad') {
        if (!selectedMateria?.id) { toast({ variant: "destructive", title: "Error", description: "No hay materia seleccionada." }); return; }
        result = await upsertUnidad({...d, materia_id: selectedMateria.id, created_by: user?.id});
      }
      
      if (dialog.type === 'tema') {
        if (!selectedUnidad?.id) { toast({ variant: "destructive", title: "Error", description: "No hay unidad seleccionada." }); return; }
        result = await upsertTema({...d, unidad_id: selectedUnidad.id, created_by: user?.id});
      }
      
      if (dialog.type === 'ejercicio') {
        if (!selectedTema?.id) { toast({ variant: "destructive", title: "Error", description: "No hay tema seleccionado." }); return; }
        const finalContent = typeof d.contenido === 'string' ? d.contenido : JSON.stringify(d.contenido || {});
        result = await upsertEjercicio({...d, contenido: finalContent, tema_id: selectedTema.id, created_by: user?.id});
      }

      if (result && !result.error) {
        toast({ title: "Guardado con éxito" });
        setDialog({ ...dialog, open: false });
        if (dialog.type === 'unidad') fetchUnidades(selectedMateria.id);
        if (dialog.type === 'tema') fetchTemas(selectedUnidad.id);
        if (dialog.type === 'ejercicio') fetchEjercicios(selectedTema.id);
      } else if (result?.error) {
        toast({ variant: "destructive", title: "Error al guardar", description: result.error.message || "Ocurrió un error inesperado." });
      }
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (type: string, id: string, title?: string) => {
    if (type === 'unidad' || type === 'tema') {
      setDeleteConfirmTarget({ type, id, title });
      setDeleteConfirmInput("");
      setDeleteConfirmOpen(true);
      return;
    }
    
    let error;
    if (type === 'ejercicio') ({ error } = await deleteEjercicio(id));

    if (!error) {
      toast({ title: "Eliminado correctamente" });
      if (type === 'ejercicio') fetchEjercicios(selectedTema.id);
    }
  };

  const onConfirmDelete = async () => {
    if (deleteConfirmInput !== 'BORRAR') return;
    if (!deleteConfirmTarget) return;

    let error;
    const { type, id } = deleteConfirmTarget;

    if (type === 'unidad') ({ error } = await deleteUnidad(id));
    if (type === 'tema') ({ error } = await deleteTema(id));

    if (!error) {
      toast({ title: "Eliminado con éxito", description: `Se ha borrado el/la ${type} y todo su contenido.` });
      setDeleteConfirmOpen(false);
      setDeleteConfirmTarget(null);
      if (type === 'unidad') { fetchUnidades(selectedMateria.id); setSelectedUnidad(null); }
      if (type === 'tema') { fetchTemas(selectedUnidad.id); setSelectedTema(null); }
    } else {
      toast({ variant: "destructive", title: "Error al eliminar", description: "No se pudo realizar la operación." });
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
    if (error) { toast({ variant: "destructive", title: "Error", description: "Problema al crear diapositiva." }); return; }
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

  const handleDeleteSlide = (id: string) => {
    setSlideToDelete(id);
  };

  const confirmDeleteSlide = async () => {
    if (!slideToDelete) return;
    const { error } = await deleteSlide(slideToDelete);
    if (!error) {
      const newSlides = slides.filter(s => s.id !== slideToDelete);
      setSlides(newSlides);
      if (activeSlideIndex >= newSlides.length) setActiveSlideIndex(Math.max(0, newSlides.length - 1));
      toast({ title: "Diapositiva eliminada" });
    }
    setSlideToDelete(null);
  };

  const handleOpenResourceDialog = (tema: any) => {
    setSelectedTema(tema);
    fetchResources(tema.id);
    setIsResourceDialogOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast({ variant: "destructive", title: "Archivo grande", description: "Límite 3MB" }); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedTema.id}/${Date.now()}.${fileExt}`;
      const filePath = `recursos/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('recursos-educativos').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('recursos-educativos').getPublicUrl(filePath);
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
      toast({ title: "Archivo cargado" });
      fetchResources(selectedTema.id);
    } catch (err: any) { toast({ variant: "destructive", title: "Error", description: err.message }); } finally { setUploading(false); }
  };

  const handleDeleteResource = async (resource: any) => {
    try {
      await supabase.storage.from('recursos-educativos').remove([resource.file_path]);
      const { error: dbError } = await deleteResourceRecord(resource.id);
      if (dbError) throw dbError;
      toast({ title: "Recurso eliminado" });
      setResources(resources.filter(r => r.id !== resource.id));
    } catch (err: any) { toast({ variant: "destructive", title: "Error", description: err.message }); }
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (presentationMode) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        setActiveSlideIndex((prev) => Math.min(prev + 1, slides.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setActiveSlideIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Escape') { setPresentationMode(false); }
    }
  }, [presentationMode, slides.length]);

  useEffect(() => {
    const handleFullscreenChange = () => { if (!document.fullscreenElement) setPresentationMode(false); };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  useEffect(() => {
    if (presentationMode) { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); }
    else { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  }, [presentationMode]);

  const splitImageUrls = (urls: string) => {
    if (!urls) return [];
    return urls.split(/,(?=http|data:)/).map(u => u.trim()).filter(Boolean);
  };

  if (presentationMode && slides.length > 0) {
    const slide = slides[activeSlideIndex];
    if (!slide) { setPresentationMode(false); return null; }
    const styleMap: any = {
      'azul': 'bg-slate-900 from-slate-900 to-blue-900 text-white',
      'vino': 'bg-[#4c0519] from-[#4c0519] to-[#8B2332] text-white',
      'verde': 'bg-[#064e3b] from-[#064e3b] to-[#1A4A3F] text-white',
      'oscuro': 'bg-black from-black to-slate-900 text-white'
    };

    return (
      <div className={cn("fixed inset-0 z-[100] grid grid-rows-[1fr_auto] overflow-hidden bg-gradient-to-br", styleMap[slide.estilo || 'azul'])}>
        <div className="absolute top-0 left-0 h-1.5 bg-blue-400/50 w-full z-50">
          <div className="h-full bg-blue-400 transition-all duration-500 shadow-[0_0_15px_rgba(96,165,250,0.8)]" style={{ width: `${((activeSlideIndex + 1) / slides.length) * 100}%` }} />
        </div>
        <div className="relative flex flex-col md:flex-row items-center justify-center gap-8 p-10 md:p-20 overflow-hidden">
          <div className="flex-1 flex flex-col justify-center max-w-full overflow-hidden">
            <h1 className="font-black uppercase tracking-tight mb-6 leading-tight" style={{ fontSize: 'clamp(2rem, 8vw, 5rem)' }}>{slide.titulo}</h1>
            <div className="overflow-y-auto max-h-[50vh] pr-4 custom-scrollbar">
              <p className="font-medium leading-relaxed opacity-90" style={{ fontSize: 'clamp(1rem, 2.5vw, 2.2rem)' }}>{slide.contenido}</p>
            </div>
          </div>
          <div className="flex-1 w-full h-full max-h-[60vh] md:max-h-full flex items-center justify-center">
            {slide.imagen_url ? (
              <div className={cn("grid gap-4 w-full h-full p-4", splitImageUrls(slide.imagen_url).length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                {splitImageUrls(slide.imagen_url).map((url, i) => (
                  <div key={i} className="relative w-full h-full overflow-hidden rounded-2xl shadow-2xl border border-white/10">
                    <img src={url} alt="Slide" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            ) : <div className="w-full aspect-video flex flex-col items-center justify-center bg-white/5 rounded-3xl border-2 border-dashed border-white/10 opacity-30"><ImageIcon size={100} /></div>}
          </div>
        </div>
        <div className="py-3 px-10 flex items-center justify-between bg-black/30 backdrop-blur-2xl border-t border-white/5 z-[110]">
          <div className="flex gap-4">
            <Button variant="ghost" className="h-12 w-12 rounded-full text-white hover:bg-white/10" onClick={() => setActiveSlideIndex(Math.max(0, activeSlideIndex - 1))} disabled={activeSlideIndex === 0}><ChevronLeft size={32} /></Button>
            <div className="flex items-center px-4 text-xl font-black tabular-nums tracking-widest text-white/40"><span className="text-white">{activeSlideIndex + 1}</span> / {slides.length}</div>
            <Button variant="ghost" className="h-12 w-12 rounded-full text-white hover:bg-white/10" onClick={() => setActiveSlideIndex(Math.min(activeSlideIndex + 1, slides.length - 1))} disabled={activeSlideIndex === slides.length - 1}><ChevronRight size={32} /></Button>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
              <img src={LOGO_URL} alt="Logo" className="h-20 w-auto object-contain" />
              <span className="hidden lg:block text-[10px] font-black uppercase tracking-[0.3em] text-white/40">IEEZ Plataforma de Enseñanza</span>
            </div>
            <Button variant="outline" className="h-10 px-6 rounded-xl font-black uppercase tracking-widest bg-red-600/20 border-red-600/30 text-red-100 hover:bg-red-600 shadow-lg" onClick={() => setPresentationMode(false)}><X size={18} className="mr-2" /> Salir (Esc)</Button>
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
        </Card>
      ) : (
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 h-14 bg-muted/50 rounded-2xl p-1 shadow-sm border mb-8">
            <TabsTrigger value="materias" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Mis Materias</TabsTrigger>
            <TabsTrigger value="unidades" disabled={!selectedMateria} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Unidades</TabsTrigger>
            <TabsTrigger value="temas" disabled={!selectedUnidad} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Temas</TabsTrigger>
            <TabsTrigger value="ejercicios" disabled={!selectedTema} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Actividades</TabsTrigger>
            <TabsTrigger value="entregas" disabled={!selectedTema || ejercicios.filter(e => e.tipo === 'actividad_descriptiva').length === 0} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Entregas</TabsTrigger>
          </TabsList>

          <TabsContent value="materias">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {asignaciones.map((asig) => (
                <Card key={asig.id} onClick={() => { setSelectedMateria({...asig.materias, id: asig.materia_id}); fetchUnidades(asig.materia_id); setCurrentTab('unidades'); }} className="cursor-pointer hover:shadow-2xl transition-all duration-300 border-2 border-slate-100 hover:border-primary/40 rounded-3xl bg-white">
                  <div className="h-2 bg-primary/20" />
                  <CardHeader className="p-6">
                    <Badge variant="outline" className="text-[9px] font-black bg-primary/5 text-primary border-primary/20 uppercase mb-4">{asig.niveles?.nombre}</Badge>
                    <CardTitle className="text-xl font-black text-slate-800 uppercase leading-tight">{asig.materias?.nombre}</CardTitle>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mt-2">{asig.carreras?.nombre}</p>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="unidades">
            <Card className="rounded-[32px] border-muted/60 shadow-xl overflow-hidden h-[70vh] flex flex-col">
              <CardHeader className="bg-slate-50/50 pb-6 border-b shrink-0 flex flex-row items-center justify-between">
                <div>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentTab('materias')} className="text-primary font-black uppercase text-[10px]"><ArrowLeft size={14} /> Volver</Button>
                  <CardTitle className="text-2xl font-black uppercase text-slate-800 flex items-center gap-3"><ListTree className="text-primary" /> {selectedMateria?.nombre}</CardTitle>
                </div>
                <Button size="lg" className="rounded-2xl bg-primary text-white font-black uppercase tracking-widest gap-2" onClick={() => setDialog({ open: true, type: 'unidad', data: { titulo: '', orden: unidades.length + 1 } })}><Plus size={18} /> Nueva Unidad</Button>
              </CardHeader>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="space-y-4">
                  {unidades.map((u) => (
                    <div key={u.id} onClick={() => { setSelectedUnidad(u); fetchTemas(u.id); setCurrentTab('temas'); }} className="p-6 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition-all hover:shadow-lg border-slate-50">
                      <div className="flex items-center gap-6">
                        <span className="h-12 w-12 rounded-2xl bg-primary text-white flex items-center justify-center font-black text-lg">{u.orden}</span>
                        <span className="font-black text-slate-800 text-lg uppercase">{u.titulo}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDialog({ open: true, type: 'unidad', data: u }); }}><Edit size={18}/></Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); handleDelete('unidad', u.id, u.titulo); }}><Trash2 size={18}/></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="temas">
             <Card className="rounded-[32px] border-muted/60 shadow-xl overflow-hidden h-[70vh] flex flex-col">
               <CardHeader className="bg-slate-50/50 pb-6 border-b shrink-0 flex flex-row items-center justify-between">
                 <div>
                   <Button variant="ghost" size="sm" onClick={() => setCurrentTab('unidades')} className="text-primary font-black uppercase text-[10px]"><ArrowLeft size={14} /> Volver</Button>
                   <CardTitle className="text-2xl font-black uppercase text-slate-800 flex items-center gap-3"><FileText className="text-primary" /> {selectedUnidad?.titulo}</CardTitle>
                 </div>
                 <Button size="lg" className="rounded-2xl bg-primary text-white font-black uppercase tracking-widest gap-2" onClick={() => setDialog({ open: true, type: 'tema', data: { titulo: '', contenido: '', orden: temas.length + 1 } })}><Plus size={18} /> Nuevo Tema</Button>
               </CardHeader>
               <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {temas.map((t) => (
                     <div key={t.id} onClick={() => { setSelectedTema(t); fetchEjercicios(t.id); setCurrentTab('ejercicios'); }} className="p-6 border-2 border-slate-50 rounded-[24px] flex flex-col gap-4 cursor-pointer hover:shadow-xl transition-all">
                       <div className="flex items-center justify-between">
                         <span className="font-black text-slate-700 uppercase tracking-tight">{t.titulo}</span>
                         <div className="flex items-center gap-1">
                           <Button variant="ghost" size="icon" className="text-blue-500" onClick={(e) => { e.stopPropagation(); handleOpenSlideEditor(t); }}><Presentation size={18}/></Button>
                           <Button variant="ghost" size="icon" className="text-emerald-500" onClick={(e) => { e.stopPropagation(); handleOpenResourceDialog(t); }}><Paperclip size={18}/></Button>
                           <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDialog({ open: true, type: 'tema', data: t }); }}><Edit size={16}/></Button>
                           <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); handleDelete('tema', t.id, t.titulo); }}><Trash2 size={16}/></Button>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
             </Card>
          </TabsContent>

          <TabsContent value="ejercicios">
             <Card className="rounded-[32px] border-muted/60 shadow-xl overflow-hidden h-[70vh] flex flex-col">
               <CardHeader className="bg-slate-50/50 pb-6 border-b shrink-0 flex flex-row items-center justify-between">
                 <div>
                   <Button variant="ghost" size="sm" onClick={() => setCurrentTab('temas')} className="text-primary font-black uppercase text-[10px]"><ArrowLeft size={14} /> Volver</Button>
                   <CardTitle className="text-2xl font-black uppercase text-slate-800 flex items-center gap-3"><Sparkles className="text-amber-500" /> Actividades de {selectedTema?.titulo}</CardTitle>
                 </div>
                 <Button size="lg" className="rounded-2xl bg-amber-500 text-white font-black uppercase tracking-widest gap-2" onClick={() => setDialog({ open: true, type: 'ejercicio', data: { titulo: '', tipo: 'crucigrama', contenido: initActivityContent('crucigrama'), orden: ejercicios.length + 1, fecha_entrega: '' } })}><Plus size={18} /> Nueva Actividad</Button>
               </CardHeader>
               <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                 <Table>
                   <TableHeader className="bg-slate-50/50"><TableRow><TableHead className="font-black uppercase text-[10px]">Orden</TableHead><TableHead className="font-black uppercase text-[10px]">Actividad</TableHead><TableHead className="font-black uppercase text-[10px]">Tipo</TableHead><TableHead className="font-black uppercase text-[10px]"><span className="flex items-center gap-1"><CalendarClock size={12} />Fecha Límite</span></TableHead><TableHead className="text-right font-black uppercase text-[10px]">Acciones</TableHead></TableRow></TableHeader>
                   <TableBody>
                     {ejercicios.map((e) => {
                       const template = ACTIVITY_TEMPLATES.find(t => t.id === e.tipo);
                       const fechaEntrega = e.fecha_entrega ? new Date(e.fecha_entrega) : null;
                       const fechaStr = fechaEntrega ? fechaEntrega.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
                       const isVencida = fechaEntrega ? fechaEntrega < new Date() : false;
                       const isProxima = fechaEntrega ? (fechaEntrega.getTime() - new Date().getTime()) < 3 * 24 * 60 * 60 * 1000 && !isVencida : false;
                       return (
                        <TableRow key={e.id}>
                          <TableCell className="font-black text-slate-400">{e.orden}</TableCell>
                          <TableCell className="font-bold text-slate-700 uppercase tracking-tight">{e.titulo}</TableCell>
                          <TableCell>
                            <Badge className={cn("text-[9px] font-black uppercase text-white", template?.color)}>{template?.label}</Badge>
                          </TableCell>
                          <TableCell>
                            {fechaStr ? (
                              <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase",
                                isVencida ? "bg-red-100 text-red-700" : isProxima ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                              )}>
                                <CalendarClock size={11} />
                                {fechaStr}
                                {isVencida && <span className="ml-1 text-[8px]">VENCIDA</span>}
                                {isProxima && <span className="ml-1 text-[8px]">PRÓXIMA</span>}
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-red-500 flex items-center gap-1"><CalendarClock size={11} />Sin fecha</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" className="text-amber-600 hover:bg-amber-50" onClick={() => setPreviewActivity(e)}><Eye size={16}/></Button>
                              <Button variant="ghost" size="icon" className="text-blue-600 hover:bg-blue-50" onClick={() => setDialog({ open: true, type: 'ejercicio', data: {...e, contenido: typeof e.contenido === 'string' ? JSON.parse(e.contenido || '{}') : e.contenido} })}><Edit size={16}/></Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete('ejercicio', e.id)}><Trash2 size={16}/></Button>
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

          <TabsContent value="entregas">
             <Card className="rounded-[32px] border-muted/60 shadow-xl overflow-hidden min-h-[70vh] flex flex-col p-6">
               <div className="flex items-center gap-4 mb-6">
                 <Button variant="ghost" size="sm" onClick={() => setCurrentTab('temas')} className="text-primary font-black uppercase text-[10px]"><ArrowLeft size={14} /> Volver a Temas</Button>
               </div>
               <PanelEntregasProfesor 
                 ejercicios={ejercicios.filter((e: any) => e.tipo === 'actividad_descriptiva')} 
                 materiaId={selectedMateria?.id} 
                 materiaNombre={selectedMateria?.nombre} 
               />
             </Card>
           </TabsContent>
        </Tabs>
      )}

      {/* DIALOGO DE EDICIÓN DE ACTIVIDAD */}
      <Dialog open={dialog.open} onOpenChange={o => setDialog({...dialog, open: o})}>
        <DialogContent className={cn("w-[95vw] max-h-[90vh] flex flex-col p-0 rounded-[32px] overflow-hidden", dialog.type === 'ejercicio' ? 'max-w-4xl' : 'max-w-xl')}>
          <DialogHeader className="p-8 bg-slate-50 border-b shrink-0 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-4">
              <div className={cn("p-3 rounded-2xl text-white", dialog.type === 'ejercicio' ? 'bg-amber-500' : 'bg-primary')}><FileText size={24} /></div>
              <div>
                <DialogTitle className="font-black text-2xl uppercase tracking-tight text-slate-800">Editar {dialog.type}</DialogTitle>
                <DialogDescription className="text-xs uppercase font-bold text-slate-400">Configura los parámetros de la actividad.</DialogDescription>
              </div>
            </div>
            {dialog.type === 'ejercicio' && (
              <Button variant="outline" className="rounded-xl font-black uppercase text-[10px] tracking-widest gap-2" onClick={() => setPreviewActivity(dialog.data)}>
                <Eye size={14} /> Ver como Alumno
              </Button>
            )}
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Título Principal *</label>
                <Input className="h-12 rounded-xl uppercase font-bold" value={dialog.data.titulo || ''} onChange={e => setDialog({...dialog, data: {...dialog.data, titulo: e.target.value.toUpperCase()}})} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Orden</label>
                <Input type="number" className="h-12 rounded-xl" value={dialog.data.orden || 1} onChange={e => setDialog({...dialog, data: {...dialog.data, orden: parseInt(e.target.value)}})} />
              </div>
            </div>

            {dialog.type === 'ejercicio' && (
              <div className="p-5 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 space-y-3">
                <label className="text-[10px] font-black uppercase text-amber-700 tracking-widest flex items-center gap-2">
                  <CalendarClock size={14} className="text-amber-600" />
                  Fecha Límite de Entrega *
                  <span className="ml-auto text-[9px] font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">OBLIGATORIO</span>
                </label>
                <p className="text-[10px] text-amber-600 font-medium">
                  El alumno podrá realizar la actividad hasta esta fecha. Para reciclar la actividad en un nuevo ciclo, edítala y cambia únicamente esta fecha.
                </p>
                <Input
                  id="fecha-entrega-input"
                  type="date"
                  className={cn("h-12 rounded-xl font-bold text-slate-700 border-2", (!dialog.data.fecha_entrega || dialog.data.fecha_entrega === '') ? 'border-amber-400 bg-white focus-visible:ring-amber-400' : 'border-emerald-400 bg-white')}
                  value={dialog.data.fecha_entrega ? dialog.data.fecha_entrega.split('T')[0] : ''}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setDialog({...dialog, data: {...dialog.data, fecha_entrega: e.target.value ? new Date(e.target.value + 'T23:59:59').toISOString() : ''}})}
                />
                {(!dialog.data.fecha_entrega || dialog.data.fecha_entrega === '') && (
                  <p className="text-[10px] font-black text-amber-700 flex items-center gap-1.5">
                    <AlertCircle size={11} /> Este campo es obligatorio para poder guardar la actividad.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Descripción / Instrucciones (Opcional)</label>
              <textarea rows={4} className="w-full p-4 rounded-xl bg-slate-50 border-slate-200 text-sm outline-none" value={dialog.data.descripcion || ''} onChange={e => setDialog({...dialog, data: {...dialog.data, descripcion: e.target.value}})} />
            </div>

            {dialog.type === 'ejercicio' && (
              <div className="space-y-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-primary tracking-[0.2em] flex items-center gap-2"><Layout size={14} /> Seleccionar Plantilla</label>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                    {ACTIVITY_TEMPLATES.map((tmpl) => (
                      <button key={tmpl.id} type="button" onClick={() => setDialog({...dialog, data: {...dialog.data, tipo: tmpl.id, contenido: initActivityContent(tmpl.id)}})} className={cn("flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all", dialog.data.tipo === tmpl.id ? "bg-primary/5 border-primary shadow-md" : "bg-white border-slate-100 hover:border-slate-200")}>
                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-white", tmpl.color)}>{tmpl.icon}</div>
                        <span className="text-[10px] font-black uppercase tracking-tighter text-center">{tmpl.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <Separator />
                <TemplateEditor type={dialog.data.tipo} content={dialog.data.contenido || {}} updateContent={(newContent) => setDialog({ ...dialog, data: { ...dialog.data, contenido: newContent } })} />
              </div>
            )}
          </div>

          <DialogFooter className="p-8 shrink-0 border-t bg-slate-50 gap-2">
            <Button variant="outline" className="rounded-2xl px-8 font-black uppercase text-[10px]" onClick={() => setDialog({...dialog, open: false})}>Cancelar</Button>
            <Button className="bg-primary px-10 rounded-2xl font-black uppercase tracking-widest shadow-lg" onClick={handleSave}>Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PREVISUALIZACIÓN DE ACTIVIDAD */}
      {previewActivity && <ActivityPreview exercise={previewActivity} onClose={() => setPreviewActivity(null)} isPreview={true} />}

      {/* DIALOGO DE DIAPOSITIVAS */}
      <Dialog open={slideDialogOpen} onOpenChange={setSlideDialogOpne}>
        <DialogContent className="max-w-[95vw] w-[1300px] h-[90vh] flex flex-col p-0 rounded-3xl overflow-hidden shadow-2xl border-none">
          <DialogHeader className="p-6 bg-slate-900 border-b border-white/5 flex flex-row justify-between items-center space-y-0 shrink-0">
            <div>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-3">
                <Presentation className="text-blue-400" /> Diseño de Clase: {selectedTema?.titulo}
              </DialogTitle>
            </div>
            <div className="flex gap-3">
              <Button variant="default" className="bg-blue-600 hover:bg-blue-700 rounded-xl font-black uppercase tracking-widest gap-2 shadow-lg h-12 px-6" onClick={() => setPresentationMode(true)} disabled={slides.length === 0}>
                <Play size={18} fill="currentColor" /> Presentar
              </Button>
              <Button variant="ghost" className="rounded-xl font-bold text-white hover:bg-white/5 h-12 px-6 border border-white/10" onClick={() => setSlideDialogOpne(false)}>Cerrar</Button>
            </div>
          </DialogHeader>
          <div className="flex-1 flex overflow-hidden bg-slate-950">
            <aside className="w-72 bg-slate-900 border-r border-white/5 flex flex-col shrink-0">
              <div className="p-4 border-b border-white/5">
                <Button className="w-full gap-2 rounded-xl bg-blue-600 font-black uppercase text-[10px] tracking-widest h-12" onClick={handleAddSlide}>+ Nueva Diapositiva</Button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {slides.map((s, idx) => (
                  <div key={s.id} onClick={() => setActiveSlideIndex(idx)} className={cn("p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-3 relative group", activeSlideIndex === idx ? "bg-blue-600/10 border-blue-600" : "border-transparent hover:bg-white/5")}>
                    <span className="text-xs font-black text-slate-500">{idx + 1}</span>
                    <p className={cn("text-[11px] font-bold uppercase truncate", activeSlideIndex === idx ? "text-blue-400" : "text-slate-300")}>{s.titulo || 'Sin Título'}</p>
                    <button className="opacity-0 group-hover:opacity-100 h-7 w-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center transition-all shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteSlide(s.id); }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </aside>
            <main className="flex-1 bg-slate-950 p-10 overflow-y-auto custom-scrollbar">
              {slides.length > 0 && slides[activeSlideIndex] ? (
                <div className="max-w-4xl mx-auto space-y-10">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] flex items-center gap-2"><Palette size={14} /> Estilo Visual</label>
                    <div className="grid grid-cols-4 gap-4">
                      {['azul', 'vino', 'verde', 'oscuro'].map((est) => (
                        <button 
                          key={est} 
                          onClick={() => handleUpdateSlide(slides[activeSlideIndex].id, { estilo: est })} 
                          className={cn(
                            "h-12 rounded-xl font-black text-[10px] uppercase border-2 transition-all", 
                            slides[activeSlideIndex].estilo === est ? "border-blue-500 scale-105 shadow-lg" : "border-white/5 opacity-50 hover:opacity-100",
                            est === 'azul' ? "bg-blue-900 text-white" : est === 'vino' ? "bg-rose-900 text-white" : est === 'verde' ? "bg-emerald-900 text-white" : "bg-slate-800 text-white"
                          )}
                        >
                          {est}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input className="text-2xl h-16 font-black uppercase border-none bg-white/5 text-white focus:bg-white/10 rounded-2xl px-6" value={slides[activeSlideIndex]?.titulo || ''} onChange={(e) => handleUpdateSlide(slides[activeSlideIndex].id, { titulo: e.target.value.toUpperCase() })} />
                  <textarea className="w-full p-6 text-lg min-h-[200px] font-medium bg-white/5 border-none text-slate-200 focus:bg-white/10 rounded-3xl outline-none resize-none" value={slides[activeSlideIndex]?.contenido || ''} onChange={(e) => handleUpdateSlide(slides[activeSlideIndex].id, { contenido: e.target.value })} />
                  <div className="bg-blue-600/5 p-8 rounded-3xl border border-white/5 space-y-4">
                    <label className="text-[10px] font-black uppercase text-blue-400 tracking-[0.2em] flex items-center gap-2"><ImageIcon size={14} /> Imágenes</label>
                    {slides[activeSlideIndex]?.imagen_url && (
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {splitImageUrls(slides[activeSlideIndex].imagen_url).map((url, i) => (
                          <div key={i} className="relative aspect-video rounded-xl overflow-hidden border border-white/10">
                            <img src={url} alt="Preview" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                    <textarea className="w-full p-4 bg-slate-900 border-white/10 rounded-2xl text-white text-sm outline-none min-h-[80px]" value={slides[activeSlideIndex]?.imagen_url || ''} onChange={(e) => handleUpdateSlide(slides[activeSlideIndex].id, { imagen_url: e.target.value })} />
                  </div>
                </div>
              ) : <div className="h-full flex flex-col items-center justify-center opacity-20"><Presentation size={100} className="mb-6 text-white" /></div>}
            </main>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isResourceDialogOpen} onOpenChange={setIsResourceDialogOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-0 rounded-[32px] overflow-hidden shadow-2xl">
          <DialogHeader className="p-8 bg-slate-50 border-b shrink-0 flex items-center gap-4 space-y-0">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl"><Paperclip size={24} /></div>
            <div>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight text-slate-800">Recursos de {selectedTema?.titulo}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
            <div className="border-2 border-dashed border-slate-200 rounded-[24px] p-10 text-center hover:border-emerald-400 transition-colors bg-slate-50/50">
              <label className="cursor-pointer flex flex-col items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-white shadow-md flex items-center justify-center text-emerald-500">
                  {uploading ? <Loader2 className="animate-spin" size={32} /> : <FileUp size={32} />}
                </div>
                <p className="font-black text-slate-700 uppercase tracking-widest text-sm">{uploading ? "Subiendo..." : "Haz clic para subir un recurso"}</p>
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2"><File size={12} /> Archivos actuales</h4>
              <div className="space-y-3">
                {resources.map((res) => (
                  <div key={res.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-[10px] uppercase text-slate-500">{res.tipo}</div>
                      <span className="font-bold text-slate-700 uppercase text-xs truncate max-w-[200px]">{res.titulo}</span>
                    </div>
                    <div className="flex gap-2">
                      <a href={res.archivo_url} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500"><Download size={16}/></Button></a>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteResource(res)}><Trash2 size={16}/></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="p-8 bg-slate-50 border-t shrink-0"><Button variant="outline" className="rounded-xl px-8 font-bold uppercase text-[10px]" onClick={() => setIsResourceDialogOpen(false)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* DIALOG DE CONFIRMACIÓN DE BORRADO SEGURO */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto rounded-[32px] p-6 sm:p-8 border-none shadow-2xl custom-scrollbar">
          <DialogHeader className="flex flex-col items-center text-center">
            <div className="h-20 w-20 bg-destructive/10 text-destructive rounded-3xl flex items-center justify-center mb-6 rotate-3">
              <AlertCircle size={40} />
            </div>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight text-slate-800">¿Estás seguro?</DialogTitle>
            <DialogDescription className="text-slate-500 text-lg leading-relaxed pt-4">
              Estás a punto de borrar el/la {deleteConfirmTarget?.type === 'unidad' ? 'unidad' : 'tema'}: 
              <span className="font-black text-slate-900 block my-3 text-xl italic underline decoration-destructive/30">"{deleteConfirmTarget?.title}"</span>
              Esta acción eliminará <span className="text-destructive font-black underline">TODO</span> el contenido relacionado (temas, ejercicios, presentaciones y recursos) y <span className="font-black text-slate-900">no se puede deshacer.</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-8">
            <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] text-center mb-4">
                Escribe <span className="text-destructive">BORRAR</span> para confirmar
              </p>
              <Input 
                value={deleteConfirmInput} 
                onChange={e => setDeleteConfirmInput(e.target.value)}
                placeholder="BORRAR"
                className="h-16 text-center text-2xl font-black tracking-[0.5em] uppercase border-none bg-white shadow-inner focus-visible:ring-destructive rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-4">
            <Button variant="ghost" className="flex-1 rounded-2xl h-16 font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600" onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
            <Button 
              variant="destructive" 
              className="flex-1 rounded-2xl h-16 font-black uppercase tracking-widest gap-3 shadow-xl shadow-destructive/20 disabled:opacity-20 transition-all active:scale-95"
              disabled={deleteConfirmInput !== 'BORRAR'}
              onClick={onConfirmDelete}
            >
              <Trash2 size={20} /> Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE CONFIRMACIÓN PARA DIAPOSITIVAS */}
      <Dialog open={!!slideToDelete} onOpenChange={(open) => !open && setSlideToDelete(null)}>
        <DialogContent className="max-w-sm rounded-[32px] p-8 border-none shadow-2xl">
          <DialogHeader className="flex flex-col items-center text-center">
            <div className="h-16 w-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-4">
              <Trash2 size={32} />
            </div>
            <DialogTitle className="text-xl font-black uppercase text-slate-800">¿Eliminar Diapositiva?</DialogTitle>
            <DialogDescription className="text-slate-500 pt-2">
              ¿Estás seguro de que quieres eliminar esta diapositiva? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-3 pt-6">
            <Button variant="ghost" className="flex-1 rounded-xl h-12 font-bold uppercase text-[10px]" onClick={() => setSlideToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" className="flex-1 rounded-xl h-12 font-black uppercase text-[10px] bg-red-500 text-white" onClick={confirmDeleteSlide}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
