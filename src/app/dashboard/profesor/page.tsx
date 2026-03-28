
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
  EyeOff
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import confetti from 'canvas-confetti';

const LOGO_URL = '/images/logo_zapata.png';

// --- LOGICA DE GENERACIÓN DE CRUCIGRAMAS ---
const GRID_SIZE = 50;
const CENTER = 25;

type Direction = 'HORIZONTAL' | 'VERTICAL';

interface WordInput {
  id: string;
  word: string;
  clue: string;
}

interface PlacedWord extends WordInput {
  x: number;
  y: number;
  direction: Direction;
  number: number;
}

interface CrosswordData {
  placedWords: PlacedWord[];
  unplacedWords: WordInput[];
  width: number;
  height: number;
  minX: number;
  minY: number;
}

class CrosswordBuilder {
  grid: string[][];
  placedWords: PlacedWord[] = [];
  unplacedWords: WordInput[] = [];

  constructor() {
    this.grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(''));
  }

  canPlaceWord(word: string, startX: number, startY: number, dir: Direction): boolean {
    if (startX < 0 || startY < 0) return false;
    if (dir === 'HORIZONTAL' && startX + word.length > GRID_SIZE) return false;
    if (dir === 'VERTICAL' && startY + word.length > GRID_SIZE) return false;

    if (dir === 'HORIZONTAL') {
      if (startX > 0 && this.grid[startY][startX - 1] !== '') return false;
      if (startX + word.length < GRID_SIZE && this.grid[startY][startX + word.length] !== '') return false;
    } else {
      if (startY > 0 && this.grid[startY - 1][startX] !== '') return false;
      if (startY + word.length < GRID_SIZE && this.grid[startY + word.length][startX] !== '') return false;
    }

    for (let i = 0; i < word.length; i++) {
      const px = dir === 'HORIZONTAL' ? startX + i : startX;
      const py = dir === 'VERTICAL' ? startY + i : startY;

      if (this.grid[py][px] !== '') {
        if (this.grid[py][px] !== word[i]) return false;
      } else {
        if (dir === 'HORIZONTAL') {
          if (py > 0 && this.grid[py - 1][px] !== '' && (this.grid[py - 1][px] !== undefined)) {
             // Solo permitir si es parte de una intersección válida, pero simplificamos
             if (!(i === 0 || i === word.length - 1)) { /* check neighbors */ }
          }
          if (py > 0 && this.grid[py - 1][px] !== '') return false;
          if (py < GRID_SIZE - 1 && this.grid[py + 1][px] !== '') return false;
        } else {
          if (px > 0 && this.grid[py][px - 1] !== '') return false;
          if (px < GRID_SIZE - 1 && this.grid[py][px + 1] !== '') return false;
        }
      }
    }
    return true;
  }

  placeWord(wordInput: WordInput, x: number, y: number, direction: Direction) {
    const word = wordInput.word.toUpperCase();
    for (let i = 0; i < word.length; i++) {
      const px = direction === 'HORIZONTAL' ? x + i : x;
      const py = direction === 'VERTICAL' ? y + i : y;
      this.grid[py][px] = word[i];
    }
    this.placedWords.push({
      ...wordInput,
      x,
      y,
      direction,
      number: 0
    });
  }

  build(inputs: WordInput[]) {
    for (const input of inputs) {
      const word = input.word.toUpperCase();
      if (this.placedWords.length === 0) {
        this.placeWord(input, CENTER - Math.floor(word.length / 2), CENTER, 'HORIZONTAL');
        continue;
      }

      let bestPlacement = null;
      let maxIntersections = -1;

      for (const placed of this.placedWords) {
        const pStr = placed.word.toUpperCase();
        for (let i = 0; i < word.length; i++) {
          for (let j = 0; j < pStr.length; j++) {
            if (word[i] === pStr[j]) {
              const dir: Direction = placed.direction === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL';
              const startX = dir === 'VERTICAL' ? placed.x + j : placed.x - i;
              const startY = dir === 'VERTICAL' ? placed.y - i : placed.y + j;

              if (this.canPlaceWord(word, startX, startY, dir)) {
                let intersections = 0;
                for (let k = 0; k < word.length; k++) {
                  const px = dir === 'HORIZONTAL' ? startX + k : startX;
                  const py = dir === 'VERTICAL' ? startY + k : startY;
                  if (this.grid[py][px] !== '') intersections++;
                }
                if (intersections > maxIntersections) {
                  maxIntersections = intersections;
                  bestPlacement = { x: startX, y: startY, dir };
                }
              }
            }
          }
        }
      }

      if (bestPlacement) {
        this.placeWord(input, bestPlacement.x, bestPlacement.y, bestPlacement.dir);
      } else {
        this.unplacedWords.push(input);
      }
    }
  }

  assignNumbers() {
    this.placedWords.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
    let current = 1;
    const cellMap = new Map<string, number>();
    for (const pw of this.placedWords) {
      const key = `${pw.x},${pw.y}`;
      if (!cellMap.has(key)) cellMap.set(key, current++);
      pw.number = cellMap.get(key)!;
    }
  }

  getBounds() {
    if (this.placedWords.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = GRID_SIZE, minY = GRID_SIZE, maxX = 0, maxY = 0;
    for (const pw of this.placedWords) {
      minX = Math.min(minX, pw.x);
      minY = Math.min(minY, pw.y);
      if (pw.direction === 'HORIZONTAL') {
        maxX = Math.max(maxX, pw.x + pw.word.length - 1);
        maxY = Math.max(maxY, pw.y);
      } else {
        maxX = Math.max(maxX, pw.x);
        maxY = Math.max(maxY, pw.y + pw.word.length - 1);
      }
    }
    return { minX, minY, maxX, maxY };
  }
}

function generateCrossword(inputs: WordInput[]): CrosswordData {
  const clean = inputs.map(i => ({ ...i, word: i.word.replace(/[^A-Za-zñÑ]/g, '').toUpperCase() })).filter(i => i.word.length > 1);
  let bestBuilder = null;

  for (let i = 0; i < 20; i++) {
    const builder = new CrosswordBuilder();
    const shuffled = [...clean].sort(() => Math.random() - 0.5);
    builder.build(shuffled);
    if (!bestBuilder || builder.placedWords.length > bestBuilder.placedWords.length) {
      bestBuilder = builder;
    }
    if (bestBuilder.placedWords.length === clean.length) break;
  }

  if (!bestBuilder) return { placedWords: [], unplacedWords: clean, width: 0, height: 0, minX: 0, minY: 0 };
  bestBuilder.assignNumbers();
  const b = bestBuilder.getBounds();
  return {
    placedWords: bestBuilder.placedWords,
    unplacedWords: bestBuilder.unplacedWords,
    width: b.maxX - b.minX + 1,
    height: b.maxY - b.minY + 1,
    minX: b.minX,
    minY: b.minY
  };
}

// --- CONFIGURACIÓN DE PLANTILLAS ---
const ACTIVITY_TEMPLATES = [
  { id: 'crucigrama', label: 'Crucigrama', icon: <Grid3X3 size={16} />, color: 'bg-rose-600' },
  { id: 'actividad_descriptiva', label: 'Actividad Descriptiva', icon: <FileSearch size={16} />, color: 'bg-slate-700' },
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
    case 'crucigrama': return { words: [''], clues: [''], showWordList: false };
    case 'actividad_descriptiva': return { fileUrl: '', fileName: '' };
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 px-4 text-[10px] font-black uppercase text-slate-400">
          <span>Concepto (Izq)</span>
          <span>Definición (Der)</span>
        </div>
        {content.items?.map((item: any, idx: number) => (
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
          const newItems = content.items ? [...content.items] : [];
          updateContent({ ...content, items: [...newItems, { left: '', right: '' }] });
        }}>+ Añadir Par</Button>
      </div>
    );
  }

  if (type === 'ordenar_secuencia') {
    return (
      <div className="space-y-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase italic">Ingresa los pasos en el orden correcto.</p>
        {content.items?.map((item: string, idx: number) => (
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
          const newItems = content.items ? [...content.items] : [];
          updateContent({ ...content, items: [...newItems, ''] });
        }}>+ Añadir Paso</Button>
      </div>
    );
  }

  if (type === 'completar_espacios') {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-[11px] text-amber-800 leading-relaxed">
          <strong>Instrucciones:</strong> Escribe tu texto y encierra entre corchetes dobles <code>[[ ]]</code> las palabras a completar.
        </div>
        <textarea 
          rows={8} 
          className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:ring-primary/20 outline-none" 
          placeholder="La célula es la [[unidad básica]] de los seres vivos." 
          value={content.text || ''} 
          onChange={(e) => updateContent({ ...content, text: e.target.value })} 
        />
      </div>
    );
  }

  if (type === 'flashcards') {
    return (
      <div className="space-y-6">
        {content.items?.map((item: any, idx: number) => (
          <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 relative group">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-slate-400">Frente (Término)</label>
              <textarea 
                rows={3} 
                className="w-full p-3 rounded-xl border-slate-200 text-sm outline-none" 
                value={item.front} 
                onChange={(e) => {
                  const newItems = [...content.items];
                  newItems[idx].front = e.target.value;
                  updateContent({ ...content, items: newItems });
                }} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-slate-400">Reverso (Definición)</label>
              <textarea 
                rows={3} 
                className="w-full p-3 rounded-xl border-slate-200 text-sm outline-none" 
                value={item.back} 
                onChange={(e) => {
                  const newItems = [...content.items];
                  newItems[idx].back = e.target.value;
                  updateContent({ ...content, items: newItems });
                }} 
              />
            </div>
            <button className="absolute -top-2 -right-2 bg-white shadow-md rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity text-destructive" onClick={() => {
              const newItems = [...content.items];
              newItems.splice(idx, 1);
              updateContent({ ...content, items: newItems });
            }}><X size={16} /></button>
          </div>
        ))}
        <Button variant="outline" className="w-full text-xs font-black uppercase" onClick={() => {
          const newItems = content.items ? [...content.items] : [];
          updateContent({ ...content, items: [...newItems, { front: '', back: '' }] });
        }}>+ Nueva Tarjeta</Button>
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
                updateContent({ ...content, words: newWords });
              }} 
            />
            <Input 
              placeholder="PISTA" 
              value={content.clues?.[idx] || ''} 
              onChange={(e) => {
                const newClues = [...(content.clues || [])];
                newClues[idx] = e.target.value;
                updateContent({ ...content, clues: newClues });
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
const ActivityPreview = ({ exercise, onClose }: { exercise: any, onClose: () => void }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setSuccess] = useState(false);
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [shuffledItems, setShuffledItems] = useState<any[]>([]);
  const [sequenceItems, setSequenceItems] = useState<string[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<Record<string, string>>({});
  const [currentLeft, setCurrentLeft] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [fillAnswers, setFillAnswers] = useState<Record<number, string>>({});
  
  // Sopa de letras y Crucigrama state
  const [sopaGrid, setSopaGrid] = useState<string[][]>([]);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [selectedSopaCells, setSelectedSopaCells] = useState<{r: number, c: number}[]>([]);
  const [crossword, setCrossword] = useState<CrosswordData | null>(null);
  const [userInputs, setUserInputs] = useState<Record<string, string>>({});
  const [showSolution, setShowSolution] = useState(false);
  const [direction, setDirection] = useState<Direction>('HORIZONTAL');
  const [focusedCell, setFocusedCell] = useState<{ x: number; y: number } | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const content = useMemo(() => {
    return typeof exercise.contenido === 'string' ? JSON.parse(exercise.contenido || '{}') : exercise.contenido;
  }, [exercise]);

  // Generación de Sopa de Letras
  const generateSopaGrid = useCallback(() => {
    const size = content.size || 12;
    const grid = Array.from({ length: size }, () => Array(size).fill(''));
    const words = (content.words || []).filter((w: string) => w.length > 0);

    words.forEach((word: string) => {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 50) {
        const direction = Math.floor(Math.random() * 3);
        const row = Math.floor(Math.random() * size);
        const col = Math.floor(Math.random() * size);
        let canPlace = true;
        if (direction === 0 && col + word.length <= size) {
          for (let i = 0; i < word.length; i++) if (grid[row][col + i] !== '' && grid[row][col + i] !== word[i]) canPlace = false;
          if (canPlace) { for (let i = 0; i < word.length; i++) grid[row][col + i] = word[i]; placed = true; }
        } else if (direction === 1 && row + word.length <= size) {
          for (let i = 0; i < word.length; i++) if (grid[row + i][col] !== '' && grid[row + i][col] !== word[i]) canPlace = false;
          if (canPlace) { for (let i = 0; i < word.length; i++) grid[row + i][col] = word[i]; placed = true; }
        } else if (direction === 2 && row + word.length <= size && col + word.length <= size) {
          for (let i = 0; i < word.length; i++) if (grid[row + i][col + i] !== '' && grid[row + i][col + i] !== word[i]) canPlace = false;
          if (canPlace) { for (let i = 0; i < word.length; i++) grid[row + i][col + i] = word[i]; placed = true; }
        }
        attempts++;
      }
    });

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === '') grid[r][c] = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      }
    }
    setSopaGrid(grid);
  }, [content]);

  useEffect(() => {
    if (exercise.tipo === 'crucigrama') {
      const inputs = content.words.map((w: string, i: number) => ({
        id: i.toString(),
        word: w,
        clue: content.clues[i]
      })).filter((item: any) => item.word && item.clue);
      setCrossword(generateCrossword(inputs));
    } else if (exercise.tipo === 'opcion_multiple' || exercise.tipo === 'verdadero_falso' || exercise.tipo === 'flashcards') {
      if (content.items) setShuffledItems([...content.items].sort(() => Math.random() - 0.5));
    } else if (exercise.tipo === 'ordenar_secuencia' && content.items) {
      setSequenceItems([...content.items].sort(() => Math.random() - 0.5));
    } else if (exercise.tipo === 'sopa_letras') {
      generateSopaGrid();
    }
  }, [content, exercise.tipo, generateSopaGrid]);

  const handleNext = (isCorrect: boolean) => {
    if (isCorrect) setScore(s => s + 1);
    if (currentStep + 1 < (shuffledItems.length || 1)) {
      setCurrentStep(s => s + 1);
      setSelectedOption(null);
      setIsFlipped(false);
    } else {
      setSuccess(true);
    }
  };

  const handleSopaCellClick = (r: number, c: number) => {
    const alreadySelected = selectedSopaCells.some(cell => cell.r === r && cell.c === c);
    let newSelection = alreadySelected 
      ? selectedSopaCells.filter(cell => !(cell.r === r && cell.c === c))
      : [...selectedSopaCells, { r, c }];
    setSelectedSopaCells(newSelection);

    const selectedText = newSelection.map(cell => sopaGrid[cell.r][cell.c]).join('');
    const selectedTextRev = [...newSelection].reverse().map(cell => sopaGrid[cell.r][cell.c]).join('');
    const wordFound = (content.words || []).find((w: string) => 
      (w.toUpperCase() === selectedText || w.toUpperCase() === selectedTextRev) && !foundWords.includes(w)
    );

    if (wordFound) {
      const newFound = [...foundWords, wordFound];
      setFoundWords(newFound);
      setSelectedSopaCells([]);
      if (newFound.length === (content.words || []).filter((w:string)=>w.length>0).length) {
        setTimeout(() => setSuccess(true), 1000);
      }
    }
  };

  // Crucigrama logic
  const solvedCrosswordWords = useMemo(() => {
    if (!crossword) return new Set<string>();
    const solved = new Set<string>();
    crossword.placedWords.forEach(pw => {
      let isCorrect = true;
      for (let i = 0; i < pw.word.length; i++) {
        const cx = pw.direction === 'HORIZONTAL' ? pw.x - crossword.minX + i : pw.x - crossword.minX;
        const cy = pw.direction === 'VERTICAL' ? pw.y - crossword.minY + i : pw.y - crossword.minY;
        if (userInputs[`${cx}-${cy}`]?.toUpperCase() !== pw.word[i].toUpperCase()) { isCorrect = false; break; }
      }
      if (isCorrect) solved.add(pw.id);
    });
    return solved;
  }, [crossword, userInputs]);

  useEffect(() => {
    if (crossword && crossword.placedWords.length > 0 && solvedCrosswordWords.size === crossword.placedWords.length) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      setTimeout(() => setSuccess(true), 2000);
    }
  }, [solvedCrosswordWords, crossword]);

  const renderContent = () => {
    if (exercise.tipo === 'crucigrama' && crossword) {
      const grid = Array(crossword.height).fill(null).map(() => 
        Array(crossword.width).fill(null).map(() => ({ letter: '', isActive: false, number: null as number | null, ids: [] as string[] }))
      );
      crossword.placedWords.forEach(pw => {
        for (let i = 0; i < pw.word.length; i++) {
          const cx = pw.direction === 'HORIZONTAL' ? pw.x - crossword.minX + i : pw.x - crossword.minX;
          const cy = pw.direction === 'VERTICAL' ? pw.y - crossword.minY + i : pw.y - crossword.minY;
          grid[cy][cx].letter = pw.word[i];
          grid[cy][cx].isActive = true;
          grid[cy][cx].ids.push(pw.id);
          if (i === 0) grid[cy][cx].number = pw.number;
        }
      });

      return (
        <div className="w-full max-w-6xl mx-auto flex flex-col lg:flex-row gap-8 py-10">
          <div className="flex-[2] bg-white p-8 rounded-[40px] shadow-2xl border-2 border-slate-100 flex flex-col items-center">
            <div className="flex justify-between items-center w-full mb-8">
              <h3 className="text-2xl font-black text-slate-800 uppercase">Crucigrama</h3>
              <Button variant="ghost" onClick={() => setShowSolution(!showSolution)} className="text-indigo-600 gap-2 font-black uppercase text-xs">
                {showSolution ? <EyeOff size={16} /> : <Eye size={16} />} {showSolution ? 'Ocultar' : 'Ver Solución'}
              </Button>
            </div>
            <div className="grid gap-1 bg-slate-200 p-1 rounded-xl shadow-inner overflow-auto max-w-full" style={{ gridTemplateColumns: `repeat(${crossword.width}, minmax(0, 1fr))` }}>
              {grid.map((row, y) => row.map((cell, x) => (
                <div key={`${x}-${y}`} className={cn("aspect-square relative w-10 md:w-12 flex items-center justify-center font-black text-lg border transition-all", 
                  !cell.isActive ? "bg-slate-800/5 border-transparent" : "bg-white border-slate-300",
                  cell.ids.some(id => solvedCrosswordWords.has(id)) && "bg-emerald-50 text-emerald-600 border-emerald-300"
                )}>
                  {cell.isActive && (
                    <>
                      {cell.number && <span className="absolute top-0.5 left-1 text-[9px] text-slate-400">{cell.number}</span>}
                      {showSolution ? <span className="text-indigo-600">{cell.letter}</span> : (
                        <input 
                          ref={el => { inputRefs.current[`${x}-${y}`] = el; }}
                          maxLength={1}
                          className="w-full h-full text-center bg-transparent outline-none uppercase"
                          value={userInputs[`${x}-${y}`] || ''}
                          onChange={e => {
                            const val = e.target.value.toUpperCase();
                            setUserInputs(prev => ({ ...prev, [`${x}-${y}`]: val }));
                            if (val) {
                              const nextX = direction === 'HORIZONTAL' ? x + 1 : x;
                              const nextY = direction === 'VERTICAL' ? y + 1 : y;
                              if (grid[nextY]?.[nextX]?.isActive) inputRefs.current[`${nextX}-${nextY}`]?.focus();
                            }
                          }}
                          onFocus={() => {
                            setFocusedCell({ x, y });
                            const hasH = crossword.placedWords.some(pw => pw.direction === 'HORIZONTAL' && x >= pw.x - crossword.minX && x < pw.x - crossword.minX + pw.word.length && y === pw.y - crossword.minY);
                            const hasV = crossword.placedWords.some(pw => pw.direction === 'VERTICAL' && y >= pw.y - crossword.minY && y < pw.y - crossword.minY + pw.word.length && x === pw.x - crossword.minX);
                            if (hasH && !hasV) setDirection('HORIZONTAL');
                            else if (hasV && !hasH) setDirection('VERTICAL');
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Backspace' && !userInputs[`${x}-${y}`]) {
                              const prevX = direction === 'HORIZONTAL' ? x - 1 : x;
                              const prevY = direction === 'VERTICAL' ? y - 1 : y;
                              if (grid[prevY]?.[prevX]?.isActive) inputRefs.current[`${prevX}-${prevY}`]?.focus();
                            } else if (e.key.startsWith('Arrow')) {
                              e.preventDefault();
                              let nx = x, ny = y;
                              if (e.key === 'ArrowRight') nx++; if (e.key === 'ArrowLeft') nx--;
                              if (e.key === 'ArrowDown') ny++; if (e.key === 'ArrowUp') ny--;
                              if (grid[ny]?.[nx]?.isActive) inputRefs.current[`${nx}-${ny}`]?.focus();
                            }
                          }}
                        />
                      )}
                    </>
                  )}
                </div>
              )))}
            </div>
          </div>
          <div className="flex-1 space-y-6">
            <div className="bg-white p-8 rounded-[32px] border-2 border-slate-100 shadow-xl h-full overflow-y-auto max-h-[600px] custom-scrollbar">
              <h4 className="text-[10px] font-black uppercase text-indigo-600 tracking-widest mb-6 border-b pb-2">Pistas</h4>
              <div className="space-y-8">
                {['HORIZONTAL', 'VERTICAL'].map(dir => {
                  const clues = crossword.placedWords.filter(pw => pw.direction === dir).sort((a, b) => a.number - b.number);
                  return (
                    <div key={dir}>
                      <h5 className="text-xs font-black uppercase text-slate-400 mb-4">{dir === 'HORIZONTAL' ? 'Horizontales' : 'Verticales'}</h5>
                      <ul className="space-y-4">
                        {clues.map(pw => (
                          <li key={pw.id} className={cn("text-xs font-bold transition-all", solvedCrosswordWords.has(pw.id) ? "text-emerald-600 line-through opacity-50" : "text-slate-600")}>
                            <span className="inline-block w-6 h-6 rounded bg-slate-100 text-center leading-6 mr-2 text-[10px]">{pw.number}</span>
                            {pw.clue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (exercise.tipo === 'actividad_descriptiva') {
      return (
        <div className="space-y-8 text-center py-10">
          <div className="max-w-2xl mx-auto space-y-4">
            <h2 className="text-3xl font-black text-slate-800 uppercase">{exercise.titulo}</h2>
            <p className="text-lg text-slate-600 leading-relaxed">{exercise.descripcion || 'Sin descripción adicional.'}</p>
          </div>
          {content.fileUrl && (
            <div className="inline-block p-8 bg-blue-50 border-2 border-blue-100 rounded-[40px] space-y-4 shadow-xl">
              <div className="h-20 w-20 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto shadow-lg">
                <FileText size={40} />
              </div>
              <p className="font-black text-blue-800 uppercase tracking-widest text-sm">{content.fileName}</p>
              <a href={content.fileUrl} target="_blank" rel="noopener noreferrer" className="block px-8 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition-all uppercase tracking-widest shadow-lg">
                Descargar Guía de Trabajo
              </a>
            </div>
          )}
          <div className="pt-10">
            <Button onClick={onClose} className="rounded-2xl px-10 h-14 bg-slate-800 font-black uppercase tracking-widest">Finalizar Revisión</Button>
          </div>
        </div>
      );
    }

    if (exercise.tipo === 'opcion_multiple' && shuffledItems.length > 0) {
      const q = shuffledItems[currentStep];
      return (
        <div className="max-w-2xl mx-auto space-y-8 py-10">
          <div className="flex justify-between items-center px-4">
            <Badge className="bg-blue-600 text-white px-4 py-1">PREGUNTA {currentStep + 1} / {shuffledItems.length}</Badge>
            <span className="text-xs font-black text-slate-400">ACIERTOS: {score}</span>
          </div>
          <h3 className="text-2xl font-black text-slate-800 text-center uppercase">{q.question}</h3>
          <div className="grid grid-cols-1 gap-4">
            {q.options?.map((opt: any) => (
              <button key={opt.id} onClick={() => setSelectedOption(opt.id)} className={cn("p-6 rounded-3xl border-2 text-left font-bold transition-all", selectedOption === opt.id ? "bg-blue-600 border-blue-600 text-white shadow-xl scale-[1.02]" : "bg-white border-slate-100 hover:border-blue-200")}>
                {opt.text}
              </button>
            ))}
          </div>
          <Button disabled={!selectedOption} onClick={() => handleNext(selectedOption === q.correctId)} className="w-full h-16 rounded-3xl bg-blue-600 text-white font-black uppercase text-lg tracking-widest shadow-xl">Siguiente</Button>
        </div>
      );
    }

    if (exercise.tipo === 'verdadero_falso' && shuffledItems.length > 0) {
      const q = shuffledItems[currentStep];
      return (
        <div className="max-w-2xl mx-auto space-y-8 py-10">
          <div className="flex justify-between items-center px-4">
            <Badge className="bg-emerald-600 text-white px-4 py-1">AFIRMACIÓN {currentStep + 1} / {shuffledItems.length}</Badge>
            <span className="text-xs font-black text-slate-400">ACIERTOS: {score}</span>
          </div>
          <div className="bg-white p-10 rounded-[40px] border-2 border-slate-100 shadow-xl text-center">
            <h3 className="text-2xl font-black text-slate-800 uppercase leading-relaxed">{q.statement}</h3>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <button onClick={() => setSelectedOption(true)} className={cn("p-8 rounded-[32px] border-2 font-black uppercase text-xl transition-all", selectedOption === true ? "bg-emerald-600 border-emerald-600 text-white shadow-xl scale-[1.05]" : "bg-white border-slate-100 hover:border-emerald-200 text-emerald-600")}>VERDADERO</button>
            <button onClick={() => setSelectedOption(false)} className={cn("p-8 rounded-[32px] border-2 font-black uppercase text-xl transition-all", selectedOption === false ? "bg-red-600 border-red-600 text-white shadow-xl scale-[1.05]" : "bg-white border-slate-100 hover:border-red-200 text-red-600")}>FALSO</button>
          </div>
          <Button disabled={selectedOption === null} onClick={() => handleNext(selectedOption === q.correct)} className="w-full h-16 rounded-[32px] bg-slate-800 text-white font-black uppercase text-lg tracking-widest shadow-xl">Confirmar Respuesta</Button>
        </div>
      );
    }

    if (exercise.tipo === 'emparejamiento' && content.items) {
      const leftItems = content.items.map((i: any) => i.left);
      const rightItems = [...content.items.map((i: any) => i.right)].sort(() => Math.random() - 0.5);
      const isComplete = Object.keys(matchedPairs).length === leftItems.length;
      const handleMatch = (right: string) => {
        if (!currentLeft) return;
        setMatchedPairs({ ...matchedPairs, [currentLeft]: right });
        setCurrentLeft(null);
      };

      return (
        <div className="max-w-4xl mx-auto space-y-8 py-10">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-black text-slate-800 uppercase">Relación de Columnas</h3>
            <p className="text-slate-500 font-bold uppercase text-xs">Selecciona un concepto de la izquierda y luego su definición a la derecha.</p>
          </div>
          <div className="grid grid-cols-2 gap-10">
            <div className="space-y-4">
              {leftItems.map((left: string, i: number) => (
                <button key={i} onClick={() => setCurrentLeft(left)} disabled={!!matchedPairs[left]} className={cn("w-full p-5 rounded-2xl border-2 text-left font-bold transition-all", matchedPairs[left] ? "bg-slate-100 border-slate-200 opacity-50" : currentLeft === left ? "border-purple-600 bg-purple-50 text-purple-700 ring-2 ring-purple-200 shadow-lg" : "bg-white border-slate-100 hover:border-purple-200")}>
                  {left}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              {rightItems.map((right: string, i: number) => {
                const matchedWith = Object.entries(matchedPairs).find(([l, r]) => r === right)?.[0];
                return (
                  <button key={i} onClick={() => handleMatch(right)} disabled={!currentLeft || !!matchedWith} className={cn("w-full p-5 rounded-2xl border-2 text-left font-bold transition-all h-full min-h-[60px]", matchedWith ? "bg-purple-600 border-purple-600 text-white shadow-md" : !currentLeft ? "bg-slate-50 border-transparent opacity-40" : "bg-white border-slate-100 hover:border-purple-400 shadow-sm")}>
                    {right}
                  </button>
                );
              })}
            </div>
          </div>
          {isComplete && (
            <Button onClick={() => setSuccess(true)} className="w-full h-16 rounded-[32px] bg-purple-600 text-white font-black uppercase text-lg tracking-widest shadow-xl">Finalizar Ejercicio</Button>
          )}
        </div>
      );
    }

    if (exercise.tipo === 'ordenar_secuencia' && sequenceItems.length > 0) {
      const move = (idx: number, dir: number) => {
        const newItems = [...sequenceItems];
        const targetIdx = idx + dir;
        if (targetIdx < 0 || targetIdx >= newItems.length) return;
        [newItems[idx], newItems[targetIdx]] = [newItems[targetIdx], newItems[idx]];
        setSequenceItems(newItems);
      };

      return (
        <div className="max-w-2xl mx-auto space-y-8 py-10">
          <div className="text-center">
            <h3 className="text-2xl font-black text-slate-800 uppercase">Ordenar Pasos</h3>
            <p className="text-xs font-bold text-slate-400 uppercase mt-2">Usa las flechas para organizar la secuencia correctamente.</p>
          </div>
          <div className="space-y-3">
            {sequenceItems.map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-5 bg-white border-2 border-slate-100 rounded-3xl shadow-sm group hover:border-orange-400 transition-colors">
                <span className="h-10 w-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-black">{i + 1}</span>
                <span className="flex-1 font-bold text-slate-700 uppercase text-sm">{item}</span>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-orange-50 text-orange-600" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={16} /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-orange-50 text-orange-600" onClick={() => move(i, 1)} disabled={i === sequenceItems.length - 1}><ArrowDown size={16} /></Button>
                </div>
              </div>
            ))}
          </div>
          <Button onClick={() => setSuccess(true)} className="w-full h-16 rounded-[32px] bg-orange-500 text-white font-black uppercase text-lg tracking-widest shadow-xl">Verificar Orden</Button>
        </div>
      );
    }

    if (exercise.tipo === 'completar_espacios' && content.text) {
      const parts = content.text.split(/\[\[(.*?)\]\]/);
      return (
        <div className="max-w-3xl mx-auto space-y-10 py-10">
          <div className="text-center">
            <h3 className="text-2xl font-black text-slate-800 uppercase">Completar el Texto</h3>
          </div>
          <div className="bg-white p-12 rounded-[40px] border-2 border-slate-100 shadow-xl leading-[3.5] text-lg font-medium text-slate-700">
            {parts.map((part: string, i: number) => (
              i % 2 === 0 ? <span key={i}>{part}</span> : (
                <input key={i} type="text" value={fillAnswers[i] || ''} onChange={(e) => setFillAnswers({ ...fillAnswers, [i]: e.target.value })} className="inline-block border-b-4 border-pink-300 focus:border-pink-500 outline-none px-4 min-w-[150px] text-center font-black text-pink-600 bg-pink-50/30 rounded-t-lg transition-all mx-2" placeholder="..." />
              )
            ))}
          </div>
          <Button onClick={() => setSuccess(true)} className="w-full h-16 rounded-[32px] bg-pink-500 text-white font-black uppercase text-lg tracking-widest shadow-xl">Enviar Respuestas</Button>
        </div>
      );
    }

    if (exercise.tipo === 'flashcards' && shuffledItems.length > 0) {
      const card = shuffledItems[currentStep];
      return (
        <div className="max-w-2xl mx-auto space-y-8 py-10">
          <div className="flex justify-between items-center px-4">
            <Badge className="bg-amber-500 text-white px-4 py-1">TARJETA {currentStep + 1} / {shuffledItems.length}</Badge>
          </div>
          <div className="perspective-1000 h-[400px]">
            <div onClick={() => setIsFlipped(!isFlipped)} className={cn("relative w-full h-full transition-all duration-500 transform-style-3d cursor-pointer", isFlipped && "rotate-y-180")}>
              <div className="absolute inset-0 w-full h-full backface-hidden bg-white border-4 border-amber-100 rounded-[50px] flex flex-col items-center justify-center p-10 text-center shadow-xl">
                <span className="text-[10px] font-black uppercase text-amber-400 tracking-[0.3em] mb-6">Término / Concepto</span>
                <h3 className="text-3xl font-black text-slate-800 uppercase leading-tight">{card.front}</h3>
                <p className="mt-10 text-[10px] font-black text-slate-300 uppercase animate-pulse">Haz clic para voltear</p>
              </div>
              <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 bg-amber-500 border-4 border-amber-400 rounded-[50px] flex flex-col items-center justify-center p-10 text-center shadow-xl text-white">
                <span className="text-[10px] font-black uppercase text-amber-200 tracking-[0.3em] mb-6">Definición / Respuesta</span>
                <p className="text-2xl font-bold leading-relaxed">{card.back}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <Button onClick={() => handleNext(true)} className="flex-1 h-16 rounded-[32px] bg-emerald-600 text-white font-black uppercase text-lg tracking-widest shadow-xl">Lo sé</Button>
            <Button onClick={() => handleNext(false)} className="flex-1 h-16 rounded-[32px] bg-slate-800 text-white font-black uppercase text-lg tracking-widest shadow-xl">Repasar</Button>
          </div>
        </div>
      );
    }

    if (exercise.tipo === 'sopa_letras' && sopaGrid.length > 0) {
      return (
        <div className="max-w-6xl mx-auto space-y-10 py-10">
          <div className="text-center">
            <h3 className="text-3xl font-black text-slate-800 uppercase">Sopa de Letras</h3>
            <p className="text-slate-500 font-bold uppercase text-xs mt-2">Encuentra las siguientes palabras ocultas en la cuadrícula.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-7 bg-white p-8 rounded-[40px] border-2 border-slate-100 shadow-2xl flex justify-center">
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${content.size || 12}, minmax(0, 1fr))` }}>
                {sopaGrid.map((row, r) => row.map((char, c) => {
                  const isSelected = selectedSopaCells.some(cell => cell.r === r && cell.c === c);
                  const isFound = foundWords.some(w => {
                    // Esta es una simplificación, en una sopa real necesitaríamos las coordenadas de las palabras encontradas
                    return false; 
                  });
                  return (
                    <button 
                      key={`${r}-${c}`} 
                      onClick={() => handleSopaCellClick(r, c)}
                      className={cn(
                        "h-8 w-8 md:h-10 md:w-10 rounded-lg flex items-center justify-center font-black text-sm transition-all",
                        isSelected ? "bg-indigo-600 text-white scale-110 shadow-lg" : "bg-slate-50 text-slate-400 hover:bg-indigo-100 hover:text-indigo-600"
                      )}
                    >
                      {char}
                    </button>
                  );
                }))}
              </div>
            </div>
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-indigo-50 p-8 rounded-[32px] border-2 border-indigo-100 shadow-sm">
                <h4 className="text-[10px] font-black uppercase text-indigo-600 tracking-widest mb-6">Lista de Palabras</h4>
                <div className="grid grid-cols-2 gap-4">
                  {(content.words || []).filter((w:string)=>w.length>0).map((w: string, i: number) => {
                    const isFound = foundWords.includes(w);
                    if (!content.showWordList && !isFound) {
                      return (
                        <div key={i} className="flex items-center gap-3 opacity-30">
                          <div className="h-2 w-2 rounded-full bg-slate-300" />
                          <span className="font-black text-slate-400 uppercase text-xs italic tracking-tighter">DESCONOCIDA</span>
                        </div>
                      );
                    }
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className={cn("h-2 w-2 rounded-full", isFound ? "bg-emerald-500" : "bg-indigo-300")} />
                        <span className={cn("font-black text-slate-700 uppercase text-sm", isFound && "line-through opacity-40 text-emerald-600")}>{w}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-slate-50 p-8 rounded-[32px] border-2 border-slate-100 shadow-sm">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6">Pistas</h4>
                <div className="space-y-4">
                  {(content.clues || []).filter((c:string)=>c.length>0).map((c: string, i: number) => (
                    <p key={i} className="text-xs font-bold text-slate-600 uppercase italic leading-relaxed border-l-4 border-indigo-200 pl-4">"{c}"</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return <div className="p-20 text-center opacity-20 italic">Vista previa no disponible.</div>;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col overflow-hidden animate-in fade-in duration-300">
      <header className="h-20 border-b flex items-center justify-between px-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-lg"><Eye size={24} /></div>
          <div>
            <h4 className="font-black text-slate-800 uppercase tracking-tight">Modo Previsualización: Estudiante</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Plataforma Emiliano Zapata</p>
          </div>
        </div>
        <Button variant="outline" className="rounded-xl border-slate-200 font-black uppercase text-[10px] tracking-widest h-12 px-6" onClick={onClose}>
          <X size={18} className="mr-2" /> Salir de la Vista Previa
        </Button>
      </header>
      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50">
        <div className="container mx-auto max-w-full px-6">
          {finished ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-center space-y-8">
              <div className="h-32 w-32 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-inner animate-bounce">
                <CheckCircle size={80} />
              </div>
              <div className="space-y-2">
                <h2 className="text-4xl font-black text-slate-800 uppercase">¡Ejercicio Completado!</h2>
                <p className="text-xl text-slate-500 font-bold uppercase">Simulación finalizada exitosamente.</p>
              </div>
              <Button onClick={onClose} className="rounded-3xl px-12 h-16 bg-emerald-600 text-white font-black uppercase text-lg tracking-widest shadow-2xl hover:scale-105 transition-transform">Volver al Panel</Button>
            </div>
          ) : renderContent()}
        </div>
      </main>
    </div>
  );
};

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
    
    if (!d.titulo || d.titulo.trim() === '') {
      toast({ variant: "destructive", title: "Campo requerido", description: "El título principal es obligatorio para guardar." });
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
      }
    } catch (e) { console.error(e); }
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
          <TabsList className="grid w-full grid-cols-4 h-14 bg-muted/50 rounded-2xl p-1 shadow-sm border mb-8">
            <TabsTrigger value="materias" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Mis Materias</TabsTrigger>
            <TabsTrigger value="unidades" disabled={!selectedMateria} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Unidades</TabsTrigger>
            <TabsTrigger value="temas" disabled={!selectedUnidad} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Temas</TabsTrigger>
            <TabsTrigger value="ejercicios" disabled={!selectedTema} className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase text-[10px] tracking-widest">Actividades</TabsTrigger>
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
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDialog({ open: true, type: 'unidad', data: u }); }}><Edit size={18}/></Button>
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
                 <Button size="lg" className="rounded-2xl bg-amber-500 text-white font-black uppercase tracking-widest gap-2" onClick={() => setDialog({ open: true, type: 'ejercicio', data: { titulo: '', tipo: 'crucigrama', contenido: initActivityContent('crucigrama'), orden: ejercicios.length + 1 } })}><Plus size={18} /> Nueva Actividad</Button>
               </CardHeader>
               <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                 <Table>
                   <TableHeader className="bg-slate-50/50"><TableRow><TableHead className="font-black uppercase text-[10px]">Orden</TableHead><TableHead className="font-black uppercase text-[10px]">Actividad</TableHead><TableHead className="font-black uppercase text-[10px]">Tipo</TableHead><TableHead className="text-right font-black uppercase text-[10px]">Acciones</TableHead></TableRow></TableHeader>
                   <TableBody>
                     {ejercicios.map((e) => {
                       const template = ACTIVITY_TEMPLATES.find(t => t.id === e.tipo);
                       return (
                        <TableRow key={e.id}>
                          <TableCell className="font-black text-slate-400">{e.orden}</TableCell>
                          <TableCell className="font-bold text-slate-700 uppercase tracking-tight">{e.titulo}</TableCell>
                          <TableCell>
                            <Badge className={cn("text-[9px] font-black uppercase text-white", template?.color)}>{template?.label}</Badge>
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
      {previewActivity && <ActivityPreview exercise={previewActivity} onClose={() => setPreviewActivity(null)} />}

      {/* SLIDE EDITOR Y RECURSOS */}
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
                            est === 'azul' ? 'bg-blue-900 text-white' : 
                            est === 'vino' ? 'bg-rose-900 text-white' : 
                            est === 'verde' ? 'bg-emerald-900 text-white' : 
                            'bg-slate-800 text-white'
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
    </div>
  );
}
