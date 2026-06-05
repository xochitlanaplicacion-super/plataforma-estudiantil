
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
  CalendarClock,
  Youtube,
  Video,
  PlusCircle,
  ExternalLink,
  Wand2,
  BrainCircuit
} from 'lucide-react';

import { 
  getMyAsignaciones, 
  getMisAgrupaciones,
  upsertAgrupacion,
  deleteAgrupacion,
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
  updateSlidesOrder,
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
import { cn, parseFechaLocal } from '@/lib/utils';
import confetti from 'canvas-confetti';
import { polyfill } from "mobile-drag-drop";
import "mobile-drag-drop/default.css";
import { ActivityPreview } from '@/components/shared/ActivityPreview';
import { PanelEntregasProfesor } from '@/components/shared/PanelEntregasProfesor';
import { useInstitucion } from '@/hooks/use-institucion';
import SlideCanvasEditor, { parseSlideContent, serializeSlideContent } from '@/components/shared/slide-canvas-editor';
import SlideViewer from '@/components/shared/slide-viewer';
import { SLIDE_TEMPLATES } from '@/components/shared/slide-templates';
import { exportSlidesToPptx } from '@/lib/export-pptx';
import { ProfesorAIAssistant } from '@/components/shared/ProfesorAIAssistant';
import { getEstadoPagoIA } from '@/lib/actions/pagos';
import Image from "next/image";

const LOGO_FALLBACK = '/images/logo_placeholder.svg';


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
  const [appState, setAppState] = useState<'INPUT' | 'SELECT'>(content.aiSuggestedWords?.length > 0 ? 'SELECT' : 'INPUT');
  const [text, setText] = useState(content.text || '');
  const [tokens, setTokens] = useState<Token[]>(content.tokens || []);

  useEffect(() => {
    if (content.text && content.text !== text) {
      setText(content.text);
      
      // Si la IA generó el texto, auto-procesar a tokens y seleccionar sugerencias
      if (content.aiSuggestedWords && content.aiSuggestedWords.length > 0) {
        const words = content.text.split(/(\s+)/).filter((w: string) => w.length > 0);
        
        const newTokens = words.map((word: string, i: number) => ({ 
          id: `token-${Date.now()}-${i}`, 
          text: word, 
          isMissing: false,
          isAiSuggested: false
        }));

        // Buscar secuencias exactas para frases de múltiples palabras
        content.aiSuggestedWords.forEach((sw: string) => {
          const swWords = sw.split(/\s+/).map(w => w.replace(/[.,;!?()]/g, '').trim().toLowerCase()).filter(w => w);
          if (swWords.length === 0) return;

          for (let i = 0; i <= newTokens.length - swWords.length; i++) {
            let match = true;
            let tokenIndex = i;
            let swIndex = 0;

            while (swIndex < swWords.length && tokenIndex < newTokens.length) {
              const currentTokenText = newTokens[tokenIndex].text;
              if (currentTokenText.trim() === '') {
                tokenIndex++;
                continue;
              }
              const cleanToken = currentTokenText.replace(/[.,;!?()]/g, '').trim().toLowerCase();
              if (cleanToken !== swWords[swIndex]) {
                match = false;
                break;
              }
              swIndex++;
              tokenIndex++;
            }

            if (swIndex < swWords.length) match = false;

            if (match) {
              // Encontramos la secuencia exacta, marcar esos tokens
              let markIndex = i;
              let markedCount = 0;
              while (markedCount < swWords.length && markIndex < newTokens.length) {
                if (newTokens[markIndex].text.trim() !== '') {
                  newTokens[markIndex].isMissing = true;
                  newTokens[markIndex].isAiSuggested = true;
                  markedCount++;
                }
                markIndex++;
              }
              break; // Solo marcamos la primera aparición de la frase sugerida
            }
          }
        });

        setTokens(newTokens);
        setAppState("SELECT");
        updateContent({ ...content, text: content.text, tokens: newTokens });
      }
    }
  }, [content.text, content.aiSuggestedWords]);

  const handleInputNext = () => {
    const words = text.split(/(\s+)/).filter((w: string) => w.length > 0);
    let newTokens = tokens;
    if (words.join("") !== tokens.map(t => t.text).join("")) {
      newTokens = words.map((word: string, i: number) => ({ id: `token-${Date.now()}-${i}`, text: word, isMissing: false }));
      setTokens(newTokens);
    }
    setAppState("SELECT");
    updateContent({ ...content, text, tokens: newTokens });
  };

  const handleToggleToken = (id: string) => {
    const newTokens = tokens.map(t => t.id === id ? { ...t, isMissing: !t.isMissing } : t);
    setTokens(newTokens);
    updateContent({ ...content, text, tokens: newTokens });
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
        {tokens.map((token: any) => {
          if (!token.text.trim()) return <span key={token.id} className="w-2">{token.text}</span>;
          
          return (
            <button
              key={token.id}
              onClick={() => handleToggleToken(token.id)}
              className={cn("px-2 py-1 rounded-lg transition-all font-black text-lg border-b-4", 
                token.isMissing 
                  ? (token.isAiSuggested ? "bg-amber-400 border-amber-600 text-amber-900 shadow-xl transform scale-110 -translate-y-1 mx-1 z-10" : "bg-indigo-600 border-indigo-800 text-white shadow-xl transform scale-110 -translate-y-1 mx-1 z-10")
                  : "bg-slate-50 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-700")}
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
      <Button onClick={() => updateContent({ ...content, text, tokens, aiSuggestedWords: [] })} className="w-full h-16 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest shadow-xl transition-all text-sm">
        <CheckCircle2 className="w-5 h-5 mr-2" /> Guardar Configuración
      </Button>
    </div>
  );
}


const TemplateEditor = ({ type, content, updateContent, pagoIA }: { type: string, content: any, updateContent: (newContent: any) => void, pagoIA?: boolean }) => {
  const supabase = createClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  
  // Estados para Generador IA Crucigrama
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiNumWords, setAiNumWords] = useState(5);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [fillBlankRetryPrompt, setFillBlankRetryPrompt] = useState('');

  const generateAI = async (promptOverride?: string | React.MouseEvent) => {
    const isStringOverride = typeof promptOverride === 'string';
    let effectivePrompt = (isStringOverride ? promptOverride : aiPrompt).trim();
    if (!effectivePrompt && type === 'completar_espacios') {
      effectivePrompt = content?.text || '';
    }
    
    if (!effectivePrompt) {
      toast({ variant: "destructive", title: "Error", description: "El prompt no puede estar vacío." });
      return;
    }
    setAiGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let endpoint = '';
      let payload: any = { prompt: effectivePrompt, userId: user?.id };
      
      if (type === 'crucigrama') {
        endpoint = '/api/exercises/generate-crossword';
        payload.numPalabras = aiNumWords;
      } else if (type === 'opcion_multiple') {
        endpoint = '/api/exercises/generate-quiz';
        payload.numPreguntas = aiNumWords;
      } else if (type === 'verdadero_falso') {
        endpoint = '/api/exercises/generate-true-false';
        payload.numPreguntas = aiNumWords;
      } else if (type === 'emparejamiento') {
        endpoint = '/api/exercises/generate-matching';
        payload.numPares = aiNumWords;
      } else if (type === 'ordenar_secuencia') {
        endpoint = '/api/exercises/generate-sequence';
        payload.numPasos = aiNumWords;
      } else if (type === 'completar_espacios') {
        endpoint = '/api/exercises/generate-fill-blank';
        payload.numPalabras = aiNumWords;
      } else if (type === 'sopa_letras') {
        endpoint = '/api/exercises/generate-word-search';
        payload.numPalabras = aiNumWords;
      } else if (type === 'flashcards') {
        endpoint = '/api/exercises/generate-flashcards';
        payload.numTarjetas = aiNumWords;
      }
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Error en la IA");
      const data = await res.json();
      
      if (type === 'crucigrama') {
        updateContent({ ...content, words: data.words || [], clues: data.clues || [] });
      } else if (type === 'sopa_letras') {
        updateContent({ ...content, words: data.words || [], clues: data.clues || [], sopaFeedback: data.feedback || '' });
      } else if (type === 'opcion_multiple' || type === 'verdadero_falso' || type === 'emparejamiento' || type === 'flashcards') {
        updateContent({ ...content, items: data.items || [] });
      } else if (type === 'ordenar_secuencia') {
        updateContent({ ...content, items: data.items || [], feedback: data.feedback || '' });
      } else if (type === 'completar_espacios') {
        // Inyectar el texto en el editor — el profesor selecciona las palabras ocultas manualmente
        updateContent({ ...content, text: data.text || '', aiSuggestedWords: data.suggestedWords || [], feedback: data.feedback || '' });
        setFillBlankRetryPrompt(effectivePrompt);
      }
      
      setAiModalOpen(false);
      setAiPrompt("");
      toast({ title: "¡Generación exitosa!", description: "La información se ha inyectado en el formulario." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message || "No se pudo generar la actividad." });
    } finally {
      setAiGenerating(false);
    }
  };

  const renderAiButton = () => {
    if (!pagoIA) return null;
    return (
      <Button 
        className="w-full bg-[#110B29] hover:bg-[#1a0f3d] text-[#A855F7] border border-[#A855F7]/30 shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.5)] rounded-2xl h-14 font-black uppercase tracking-widest transition-all mb-6"
        onClick={() => setAiModalOpen(true)}
      >
        <BrainCircuit size={18} className="mr-3" /> Generar con IA
      </Button>
    );
  };

  const renderAiModal = () => (
    <Dialog open={aiModalOpen} onOpenChange={setAiModalOpen}>
      <DialogContent className="sm:max-w-[950px] p-0 border-[#3b0764] bg-[#0f041a] text-slate-200 overflow-hidden rounded-[32px]">
        <div className="flex flex-col md:flex-row">
          <div className="flex-1 p-8 space-y-6">
          <div className="flex items-center gap-4 border-b border-[#3b0764] pb-6">
            <div className="p-3 bg-[#A855F7]/20 rounded-2xl text-[#A855F7]">
              <BrainCircuit size={28} />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-white uppercase tracking-wider">
                {type === 'crucigrama' ? 'Crucigrama IA'
                  : type === 'opcion_multiple' ? 'Opción Múltiple IA'
                  : type === 'verdadero_falso' ? 'Verdadero/Falso IA'
                  : type === 'emparejamiento' ? 'Emparejamiento IA'
                  : type === 'completar_espacios' ? 'Completar Espacios IA'
                  : type === 'sopa_letras' ? 'Sopa de Letras IA'
                  : type === 'flashcards' ? 'Flashcards IA'
                  : 'Ordenar Secuencia IA'}
              </DialogTitle>
              <DialogDescription className="text-xs text-[#A855F7] uppercase font-bold tracking-widest mt-1">Generación asistida</DialogDescription>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#A855F7]">
                {type === 'crucigrama' ? 'N° de Palabras'
                  : type === 'opcion_multiple' ? 'N° de Preguntas'
                  : type === 'verdadero_falso' ? 'N° de Enunciados'
                  : type === 'emparejamiento' ? 'N° de Pares'
                  : type === 'completar_espacios' ? 'N° de Palabras Clave'
                  : type === 'sopa_letras' ? 'N° de Palabras'
                  : type === 'flashcards' ? 'N° de Tarjetas'
                  : 'N° de Pasos'}
              </label>
              <Input 
                type="number" 
                min={2} 
                max={20}
                value={aiNumWords}
                onChange={(e) => setAiNumWords(parseInt(e.target.value) || 5)}
                className="h-12 bg-black/40 border-[#3b0764] focus-visible:ring-[#A855F7] text-white rounded-xl"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#A855F7]">Instrucciones / Texto Base</label>
              <textarea 
                rows={6}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Pega aquí un texto sobre el tema o escribe las instrucciones específicas para la IA..."
                className="w-full p-4 bg-black/40 border-2 border-[#3b0764] rounded-2xl text-sm outline-none focus:border-[#A855F7] focus:ring-4 focus:ring-[#A855F7]/20 transition-all text-white placeholder-slate-600 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button 
              variant="outline" 
              className="flex-1 rounded-2xl h-12 bg-transparent border-[#3b0764] text-slate-300 hover:bg-[#3b0764]/30 hover:text-white"
              onClick={() => setAiModalOpen(false)}
            >
              CANCELAR
            </Button>
            <Button 
              className="flex-1 rounded-2xl h-12 bg-gradient-to-r from-[#7e22ce] to-[#9333ea] hover:from-[#6b21a8] hover:to-[#7e22ce] text-white font-black uppercase tracking-widest border border-[#c084fc]/50 shadow-[0_0_20px_rgba(168,85,247,0.4)]"
              onClick={generateAI}
              disabled={aiGenerating}
            >
              {aiGenerating ? <Loader2 className="animate-spin" size={18} /> : "GENERAR"}
            </Button>
          </div>
        </div>
        
        {/* RIGHT PANEL: AI BOT */}
        <div className="hidden md:flex flex-col items-center justify-center w-80 bg-[#1a0b2e]/50 border-l border-[#3b0764] p-8 relative">
          <div className={`relative w-full aspect-square ${aiGenerating ? 'animate-bot-thinking' : 'animate-bot-hover'}`}>
            <Image 
              src={aiGenerating ? "/images/THINKINGBOT.png" : "/images/NORMALBOT.png"} 
              alt="AI Bot" 
              fill
              className="object-contain drop-shadow-[0_0_30px_rgba(168,85,247,0.4)]"
            />
          </div>
          
          {/* ONDAS NEON AZULES (GRAVITACIONALES) */}
          <div className={`absolute bottom-12 w-48 h-8 rounded-[100%] bg-blue-500/40 blur-[20px] shadow-[0_0_50px_20px_rgba(59,130,246,0.6)] ${aiGenerating ? 'animate-pulse-fast' : 'animate-pulse-slow'}`} />
          <div className={`absolute bottom-12 w-24 h-4 rounded-[100%] bg-cyan-400/70 blur-[10px] shadow-[0_0_30px_10px_rgba(34,211,238,0.8)] ${aiGenerating ? 'animate-pulse-fast' : 'animate-pulse-slow'}`} />
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );

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
        {renderAiButton()}
        {renderAiModal()}
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
            {item.feedback && (
              <div className="text-[10px] bg-[#A855F7]/10 text-[#A855F7] p-3 rounded-xl border border-[#A855F7]/30 font-bold">
                💡 EXPLICACIÓN IA: {item.feedback}
              </div>
            )}
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
        {renderAiButton()}
        {renderAiModal()}
        {content.items?.map((item: any, idx: number) => (
          <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col gap-4">
            <div className="flex items-center gap-4">
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
            {item.feedback && (
              <div className="text-[10px] bg-[#A855F7]/10 text-[#A855F7] p-3 rounded-xl border border-[#A855F7]/30 font-bold">
                💡 EXPLICACIÓN IA: {item.feedback}
              </div>
            )}
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
        {renderAiButton()}
        {renderAiModal()}
        <div className="text-center space-y-2 mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-widest">Pares de Emparejamiento</h3>
          <p className="text-xs text-slate-500 font-bold uppercase">Agrega los conceptos y sus definiciones. El alumno deberá unirlos correctamente.</p>
        </div>
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          {content.items?.map((item: any, idx: number) => (
            <div key={idx} className="flex flex-col gap-3 bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 relative group transition-all hover:border-purple-200 hover:shadow-md">
              <div className="flex gap-4 items-center">
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
              {item.feedback && (
                <div className="text-[10px] bg-[#A855F7]/10 text-[#A855F7] p-3 rounded-xl border border-[#A855F7]/30 font-bold">
                  💡 EXPLICACIÓN IA: {item.feedback}
                </div>
              )}
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
        {renderAiButton()}
        {renderAiModal()}
        {content.feedback && (
          <div className="text-[10px] bg-[#A855F7]/10 text-[#A855F7] p-3 rounded-xl border border-[#A855F7]/30 font-bold">
            💡 EXPLICACIÓN IA (orden): {content.feedback}
          </div>
        )}
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
    return (
      <div className="space-y-4">
        {renderAiButton()}
        {renderAiModal()}
        {content.feedback && (
          <div className="text-[10px] bg-[#A855F7]/10 text-[#A855F7] p-3 rounded-xl border border-[#A855F7]/30 font-bold">
            💡 NOTA IA: {content.feedback}
          </div>
        )}
        {content.aiSuggestedWords?.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
            <p className="text-[10px] font-black uppercase text-amber-700 mb-2">📌 Palabras sugeridas por la IA para ocultar:</p>
            <div className="flex flex-wrap gap-2">
              {content.aiSuggestedWords.map((w: string, i: number) => (
                <span key={i} className="px-2 py-1 bg-amber-200 text-amber-900 rounded-lg text-xs font-bold">{w}</span>
              ))}
            </div>
            <div className="border-t border-amber-200 pt-3 space-y-2">
              <label className="text-[10px] font-black uppercase text-amber-600">🔄 Instrucciones para regenerar:</label>
              <textarea
                rows={3}
                value={fillBlankRetryPrompt}
                onChange={(e) => setFillBlankRetryPrompt(e.target.value)}
                placeholder="Escribe o modifica las instrucciones para que la IA regenere el ejercicio..."
                className="w-full p-3 bg-white border-2 border-amber-200 rounded-xl text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 transition-all resize-none text-slate-700"
              />
              <button
                onClick={() => generateAI(fillBlankRetryPrompt)}
                disabled={aiGenerating || !fillBlankRetryPrompt.trim()}
                className="flex items-center gap-2 text-[11px] font-black uppercase text-white bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded-xl transition-all disabled:opacity-50 shadow-md"
              >
                <RotateCcw size={14} className={aiGenerating ? 'animate-spin' : ''} />
                {aiGenerating ? 'Regenerando...' : 'No me convence — Rehacer con IA'}
              </button>
            </div>
          </div>
        )}
        <CompletarEspaciosEditor content={content} updateContent={updateContent} />
      </div>
    );
  }

  if (type === 'flashcards') {
    return (
      <div className="space-y-8">
        {renderAiButton()}
        {renderAiModal()}
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
        {renderAiButton()}
        {renderAiModal()}

        {type === 'sopa_letras' && content.sopaFeedback && (
          <div className="text-[10px] bg-[#A855F7]/10 text-[#A855F7] p-3 rounded-xl border border-[#A855F7]/30 font-bold">
            💡 EXPLICACIÓN IA: {content.sopaFeedback}
          </div>
        )}

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

  const { config: inst } = useInstitucion();
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [agrupaciones, setAgrupaciones] = useState<any[]>([]);
  const [selectedAgrupacion, setSelectedAgrupacion] = useState<any>(null);
  const [isGroupMode, setIsGroupMode] = useState(false);
  
  const [selectedMateria, setSelectedMateria] = useState<any>(null);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [selectedUnidad, setSelectedUnidad] = useState<any>(null);
  const [temas, setTemas] = useState<any[]>([]);
  const [selectedTema, setSelectedTema] = useState<any>(null);
  const [ejercicios, setEjercicios] = useState<any[]>([]);
  
  const [slides, setSlides] = useState<any[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [presentationMode, setPresentationMode] = useState(false);
  const [slideDialogOpen, setSlideDialogOpen] = useState(false);

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

  // Estados para Generador de IA
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiTema, setAiTema] = useState('');
  const [aiNumSlides, setAiNumSlides] = useState(5);
  const [aiInstrucciones, setAiInstrucciones] = useState('');
  const [aiEstilo, setAiEstilo] = useState('canva_estrellas_1');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [pagoIA, setPagoIA] = useState(false);

  useEffect(() => {
    getEstadoPagoIA().then(setPagoIA);
  }, []);

  const pendingUpserts = useRef<{ [slideId: string]: NodeJS.Timeout }>({});
  const prevActiveSlideIdRef = useRef<string | null>(null);

  // Flush pending upserts on dialog close
  useEffect(() => {
    if (!slideDialogOpen) {
      Object.keys(pendingUpserts.current).forEach(async (id) => {
        const timeout = pendingUpserts.current[id];
        if (timeout) {
          clearTimeout(timeout);
          delete pendingUpserts.current[id];
          const slideToUpdate = slides.find(s => s.id === id);
          if (slideToUpdate) {
            try {
              await upsertSlide(slideToUpdate, isGroupMode);
            } catch (err) {
              console.error("Error flushing on close:", err);
            }
          }
        }
      });
    }
  }, [slideDialogOpen, slides]);

  // Flush pending upserts on slide change
  useEffect(() => {
    const currentSlide = slides[activeSlideIndex];
    const prevSlideId = prevActiveSlideIdRef.current;
    
    if (prevSlideId && currentSlide && prevSlideId !== currentSlide.id) {
      const timeout = pendingUpserts.current[prevSlideId];
      if (timeout) {
        clearTimeout(timeout);
        delete pendingUpserts.current[prevSlideId];
        const slideToUpdate = slides.find(s => s.id === prevSlideId);
        if (slideToUpdate) {
          upsertSlide(slideToUpdate, isGroupMode).catch(err => {
            console.error("Error flushing on slide change:", err);
          });
        }
      }
    }
    
    if (currentSlide) {
      prevActiveSlideIdRef.current = currentSlide.id;
    } else {
      prevActiveSlideIdRef.current = null;
    }
  }, [activeSlideIndex, slides]);

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(pendingUpserts.current).forEach(clearTimeout);
    };
  }, []);

  const handleGenerateAI = async () => {
    if (!aiTema) {
      toast({ title: 'Atención', description: 'Debes ingresar un tema.', variant: 'destructive' });
      return;
    }
    
    setIsGeneratingAI(true);
    try {
      const res = await fetch('/api/slides/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tema: aiTema,
          numSlides: aiNumSlides,
          instrucciones: aiInstrucciones,
          estilo: aiEstilo,
          userId: (await supabase.auth.getUser()).data.user?.id || null
        })
      });

      if (!res.ok) throw new Error('Error al generar las diapositivas');
      
      const { slides: generatedSlides } = await res.json();
      
      // Save all generated slides to DB
      if (generatedSlides && generatedSlides.length > 0) {
        for (const slide of generatedSlides) {
          const newSlideData = {
            tema_id: selectedTema.id,
            titulo: slide.titulo,
            contenido: slide.contenido,
            estilo: slide.estilo,
            orden: slide.orden + slides.length
          };
          await upsertSlide(newSlideData, isGroupMode);
        }
        
        await fetchSlides(selectedTema.id);
        toast({ title: '¡Éxito!', description: 'Diapositivas generadas con IA.' });
        setAiDialogOpen(false);
        setAiTema('');
        setAiInstrucciones('');
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Hubo un problema comunicándose con la IA.', variant: 'destructive' });
      console.error(error);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      const { data: profileData } = await supabase.from('profiles').select('nombre, apellidos').eq('id', user.id).single();
      if (profileData) {
        setCurrentUserName(`${profileData.nombre} ${profileData.apellidos}`.trim());
      }
      const { data } = await getMyAsignaciones(user.id);
      if (data) setAsignaciones(data);
      const { data: agrupos } = await getMisAgrupaciones(user.id);
      if (agrupos) setAgrupaciones(agrupos);
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
      if (dialog.type === 'agrupacion') {
        const ag = { ...d, profesor_id: currentUserId };
        result = await upsertAgrupacion(ag);
        if (!result.error) {
          const { data: agrupos } = await getMisAgrupaciones(currentUserId!);
          if (agrupos) setAgrupaciones(agrupos);
        }
      }

      if (dialog.type === 'unidad') {
        if (!selectedMateria?.id) { toast({ variant: "destructive", title: "Error", description: "No hay materia seleccionada." }); return; }
        const targetMateriaIds = (isGroupMode && d.syncToAll) ? 
          selectedAgrupacion?.asignaciones_ids.map((id:string) => asignaciones.find((a:any) => a.id === id)?.materia_id).filter(Boolean) : undefined;
        result = await upsertUnidad({...d, materia_id: selectedMateria.id, created_by: user?.id}, targetMateriaIds);
      }
      
      if (dialog.type === 'tema') {
        if (!selectedUnidad?.id) { toast({ variant: "destructive", title: "Error", description: "No hay unidad seleccionada." }); return; }
        result = await upsertTema({...d, unidad_id: selectedUnidad.id, created_by: user?.id}, isGroupMode && d.syncToAll);
      }
      
      if (dialog.type === 'ejercicio') {
        if (!selectedTema?.id) { toast({ variant: "destructive", title: "Error", description: "No hay tema seleccionado." }); return; }
        const finalContent = typeof d.contenido === 'string' ? d.contenido : JSON.stringify(d.contenido || {});
        result = await upsertEjercicio({...d, contenido: finalContent, tema_id: selectedTema.id, created_by: user?.id}, isGroupMode && d.syncToAll);
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

  const handleDelete = async (type: string, id: string, title?: string, sync_id?: string) => {
    if (type === 'unidad' || type === 'tema' || type === 'ejercicio' || type === 'agrupacion') {
      setDeleteConfirmTarget({ type, id, title, sync_id: (isGroupMode || type === 'agrupacion') ? sync_id : undefined });
      setDeleteConfirmInput("");
      setDeleteConfirmOpen(true);
      return;
    }
  };

  const onConfirmDelete = async () => {
    if (deleteConfirmInput !== 'BORRAR') return;
    if (!deleteConfirmTarget) return;

    let error;
    const { type, id } = deleteConfirmTarget;

    if (type === 'unidad') ({ error } = await deleteUnidad(id, deleteConfirmTarget.sync_id));
    if (type === 'tema') ({ error } = await deleteTema(id, deleteConfirmTarget.sync_id));
    if (type === 'ejercicio') ({ error } = await deleteEjercicio(id, deleteConfirmTarget.sync_id));
    if (type === 'agrupacion') {
      ({ error } = await deleteAgrupacion(id));
      if (!error) {
        const { data: agrupos } = await getMisAgrupaciones(currentUserId!);
        if (agrupos) setAgrupaciones(agrupos);
      }
    }

    if (!error) {
      toast({ title: "Eliminado con éxito", description: `Se ha borrado el/la ${type === 'ejercicio' ? 'actividad' : type} y todo su contenido.` });
      setDeleteConfirmOpen(false);
      setDeleteConfirmTarget(null);
      if (type === 'unidad') { fetchUnidades(selectedMateria.id); setSelectedUnidad(null); }
      if (type === 'tema') { fetchTemas(selectedUnidad.id); setSelectedTema(null); }
      if (type === 'ejercicio') fetchEjercicios(selectedTema.id);
    } else {
      toast({ variant: "destructive", title: "Error al eliminar", description: "No se pudo realizar la operación." });
    }
  };

  const handleOpenSlideEditor = (tema: any) => {
    setSelectedTema(tema);
    fetchSlides(tema.id);
    setSlideDialogOpen(true);
  };

  const handleAddSlide = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const defaultCanvasContent = serializeSlideContent({
      elements: [
        {
          id: `title-${Date.now()}`,
          type: 'text',
          content: 'TÍTULO AQUÍ',
          x: 10, y: 10, width: 80, height: 15,
          style: { fontSize: '48px', fontWeight: 'bold', color: '#ffffff', textAlign: 'center' }
        },
        {
          id: `body-${Date.now() + 1}`,
          type: 'text',
          content: 'Escribe el contenido de tu diapositiva...',
          x: 10, y: 35, width: 80, height: 50,
          style: { fontSize: '24px', fontWeight: 'normal', color: '#ffffffcc', textAlign: 'left' }
        }
      ]
    });
    const newSlide = {
      tema_id: selectedTema.id,
      titulo: 'Nueva Diapositiva',
      contenido: defaultCanvasContent,
      orden: slides.length + 1,
      created_by: user?.id,
      estilo: 'canva_estrellas_1'
    };
    const { data, error } = await upsertSlide(newSlide, isGroupMode);
    if (error) { toast({ variant: "destructive", title: "Error", description: "Problema al crear diapositiva." }); return; }
    if (data) {
      setSlides([...slides, data]);
      setActiveSlideIndex(slides.length);
    }
  };

  const handleUpdateSlide = useCallback((id: string, updates: any) => {
    setSlides(prevSlides => {
      const slideToUpdate = prevSlides.find(s => s.id === id);
      if (!slideToUpdate) return prevSlides;
      const updated = { ...slideToUpdate, ...updates };

      // Cancelar cualquier upsert pendiente para esta diapositiva
      if (pendingUpserts.current[id]) {
        clearTimeout(pendingUpserts.current[id]);
      }

      // Programar el upsert en la base de datos después de 1 segundo de inactividad
      pendingUpserts.current[id] = setTimeout(async () => {
        try {
          await upsertSlide(updated, isGroupMode);
          delete pendingUpserts.current[id];
        } catch (err) {
          console.error("Error doing autosave:", err);
        }
      }, 1000);

      return prevSlides.map(s => s.id === id ? updated : s);
    });
  }, []);

  const handleApplyGlobalStyles = async (style: any) => {
    if (!style || !slides || slides.length === 0) return;
    
    toast({ title: 'Aplicando estilos...', description: 'Actualizando todas las diapositivas.' });
    const newSlides = [...slides];
    
    for (let i = 0; i < newSlides.length; i++) {
      const slide = newSlides[i];
      try {
        const data = parseSlideContent(slide.contenido);
        if (data && data.elements) {
          let hasChanges = false;
          data.elements.forEach((el: any) => {
            if (el.type === 'text') {
              el.style = {
                ...el.style,
                color: style.color || el.style?.color,
                fontFamily: style.fontFamily || el.style?.fontFamily
              };
              hasChanges = true;
            }
          });
          
          if (hasChanges) {
            const updatedSlide = { ...slide, contenido: serializeSlideContent(data) };
            newSlides[i] = updatedSlide;
            await upsertSlide(updatedSlide, isGroupMode);
          }
        }
      } catch (e) {
        console.error("Error applying global styles to slide", slide.id);
      }
    }
    
    setSlides(newSlides);
    toast({ title: '¡Éxito!', description: 'Color y fuente aplicados a todas las diapositivas.' });
  };

  const handleMoveSlide = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === slides.length - 1) return;

    const newSlides = [...slides];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;

    // Intercambiar `orden`
    const currentOrden = newSlides[index].orden ?? index;
    const swapOrden = newSlides[swapIndex].orden ?? swapIndex;
    
    newSlides[index] = { ...newSlides[index], orden: swapOrden };
    newSlides[swapIndex] = { ...newSlides[swapIndex], orden: currentOrden };

    // Intercambiar posiciones en el array para re-renderizado inmediato
    const temp = newSlides[index];
    newSlides[index] = newSlides[swapIndex];
    newSlides[swapIndex] = temp;

    setSlides(newSlides);
    
    if (activeSlideIndex === index) {
      setActiveSlideIndex(swapIndex);
    } else if (activeSlideIndex === swapIndex) {
      setActiveSlideIndex(index);
    }

    // Actualizar en BD
    try {
      await updateSlidesOrder([
        { id: newSlides[index].id, orden: newSlides[index].orden },
        { id: newSlides[swapIndex].id, orden: newSlides[swapIndex].orden }
      ]);
    } catch (e) {
      console.error("Error updating slide order", e);
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el orden en el servidor." });
    }
  };

  const handleDeleteSlide = (id: string) => {
    setSlideToDelete(id);
  };

  const confirmDeleteSlide = async () => {
    if (!slideToDelete) return;

    // Antes de borrar el registro, limpiar las imágenes del bucket
    const slide = slides.find(s => s.id === slideToDelete);
    if (slide?.contenido) {
      try {
        const canvasData = JSON.parse(slide.contenido);
        if (canvasData?.elements && Array.isArray(canvasData.elements)) {
          const imageElements = canvasData.elements.filter(
            (el: any) => el.type === 'image' && el.content
          );
          // Borrar cada imagen del bucket en paralelo
          await Promise.all(
            imageElements.map((el: any) => handleSlideImageDelete(el.content))
          );
        }
      } catch {
        // Si el contenido no es JSON válido (formato legado), no hay nada que limpiar
      }
    }

    const slideToDeleteObj = slides.find(s => s.id === slideToDelete);
    const { error } = await deleteSlide(slideToDelete, isGroupMode ? slideToDeleteObj?.sync_id : undefined);
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
      const { error: dbError } = await upsertResource(newResource, isGroupMode);
      if (dbError) throw dbError;
      toast({ title: "Archivo cargado" });
      fetchResources(selectedTema.id);
    } catch (err: any) { toast({ variant: "destructive", title: "Error", description: err.message }); } finally { setUploading(false); }
  };

  const handleDeleteResource = async (resource: any) => {
    try {
      await supabase.storage.from('recursos-educativos').remove([resource.file_path]);
      const { error: dbError } = await deleteResourceRecord(resource.id, isGroupMode ? resource.sync_id : undefined);
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

  // Función para subir imágenes de diapositivas al bucket
  const handleSlideImageUpload = async (file: File): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      if (file.size > 5 * 1024 * 1024) {
        toast({ variant: 'destructive', title: 'Archivo demasiado grande', description: 'Máximo 5MB por imagen.' });
        return null;
      }
      const ext = file.name.split('.').pop();
      const path = `slides/${selectedTema?.id || 'general'}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('diapositivas-assets').upload(path, file);
      if (uploadErr) {
        // Si el bucket no existe, intentar con recursos-educativos
        const { error: fallbackErr } = await supabase.storage.from('recursos-educativos').upload(`slides/${path}`, file);
        if (fallbackErr) { toast({ variant: 'destructive', title: 'Error al subir imagen', description: fallbackErr.message }); return null; }
        const { data: { publicUrl } } = supabase.storage.from('recursos-educativos').getPublicUrl(`slides/${path}`);
        return publicUrl;
      }
      const { data: { publicUrl } } = supabase.storage.from('diapositivas-assets').getPublicUrl(path);
      return publicUrl;
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
      return null;
    }
  };

  // Borra la imagen física del bucket de Supabase cuando se elimina del editor
  const handleSlideImageDelete = async (url: string): Promise<void> => {
    try {
      // Extraer el path relativo desde la URL pública de Supabase
      // La URL tiene la forma: .../storage/v1/object/public/BUCKET/path/to/file.ext
      const BUCKETS = ['diapositivas-assets', 'recursos-educativos'];
      for (const bucket of BUCKETS) {
        const marker = `/object/public/${bucket}/`;
        if (url.includes(marker)) {
          const filePath = url.split(marker)[1];
          // Decodificar caracteres especiales en el path
          const decodedPath = decodeURIComponent(filePath);
          const { error } = await supabase.storage.from(bucket).remove([decodedPath]);
          if (error) {
            console.error(`Error al borrar imagen del bucket '${bucket}':`, error.message);
          }
          return;
        }
      }
      console.warn('No se pudo determinar el bucket para borrar:', url);
    } catch (err: any) {
      console.error('Error inesperado al borrar imagen:', err.message);
    }
  };

  if (presentationMode && slides.length > 0) {
    const slide = slides[activeSlideIndex];
    if (!slide) { setPresentationMode(false); return null; }

    return (
      <div className="fixed inset-0 z-[100] grid grid-rows-[1fr_auto] overflow-hidden bg-black">
        <div className="absolute top-0 left-0 h-1.5 bg-blue-400/50 w-full z-50">
          <div className="h-full bg-blue-400 transition-all duration-500 shadow-[0_0_15px_rgba(96,165,250,0.8)]" style={{ width: `${((activeSlideIndex + 1) / slides.length) * 100}%` }} />
        </div>
        <div className="relative w-full h-full flex items-center justify-center p-4">
          <div className="w-full max-w-[1600px] mx-auto">
            <SlideViewer slide={slide} />
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
              <img src={inst.logo_url || LOGO_FALLBACK} alt="Logo" className="h-20 w-auto object-contain" />
              <span className="hidden lg:block text-[10px] font-black uppercase tracking-[0.3em] text-white/40">{inst.siglas} Plataforma de Enseñanza</span>
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
            <TabsTrigger value="entregas" disabled={!selectedTema || ejercicios.length === 0} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Entregas</TabsTrigger>
          </TabsList>

          <TabsContent value="materias">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Mis Clases</h3>
              <Button size="sm" onClick={() => setDialog({ open: true, type: 'agrupacion', data: { nombre: '', asignaciones_ids: [] } })} className="bg-indigo-600 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-indigo-700">
                <Plus size={14} className="mr-2" /> Crear Agrupación
              </Button>
            </div>

            {agrupaciones.length > 0 && (
              <div className="mb-8">
                <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-4">Agrupaciones</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {agrupaciones.map((agr) => {
                    // Pre-calculate title using first matching asignacion
                    const firstAsig = asignaciones.find(a => a.id === agr.asignaciones_ids[0]);
                    return (
                      <Card key={agr.id} onClick={() => { 
                        setIsGroupMode(true);
                        setSelectedAgrupacion(agr);
                        if (firstAsig) {
                          setSelectedMateria({...firstAsig.materias, id: firstAsig.materia_id, isAgrupacion: true, agrupacionNombre: agr.nombre }); 
                          fetchUnidades(firstAsig.materia_id); 
                          setCurrentTab('unidades');
                        }
                      }} className="cursor-pointer hover:shadow-2xl transition-all duration-300 border-2 border-indigo-100 hover:border-indigo-400 rounded-3xl bg-indigo-50/30 relative">
                        <div className="h-2 bg-indigo-500 rounded-t-[30px]" />
                        <CardHeader className="p-6">
                          <Badge variant="outline" className="text-[9px] font-black bg-indigo-100 text-indigo-700 border-indigo-200 uppercase mb-4">Agrupación ({agr.asignaciones_ids.length} Grupos)</Badge>
                          <CardTitle className="text-xl font-black text-slate-800 uppercase leading-tight">{agr.nombre}</CardTitle>
                          {firstAsig && <p className="text-[10px] font-bold text-muted-foreground uppercase mt-2">{firstAsig.materias?.nombre}</p>}
                          <div className="absolute top-4 right-4 flex gap-1 bg-white/50 rounded-lg p-1 backdrop-blur-sm">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-500" onClick={(e) => { e.stopPropagation(); setDialog({ open: true, type: 'agrupacion', data: agr }); }}><Edit size={14}/></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete('agrupacion', agr.id, agr.nombre); }}><Trash2 size={14}/></Button>
                          </div>
                        </CardHeader>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Grupos Individuales</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {asignaciones.map((asig) => (
                <Card key={asig.id} onClick={() => { setIsGroupMode(false); setSelectedAgrupacion(null); setSelectedMateria({...asig.materias, id: asig.materia_id}); fetchUnidades(asig.materia_id); setCurrentTab('unidades'); }} className="cursor-pointer hover:shadow-2xl transition-all duration-300 border-2 border-slate-100 hover:border-primary/40 rounded-3xl bg-white">
                  <div className="h-2 bg-primary/20 rounded-t-[30px]" />
                  <CardHeader className="p-6">
                    <Badge variant="outline" className="text-[9px] font-black bg-primary/5 text-primary border-primary/20 uppercase mb-4">{asig.niveles?.nombre}</Badge>
                    <CardTitle className="text-xl font-black text-slate-800 uppercase leading-tight">{asig.materias?.nombre}</CardTitle>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mt-2">{asig.carreras?.nombre}</p>
                    {asig.grupos && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-[10px] shrink-0">G</span>
                        <p className="text-[10px] font-bold text-primary/80 uppercase leading-tight">
                          {asig.grupos.grados?.nombre ? `${asig.grupos.grados.nombre} - ` : ''}{asig.grupos.nombre}
                        </p>
                      </div>
                    )}
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
                       const fechaEntrega = e.fecha_entrega ? parseFechaLocal(e.fecha_entrega) : null;
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
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete('ejercicio', e.id, e.titulo)}><Trash2 size={16}/></Button>
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
                 ejercicios={ejercicios} 
                 materiaId={selectedMateria?.id} 
                 materiaNombre={isGroupMode ? (selectedAgrupacion?.nombre || '') : selectedMateria?.materias?.nombre || ''}
                 isGroupMode={isGroupMode}
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
                <DialogTitle className="font-black text-2xl uppercase tracking-tight text-slate-800">
                  {dialog.type === 'agrupacion' ? 'Gestión de Agrupación' : `Editar ${dialog.type}`}
                </DialogTitle>
                <DialogDescription className="text-xs uppercase font-bold text-slate-400">
                  {dialog.type === 'agrupacion' ? 'Configura la agrupación de múltiples clases.' : 'Configura los parámetros de la actividad.'}
                </DialogDescription>
              </div>
            </div>
            {dialog.type === 'ejercicio' && (
              <Button variant="outline" className="rounded-xl font-black uppercase text-[10px] tracking-widest gap-2" onClick={() => setPreviewActivity(dialog.data)}>
                <Eye size={14} /> Ver como Alumno
              </Button>
            )}
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar space-y-8">
            {isGroupMode && dialog.type !== 'agrupacion' && (
              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-indigo-900 uppercase">Sincronizar a toda la Agrupación</h4>
                  <p className="text-xs text-indigo-700/70 font-medium mt-1">Este contenido se replicará en todos los grupos de la agrupación.</p>
                </div>
                <Switch 
                  checked={dialog.data.syncToAll !== false} 
                  onCheckedChange={(c) => setDialog({...dialog, data: {...dialog.data, syncToAll: c}})} 
                />
              </div>
            )}

            {dialog.type === 'agrupacion' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Nombre de la Agrupación *</label>
                  <Input placeholder="Ej. Prepa 2do Semestre Todos" className="h-12 rounded-xl uppercase font-bold" value={dialog.data.nombre || ''} onChange={e => setDialog({...dialog, data: {...dialog.data, nombre: e.target.value}})} />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Seleccionar Grupos</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {asignaciones.map(asig => (
                      <div key={asig.id} className="flex items-center space-x-3 p-3 border rounded-xl hover:bg-slate-50 cursor-pointer" onClick={() => {
                        const ids = dialog.data.asignaciones_ids || [];
                        if (ids.includes(asig.id)) {
                          setDialog({...dialog, data: {...dialog.data, asignaciones_ids: ids.filter((id: string) => id !== asig.id)}});
                        } else {
                          setDialog({...dialog, data: {...dialog.data, asignaciones_ids: [...ids, asig.id]}});
                        }
                      }}>
                        <div className={cn("w-5 h-5 rounded border flex items-center justify-center", (dialog.data.asignaciones_ids || []).includes(asig.id) ? "bg-primary border-primary text-white" : "border-slate-300")}>
                          {(dialog.data.asignaciones_ids || []).includes(asig.id) && <CheckCircle size={14} />}
                        </div>
                        <div>
                          <p className="font-bold text-sm uppercase">{asig.materias?.nombre}</p>
                          <p className="text-[10px] text-muted-foreground uppercase">{asig.niveles?.nombre} • {asig.grupos?.nombre}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {dialog.type !== 'agrupacion' && (
              <>
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
                  onChange={e => setDialog({...dialog, data: {...dialog.data, fecha_entrega: e.target.value ? e.target.value + 'T23:59:59' : ''}})}
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

            {dialog.type === 'tema' && (
              <div className="space-y-6 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-primary tracking-[0.2em] flex items-center gap-2"><Youtube size={14} /> Videos del Tema</label>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 rounded-lg font-black uppercase text-[9px] gap-2 border-primary/20 text-primary hover:bg-primary/5"
                    onClick={() => {
                      const currentVideos = Array.isArray(dialog.data.videos) ? dialog.data.videos : [];
                      setDialog({...dialog, data: {...dialog.data, videos: [...currentVideos, { titulo: '', url: '', descripcion: '' }]}});
                    }}
                  >
                    <PlusCircle size={14} /> Agregar Video
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {(!dialog.data.videos || dialog.data.videos.length === 0) ? (
                    <div className="bg-slate-50 rounded-2xl p-6 text-center border-2 border-dashed border-slate-200 flex flex-col items-center gap-2">
                      <Video className="text-slate-300" size={24} />
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No hay videos vinculados a este tema.</p>
                    </div>
                  ) : (
                    dialog.data.videos.map((vid: any, idx: number) => (
                      <div key={idx} className="p-5 rounded-2xl border-2 border-slate-100 bg-white shadow-sm space-y-4 relative group/vid">
                        <button 
                          className="absolute top-4 right-4 h-8 w-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center opacity-0 group-hover/vid:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                          onClick={() => {
                            const newVideos = [...dialog.data.videos];
                            newVideos.splice(idx, 1);
                            setDialog({...dialog, data: {...dialog.data, videos: newVideos}});
                          }}
                        >
                          <Trash2 size={14} />
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mr-8">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Título del Video</label>
                            <Input 
                              placeholder="Ej: Clase de Introducción" 
                              className="h-10 rounded-xl text-xs font-bold" 
                              value={vid.titulo || ''} 
                              onChange={e => {
                                const newVideos = [...dialog.data.videos];
                                newVideos[idx].titulo = e.target.value;
                                setDialog({...dialog, data: {...dialog.data, videos: newVideos}});
                              }} 
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">URL (YouTube / Vimeo)</label>
                            <div className="relative">
                              <Input 
                                placeholder="https://youtube.com/watch?v=..." 
                                className="h-10 rounded-xl text-xs pl-9" 
                                value={vid.url || ''} 
                                onChange={e => {
                                  const newVideos = [...dialog.data.videos];
                                  newVideos[idx].url = e.target.value;
                                  setDialog({...dialog, data: {...dialog.data, videos: newVideos}});
                                }} 
                              />
                              <ExternalLink className="absolute left-3 top-3 text-slate-300" size={14} />
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Descripción del Video (Opcional)</label>
                          <Input 
                            placeholder="Breve explicación de lo que el alumno verá en este video..." 
                            className="h-10 rounded-xl text-xs italic" 
                            value={vid.descripcion || ''} 
                            onChange={e => {
                              const newVideos = [...dialog.data.videos];
                              newVideos[idx].descripcion = e.target.value;
                              setDialog({...dialog, data: {...dialog.data, videos: newVideos}});
                            }} 
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

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
                <TemplateEditor type={dialog.data.tipo} content={dialog.data.contenido || {}} updateContent={(newContent) => setDialog({ ...dialog, data: { ...dialog.data, contenido: newContent } })} pagoIA={pagoIA} />
              </div>
            )}
              </>
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

      {/* DIALOGO DE DIAPOSITIVAS - EDITOR CANVAS */}
      <Dialog open={slideDialogOpen} onOpenChange={setSlideDialogOpen}>
        <DialogContent className="max-w-[95vw] w-[1400px] h-[92vh] flex flex-col p-0 rounded-3xl overflow-hidden shadow-2xl border-none">
          <DialogHeader className="p-5 bg-slate-900 border-b border-white/5 flex flex-row justify-between items-center space-y-0 shrink-0">
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-3">
                <Presentation className="text-blue-400" /> Diseño de Clase: {selectedTema?.titulo}
              </DialogTitle>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="rounded-xl font-bold bg-white/5 border-white/10 hover:bg-white/10 hover:text-white text-white shadow-sm h-11 px-4 gap-2" onClick={() => exportSlidesToPptx(slides, selectedTema?.titulo || 'Clase', inst?.logo_url)} disabled={slides.length === 0}>
                <Download size={18} /> PPTX
              </Button>
              <Button variant="default" className="bg-blue-600 hover:bg-blue-700 rounded-xl font-black uppercase tracking-widest gap-2 shadow-lg h-11 px-6" onClick={() => setPresentationMode(true)} disabled={slides.length === 0}>
                <Play size={18} fill="currentColor" /> Presentar
              </Button>
              <Button variant="ghost" className="rounded-xl font-bold text-white hover:bg-white/5 h-11 px-6 border border-white/10" onClick={() => setSlideDialogOpen(false)}>Cerrar</Button>
            </div>
          </DialogHeader>
          <div className="flex-1 flex overflow-hidden bg-slate-950">
            {/* Sidebar de miniaturas */}
            <aside className="w-64 bg-slate-900 border-r border-white/5 flex flex-col shrink-0">
              <div className="p-3 border-b border-white/5 space-y-2">
                <Button className="w-full gap-2 rounded-xl bg-blue-600 font-black uppercase text-[10px] tracking-widest h-11" onClick={handleAddSlide}><Plus size={16} /> Nueva Diapositiva</Button>
                {pagoIA && (
                  <Button variant="outline" className="w-full gap-2 rounded-xl bg-purple-900/20 border-purple-500/30 text-purple-300 font-black uppercase text-[10px] tracking-widest h-11 hover:bg-purple-900/40" onClick={() => setAiDialogOpen(true)}>
                    <BrainCircuit size={16} /> Generar Diapositivas (IA)
                  </Button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                {slides.map((s, idx) => (
                  <div
                    key={s.id}
                    onClick={() => setActiveSlideIndex(idx)}
                    className={cn(
                      "p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-2 relative group",
                      activeSlideIndex === idx ? "bg-blue-600/10 border-blue-500" : "border-transparent hover:bg-white/5"
                    )}
                  >
                    <span className="text-[10px] font-black text-slate-500 w-5 text-center shrink-0">{idx + 1}</span>
                    <p className={cn("text-[10px] font-bold uppercase truncate flex-1", activeSlideIndex === idx ? "text-blue-400" : "text-slate-400")}>
                      {s.titulo || 'Sin Título'}
                    </p>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <button
                        disabled={idx === 0}
                        className="h-6 w-6 rounded-md hover:bg-white/10 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center transition-all"
                        onClick={(e) => { e.stopPropagation(); handleMoveSlide(idx, 'up'); }}
                        title="Mover arriba"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        disabled={idx === slides.length - 1}
                        className="h-6 w-6 rounded-md hover:bg-white/10 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center transition-all"
                        onClick={(e) => { e.stopPropagation(); handleMoveSlide(idx, 'down'); }}
                        title="Mover abajo"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        className="h-6 w-6 rounded-md hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-all ml-1"
                        onClick={(e) => { e.stopPropagation(); handleDeleteSlide(s.id); }}
                        title="Eliminar diapositiva"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            {/* Panel Principal - Editor Canvas */}
            <main className="flex-1 bg-slate-950 overflow-y-auto custom-scrollbar">
              {slides.length > 0 && slides[activeSlideIndex] ? (
                <div className="p-6 space-y-6">
                  {/* Selector de Plantillas */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] flex items-center gap-2">
                      <Palette size={14} /> Plantilla Visual
                    </label>
                    <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                      {Object.values(SLIDE_TEMPLATES).map((tmpl) => (
                        <button
                          key={tmpl.id}
                          onClick={() => handleUpdateSlide(slides[activeSlideIndex].id, { estilo: tmpl.id })}
                          className={cn(
                            "flex-shrink-0 w-40 rounded-xl border-2 overflow-hidden transition-all",
                            slides[activeSlideIndex].estilo === tmpl.id
                              ? "border-blue-500 scale-105 shadow-lg shadow-blue-500/20"
                              : "border-white/10 opacity-60 hover:opacity-100"
                          )}
                        >
                          <div className="aspect-video relative">
                            <tmpl.component className="">
                              <div className="w-full h-full" />
                            </tmpl.component>
                          </div>
                          <div className="p-2 bg-slate-900 text-center">
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">{tmpl.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Editor Canvas Drag & Drop */}
                  <SlideCanvasEditor
                    templateId={slides[activeSlideIndex]?.estilo || 'azul'}
                    canvasData={parseSlideContent(slides[activeSlideIndex]?.contenido)}
                    titulo={slides[activeSlideIndex]?.titulo || ''}
                    onTituloChange={(titulo) => handleUpdateSlide(slides[activeSlideIndex].id, { titulo })}
                    onChange={(data) => handleUpdateSlide(slides[activeSlideIndex].id, { contenido: serializeSlideContent(data) })}
                    onImageUpload={handleSlideImageUpload}
                    onImageDelete={handleSlideImageDelete}
                    onApplyGlobalStyles={handleApplyGlobalStyles}
                  />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-20">
                  <Presentation size={80} className="mb-4 text-white" />
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Crea tu primera diapositiva</p>
                </div>
              )}
            </main>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE GENERADOR IA - Nueva UI con Preview en vivo */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-[92vw] w-[1100px] max-h-[92vh] rounded-[28px] p-0 border-none shadow-2xl overflow-hidden bg-slate-950 flex flex-col">
          {/* Header */}
          <DialogHeader className="p-5 bg-purple-950/60 border-b border-purple-500/20 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-600/30 text-purple-300 rounded-xl">
                <Wand2 size={22} />
              </div>
              <div>
                <DialogTitle className="text-lg font-black uppercase tracking-tight text-white">Generador IA de Diapositivas</DialogTitle>
                <DialogDescription className="text-purple-300 text-[10px] font-bold tracking-widest uppercase">
                  Elige plantilla y configura · la IA ajusta el texto automáticamente
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Body — dos columnas */}
          <div className="flex flex-1 overflow-hidden min-h-0">

            {/* ── Columna izquierda: Formulario ── */}
            <div className="w-[420px] shrink-0 flex flex-col overflow-y-auto custom-scrollbar bg-slate-900 border-r border-white/5">
              <div className="p-5 space-y-5">

                {/* Tema */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tema Principal *</label>
                  <Input
                    value={aiTema}
                    onChange={(e) => setAiTema(e.target.value)}
                    placeholder="Ej. La Revolución Mexicana..."
                    className="bg-slate-800 border-slate-700 text-white font-bold h-11"
                    disabled={isGeneratingAI}
                  />
                </div>

                {/* Nº Diapositivas */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Nº Diapositivas
                    <span className="ml-2 text-purple-400 normal-case font-semibold">
                      (la IA limita el texto según este número)
                    </span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min={3} max={20}
                      value={aiNumSlides}
                      onChange={(e) => setAiNumSlides(parseInt(e.target.value))}
                      disabled={isGeneratingAI}
                      className="flex-1 accent-purple-500"
                    />
                    <span className="w-10 text-center font-black text-white text-xl bg-slate-800 rounded-xl py-1">{aiNumSlides}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">
                    {aiNumSlides <= 4 ? '📝 Pocas diapositivas → más texto por slide' : aiNumSlides <= 8 ? '⚖️ Balance ideal de texto y slides' : '✂️ Muchas diapositivas → texto conciso por slide'}
                  </p>
                </div>

                {/* Selector de Plantilla con Cards */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Plantilla Visual</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.values(SLIDE_TEMPLATES).map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        disabled={isGeneratingAI}
                        onClick={() => setAiEstilo(tmpl.id)}
                        className={cn(
                          "relative rounded-xl overflow-hidden border-2 transition-all text-left",
                          aiEstilo === tmpl.id
                            ? "border-purple-500 shadow-lg shadow-purple-500/30 scale-[1.02]"
                            : "border-white/10 opacity-70 hover:opacity-100 hover:border-white/30"
                        )}
                      >
                        {/* Thumbnail */}
                        <div className="aspect-video w-full overflow-hidden bg-slate-800">
                          {tmpl.previewSrc ? (
                            <img
                              src={tmpl.previewSrc}
                              alt={tmpl.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <tmpl.component>
                              <div className="w-full h-full" />
                            </tmpl.component>
                          )}
                        </div>
                        {/* Nombre */}
                        <div className={cn("px-2 py-1.5 text-center", aiEstilo === tmpl.id ? "bg-purple-700" : "bg-slate-800")}>
                          <span className="text-[9px] font-black uppercase tracking-wider text-white">{tmpl.name}</span>
                        </div>
                        {/* Checkmark */}
                        {aiEstilo === tmpl.id && (
                          <div className="absolute top-1.5 right-1.5 bg-purple-500 rounded-full w-5 h-5 flex items-center justify-center">
                            <svg viewBox="0 0 12 12" className="w-3 h-3 text-white fill-current"><path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Instrucciones extra */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Instrucciones Extra (Opcional)</label>
                  <textarea
                    rows={3}
                    value={aiInstrucciones}
                    onChange={(e) => setAiInstrucciones(e.target.value)}
                    placeholder="Ej. Usa lenguaje para secundaria, enfócate en las causas..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none custom-scrollbar"
                    disabled={isGeneratingAI}
                  />
                </div>
              </div>

              {/* Footer del formulario */}
              <div className="mt-auto p-5 border-t border-white/5 flex gap-3">
                <Button
                  variant="ghost"
                  className="text-slate-400 hover:text-white uppercase font-bold text-[10px] flex-1"
                  onClick={() => setAiDialogOpen(false)}
                  disabled={isGeneratingAI}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-[2] bg-purple-600 hover:bg-purple-700 text-white font-black uppercase tracking-widest rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.5)] gap-2"
                  onClick={handleGenerateAI}
                  disabled={isGeneratingAI}
                >
                  {isGeneratingAI ? <Loader2 className="animate-spin" size={18} /> : <BrainCircuit size={18} />}
                  {isGeneratingAI ? 'Generando...' : 'Generar Presentación'}
                </Button>
              </div>
            </div>

            {/* ── Columna derecha: Preview en vivo ── */}
            <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
              {/* Título del panel */}
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Vista Previa de Plantilla</span>
                <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full">
                  {SLIDE_TEMPLATES[aiEstilo]?.name || '—'}
                </span>
              </div>

              {/* Área de preview */}
              <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
                <div className="w-full max-w-[640px]">
                  {/* Pantalla de slide con aspect-ratio 16:9 */}
                  <div
                    className="relative w-full rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(168,85,247,0.2)] border border-white/10"
                    style={{ paddingTop: '56.25%' }}
                  >
                    <div className="absolute inset-0">
                      {(() => {
                        const tmpl = SLIDE_TEMPLATES[aiEstilo];
                        if (!tmpl) return null;
                        const TemplateComp = tmpl.component;
                        return (
                          <TemplateComp>
                            {/* Simulación de contenido de diapositiva */}
                            <div
                              className="absolute"
                              style={{ left: '5%', top: '8%', width: '90%', height: '15%', display: 'flex', alignItems: 'center' }}
                            >
                              <span
                                className="font-black text-[1.8vw] leading-tight truncate"
                                style={{ color: tmpl.titleColor, fontFamily: tmpl.fontFamily }}
                              >
                                {aiTema || 'Título de la Presentación'}
                              </span>
                            </div>
                            <div
                              className="absolute"
                              style={{ left: '5%', top: '28%', width: '90%', height: '62%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: '4%' }}
                            >
                              {['• Punto principal del tema', '• Información relevante', '• Conclusión o dato clave'].slice(0, Math.min(3, Math.ceil(aiNumSlides / 2))).map((pt, i) => (
                                <span
                                  key={i}
                                  className="text-[1.2vw] font-semibold leading-snug"
                                  style={{ color: tmpl.contentColor, fontFamily: tmpl.fontFamily, opacity: 1 - i * 0.15 }}
                                >
                                  {pt}
                                </span>
                              ))}
                            </div>
                          </TemplateComp>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Info de la plantilla */}
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="bg-slate-900 rounded-xl p-3 border border-white/5 text-center">
                      <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider mb-1">Fuente IA</p>
                      <p className="text-xs font-bold text-white">{SLIDE_TEMPLATES[aiEstilo]?.fontFamily || '—'}</p>
                    </div>
                    <div className="bg-slate-900 rounded-xl p-3 border border-white/5 text-center">
                      <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider mb-1">Color Título</p>
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: SLIDE_TEMPLATES[aiEstilo]?.titleColor }} />
                        <span className="text-[10px] font-mono text-white">{SLIDE_TEMPLATES[aiEstilo]?.titleColor}</span>
                      </div>
                    </div>
                    <div className="bg-slate-900 rounded-xl p-3 border border-white/5 text-center">
                      <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider mb-1">Color Texto</p>
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: SLIDE_TEMPLATES[aiEstilo]?.contentColor }} />
                        <span className="text-[10px] font-mono text-white">{SLIDE_TEMPLATES[aiEstilo]?.contentColor}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-center text-[10px] text-slate-600 mt-3 font-medium">
                    La IA usará estos colores y fuentes automáticamente en todas las diapositivas.
                  </p>
                </div>
              </div>
            </div>
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
              Estás a punto de borrar el/la {deleteConfirmTarget?.type === 'unidad' ? 'unidad' : (deleteConfirmTarget?.type === 'tema' ? 'tema' : 'actividad')}: 
              <span className="font-black text-slate-900 block my-3 text-xl italic underline decoration-destructive/30">"{deleteConfirmTarget?.title}"</span>
              Esta acción eliminará <span className="text-destructive font-black underline">TODO</span> {deleteConfirmTarget?.type === 'ejercicio' ? 'el contenido de esta actividad' : 'el contenido relacionado (temas, ejercicios, presentaciones y recursos)'} y <span className="font-black text-slate-900">no se puede deshacer.</span>
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
