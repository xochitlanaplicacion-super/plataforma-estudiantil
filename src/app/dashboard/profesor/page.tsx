
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
  XCircle
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

const LOGO_URL = '/images/logo_zapata.png';

// --- MOTOR DE GENERACIÓN DE CRUCIGRAMAS PROFESIONAL ---
const CROSSWORD_GRID_SIZE = 50;
const CROSSWORD_CENTER = 25;

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
    this.grid = Array(CROSSWORD_GRID_SIZE).fill(null).map(() => Array(CROSSWORD_GRID_SIZE).fill(''));
  }

  canPlaceWord(word: string, startX: number, startY: number, dir: Direction): boolean {
    if (startX < 0 || startY < 0) return false;
    if (dir === 'HORIZONTAL' && startX + word.length > CROSSWORD_GRID_SIZE) return false;
    if (dir === 'VERTICAL' && startY + word.length > CROSSWORD_GRID_SIZE) return false;

    if (dir === 'HORIZONTAL') {
      if (startX > 0 && this.grid[startY][startX - 1] !== '') return false;
      if (startX + word.length < CROSSWORD_GRID_SIZE && this.grid[startY][startX + word.length] !== '') return false;
    } else {
      if (startY > 0 && this.grid[startY - 1][startX] !== '') return false;
      if (startY + word.length < CROSSWORD_GRID_SIZE && this.grid[startY + word.length][startX] !== '') return false;
    }

    for (let i = 0; i < word.length; i++) {
      const px = dir === 'HORIZONTAL' ? startX + i : startX;
      const py = dir === 'VERTICAL' ? startY + i : startY;

      if (this.grid[py][px] !== '') {
        if (this.grid[py][px] !== word[i]) return false;
      } else {
        if (dir === 'HORIZONTAL') {
          if (py > 0 && this.grid[py - 1][px] !== '') return false;
          if (py < CROSSWORD_GRID_SIZE - 1 && this.grid[py + 1][px] !== '') return false;
        } else {
          if (px > 0 && this.grid[py][px - 1] !== '') return false;
          if (px < CROSSWORD_GRID_SIZE - 1 && this.grid[py][px + 1] !== '') return false;
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
    this.placedWords.push({ ...wordInput, x, y, direction, number: 0 });
  }

  build(inputs: WordInput[]) {
    for (const input of inputs) {
      const word = input.word.toUpperCase();
      if (this.placedWords.length === 0) {
        this.placeWord(input, CROSSWORD_CENTER - Math.floor(word.length / 2), CROSSWORD_CENTER, 'HORIZONTAL');
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

      if (bestPlacement) this.placeWord(input, bestPlacement.x, bestPlacement.y, bestPlacement.dir);
      else this.unplacedWords.push(input);
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
    let minX = CROSSWORD_GRID_SIZE, minY = CROSSWORD_GRID_SIZE, maxX = 0, maxY = 0;
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

function CompletarEspaciosPreview({ content, onFinish }: { content: any, onFinish: (score: number, total: number) => void }) {
  const [appState, setAppState] = useState<'PLAY' | 'RESULT'>('PLAY');
  const [tokens] = useState<Token[]>(content.tokens || []);
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [bank, setBank] = useState<string[]>([]);
  const [resultsMap, setResultsMap] = useState<Record<string, boolean>>({});
  const [score, setScore] = useState(0);

  useEffect(() => {
    const missing = tokens.filter((t) => t.isMissing && t.text.trim() !== "").map((t) => t.id);
    setBank(missing.sort(() => Math.random() - 0.5));
    setPlaced({});
  }, [tokens]);

  const missingTokens = tokens.filter((t) => t.isMissing && t.text.trim() !== "");

  const handleDragStart = (e: React.DragEvent, wordId: string, sourceBlankId: string | null) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ wordId, sourceBlankId }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

  const handleDropOnBlank = (e: React.DragEvent, targetBlankId: string) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const { wordId, sourceBlankId } = data;
      if (!wordId) return;
      setPlaced((prev) => {
        const newPlaced = { ...prev };
        if (sourceBlankId) delete newPlaced[sourceBlankId];
        else setBank((prevBank) => prevBank.filter((id) => id !== wordId));
        const existingWordId = newPlaced[targetBlankId];
        if (existingWordId) setBank((prevBank) => [...prevBank, existingWordId]);
        newPlaced[targetBlankId] = wordId;
        return newPlaced;
      });
    } catch (err) {}
  };

  const handleDropOnBank = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const { wordId, sourceBlankId } = data;
      if (!wordId || !sourceBlankId) return;
      setPlaced((prev) => { const newPlaced = { ...prev }; delete newPlaced[sourceBlankId]; return newPlaced; });
      setBank((prevBank) => { if (!prevBank.includes(wordId)) return [...prevBank, wordId]; return prevBank; });
    } catch (err) {}
  };

  const handleEvaluate = () => {
    let correct = 0;
    const results: Record<string, boolean> = {};
    missingTokens.forEach((t) => {
      const placedWordId = placed[t.id];
      const isCorrect = placedWordId && tokens.find(x => x.id === placedWordId)?.text === t.text;
      results[t.id] = !!isCorrect;
      if (isCorrect) correct++;
    });
    setResultsMap(results);
    setScore(correct);
    if (correct === missingTokens.length) confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    setAppState('RESULT');
  };

  if (appState === 'PLAY') {
    return (
      <div className="w-full max-w-6xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500 py-6">
        <div className="flex items-center justify-between bg-white px-10 py-6 rounded-[32px] shadow-xl border-2 border-indigo-100">
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-4 uppercase tracking-widest"><RotateCcw className="text-indigo-600 w-8 h-8" /> Completa el Texto</h2>
          <Button onClick={handleEvaluate} disabled={Object.keys(placed).length !== missingTokens.length} className="px-10 h-14 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 shadow-xl disabled:opacity-50 transition-all">
            <CheckCircle2 className="w-5 h-5 mr-3" /> Revisar Respuestas
          </Button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          <div className="lg:col-span-3 bg-white p-12 rounded-[40px] shadow-2xl border-2 border-slate-100 leading-[3.5] text-2xl font-medium text-slate-700 max-h-[600px] overflow-y-auto custom-scrollbar">
            <div className="flex flex-wrap items-center">
              {tokens.map((token) => {
                if (!token.text.trim()) return <span key={token.id} className="w-2">{token.text}</span>;
                if (!token.isMissing) return <span key={token.id} className="text-slate-800 px-1 font-semibold">{token.text}</span>;
                const placedWordId = placed[token.id];
                return (
                  <div key={token.id} onDragOver={handleDragOver} onDrop={(e) => handleDropOnBlank(e, token.id)} className={cn("min-w-[120px] h-14 flex items-center justify-center border-b-4 rounded-t-xl transition-all px-4 mx-2 align-middle inline-flex shadow-sm", placedWordId ? "border-indigo-600 bg-indigo-50 shadow-inner" : "border-slate-300 bg-slate-50")}>
                    {placedWordId ? (
                      <div draggable onDragStart={(e) => handleDragStart(e, placedWordId, token.id)} className="cursor-grab active:cursor-grabbing font-black text-indigo-700 select-none tracking-wider text-xl">{tokens.find(t=>t.id===placedWordId)?.text}</div>
                    ) : <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Arrastra aquí</span>}
                  </div>
                );
              })}
            </div>
          </div>
          <div onDragOver={handleDragOver} onDrop={handleDropOnBank} className="lg:col-span-1 bg-indigo-50/70 p-8 rounded-[32px] border-4 border-dashed border-indigo-200/60 flex flex-col min-h-[500px] shadow-inner">
            <h3 className="text-xs font-black tracking-widest uppercase text-indigo-900 mb-8 text-center border-b-2 border-indigo-200/50 pb-4">Palabras Disponibles</h3>
            <div className="flex flex-col gap-4 flex-1">
              {bank.length === 0 ? <div className="text-center text-slate-400 italic text-xs font-bold mt-10 uppercase bg-white/50 p-4 rounded-xl">Todas colocadas</div> : bank.map((wordId) => (
                <div key={wordId} draggable onDragStart={(e) => handleDragStart(e, wordId, null)} className="bg-white px-6 py-4 rounded-2xl shadow-lg border-2 border-indigo-100 text-center font-black text-slate-700 cursor-grab active:cursor-grabbing hover:border-indigo-500 hover:shadow-xl hover:-translate-y-1 transition-all select-none text-lg">
                  {tokens.find(t=>t.id===wordId)?.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isPerfect = score === missingTokens.length;
  const percentage = Math.round((score / missingTokens.length) * 100) || 0;

  return (
    <div className="flex flex-col max-w-5xl mx-auto w-full space-y-10 animate-in zoom-in-95 duration-500 py-10">
      <div className={cn("p-12 rounded-[40px] shadow-2xl text-center border-4", isPerfect ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200')}>
        <h2 className="text-5xl font-black mb-8 flex items-center justify-center gap-4 text-slate-800 uppercase tracking-widest">
          {isPerfect ? <><CheckCircle2 className="w-14 h-14 text-emerald-500" /> ¡Excelente Trabajo!</> : <><RotateCcw className="w-14 h-14 text-red-500" /> Sigue Practicando</>}
        </h2>
        <div className="flex items-center justify-center gap-20 mt-10">
          <div className="text-center"><div className="text-8xl font-black mb-4 text-indigo-700 tracking-tighter">{score}<span className="text-5xl text-indigo-400">/{missingTokens.length}</span></div><div className="text-sm text-slate-500 font-black uppercase tracking-widest">Aciertos</div></div>
          <div className="w-1 h-32 bg-slate-300 rounded-full"></div>
          <div className="text-center"><div className={cn("text-8xl font-black mb-4 tracking-tighter", percentage >= 80 ? 'text-emerald-600' : percentage >= 50 ? 'text-amber-500' : 'text-red-500')}>{percentage}<span className="text-5xl">%</span></div><div className="text-sm text-slate-500 font-black uppercase tracking-widest">Puntuación</div></div>
        </div>
      </div>
      <div className="bg-white p-12 rounded-[40px] shadow-2xl border-2 border-slate-100 leading-[3.5] text-2xl">
        <h3 className="text-sm font-black text-indigo-600 mb-8 border-b-2 border-indigo-100 pb-4 uppercase tracking-widest flex items-center gap-3"><FileText className="w-5 h-5" /> Revisión del Ejercicio</h3>
        <div className="flex flex-wrap items-center">
          {tokens.map((token) => {
            if (!token.text.trim()) return <span key={token.id} className="w-2">{token.text}</span>;
            if (!token.isMissing) return <span key={token.id} className="text-slate-800 px-1 font-medium">{token.text}</span>;
            const isCorrect = resultsMap[token.id];
            return (
              <div key={token.id} className={cn("relative px-6 py-2 min-h-14 flex items-center justify-center rounded-xl border-4 font-black mx-2 inline-flex align-middle", isCorrect ? "bg-emerald-100 border-emerald-500 text-emerald-800" : "bg-red-100 border-red-500 text-red-800 line-through decoration-red-600/70 decoration-[4px] opacity-80")}>
                {tokens.find(t=>t.id===placed[token.id])?.text || '____'}
                {!isCorrect && <XCircle className="absolute -top-5 -right-5 w-10 h-10 text-red-600 bg-white rounded-full shadow-xl z-10 border-4 border-white" />}
                {isCorrect && <CheckCircle2 className="absolute -top-5 -right-5 w-10 h-10 text-emerald-600 bg-white rounded-full shadow-xl z-10 border-4 border-white" />}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-center mt-12">
        <Button onClick={() => onFinish(score, missingTokens.length)} className="px-14 h-20 bg-slate-800 text-white rounded-[32px] font-black text-xl hover:bg-slate-900 transition-all shadow-2xl hover:-translate-y-2 uppercase tracking-widest">
          Cerrar y Regresar
        </Button>
      </div>
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
const ActivityPreview = ({ exercise, onClose }: { exercise: any, onClose: () => void }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [score, setScore] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [finished, setSuccess] = useState(false);
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [shuffledItems, setShuffledItems] = useState<any[]>([]);
  const [sequenceItems, setSequenceItems] = useState<string[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<Record<string, string>>({});
  const [currentLeft, setCurrentLeft] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [fillAnswers, setFillAnswers] = useState<Record<number, string>>({});
  
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
      if (content.items) {
        const shuffled = [...content.items].sort(() => Math.random() - 0.5);
        setShuffledItems(shuffled);
        setTotalSteps(shuffled.length);
      }
    } else if (exercise.tipo === 'ordenar_secuencia' && content.items) {
      setSequenceItems([...content.items].sort(() => Math.random() - 0.5));
      setTotalSteps(1);
    } else if (exercise.tipo === 'emparejamiento' && content.items) {
      setTotalSteps(content.items.length);
      setShuffledItems([...content.items.map((i: any) => i.right)].sort(() => Math.random() - 0.5));
    } else if (exercise.tipo === 'sopa_letras') {
      generateSopaGrid();
      setTotalSteps((content.words || []).filter((w:string)=>w.length>0).length);
    } else if (exercise.tipo === 'completar_espacios' && content.tokens) {
      const missing = content.tokens.filter((t: any) => t.isMissing && t.text.trim() !== "");
      setTotalSteps(missing.length);
    }
  }, [content, exercise.tipo, generateSopaGrid]);

  const handleNext = (isCorrect: boolean) => {
    if (isCorrect) setScore(prev => prev + 1);
    
    if (currentStep + 1 < totalSteps) {
      setCurrentStep(prev => prev + 1);
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
      setScore(newFound.length);
      setSelectedSopaCells([]);
      if (newFound.length === totalSteps) {
        setTimeout(() => setSuccess(true), 1000);
      }
    }
  };

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
      setScore(crossword.placedWords.length);
      setTotalSteps(crossword.placedWords.length);
      setTimeout(() => setSuccess(true), 2000);
    }
  }, [solvedCrosswordWords, crossword]);

  const finishGradedActivity = () => {
    let finalScore = 0;
    if (exercise.tipo === 'emparejamiento') {
      content.items.forEach((item: any) => {
        if (matchedPairs[item.left] === item.right) finalScore++;
      });
    } else if (exercise.tipo === 'ordenar_secuencia') {
      let isPerfect = true;
      content.items.forEach((item: string, i: number) => {
        if (sequenceItems[i] !== item) isPerfect = false;
      });
      finalScore = isPerfect ? 1 : 0;
    } else if (exercise.tipo === 'completar_espacios') {
      // Logic handled by onFinish callback of CompletarEspaciosPreview
      return;
    }
    setScore(finalScore);
    setSuccess(true);
  };

  const renderContent = () => {
    if (exercise.tipo === 'crucigrama' && crossword) {
      const grid = Array(crossword.height).fill(null).map(() => 
        Array(crossword.width).fill(null).map(() => ({ letter: '', isActive: false, number: null as number | null, ids: [] as string[], acrossId: null as string | null, downId: null as string | null }))
      );
      crossword.placedWords.forEach(pw => {
        for (let i = 0; i < pw.word.length; i++) {
          const cx = pw.direction === 'HORIZONTAL' ? pw.x - crossword.minX + i : pw.x - crossword.minX;
          const cy = pw.direction === 'VERTICAL' ? pw.y - crossword.minY + i : pw.y - crossword.minY;
          grid[cy][cx].letter = pw.word[i];
          grid[cy][cx].isActive = true;
          grid[cy][cx].ids.push(pw.id);
          if (pw.direction === 'HORIZONTAL') grid[cy][cx].acrossId = pw.id;
          else grid[cy][cx].downId = pw.id;
          if (i === 0) grid[cy][cx].number = pw.number;
        }
      });

      const getCellStyles = (x: number, y: number, cell: any) => {
        if (!cell.isActive) return "bg-slate-800/5 border-transparent";
        const isSolved = cell.ids.some((id: string) => solvedCrosswordWords.has(id));
        if (isSolved) return "bg-emerald-50 text-emerald-600 border-emerald-300";
        if (focusedCell?.x === x && focusedCell?.y === y) return "bg-indigo-200 border-indigo-500 ring-2 ring-indigo-100 z-30";
        if (focusedCell) {
          const fCell = grid[focusedCell.y][focusedCell.x];
          if (direction === 'HORIZONTAL' && cell.acrossId && cell.acrossId === fCell.acrossId) return "bg-indigo-50 border-indigo-200";
          if (direction === 'VERTICAL' && cell.downId && cell.downId === fCell.downId) return "bg-indigo-50 border-indigo-200";
        }
        return "bg-white border-slate-300";
      };

      return (
        <div className="w-full max-w-6xl mx-auto flex flex-col lg:flex-row gap-8 py-10">
          <div className="flex-[2] bg-white p-8 rounded-[40px] shadow-2xl border-2 border-slate-100 flex flex-col items-center">
            <div className="flex justify-between items-center w-full mb-8">
              <h3 className="text-2xl font-black text-slate-800 uppercase">Crucigrama Interactivo</h3>
              <Button variant="ghost" onClick={() => setShowSolution(!showSolution)} className="text-indigo-600 gap-2 font-black uppercase text-xs">
                {showSolution ? <EyeOff size={16} /> : <Eye size={16} />} {showSolution ? 'Ocultar' : 'Ver Solución'}
              </Button>
            </div>
            <div className="grid gap-1 bg-slate-200 p-1 rounded-xl shadow-inner overflow-auto max-w-full" style={{ gridTemplateColumns: `repeat(${crossword.width}, minmax(0, 1fr))` }}>
              {grid.map((row, y) => row.map((cell, x) => (
                <div key={`${x}-${y}`} onClick={() => cell.isActive && setFocusedCell({x, y})} className={cn("aspect-square relative w-10 md:w-12 flex items-center justify-center font-black text-lg border transition-all cursor-pointer", getCellStyles(x, y, cell))}>
                  {cell.isActive && (
                    <>
                      {cell.number && <span className="absolute top-0.5 left-1 text-[9px] text-slate-400">{cell.number}</span>}
                      {showSolution ? <span className="text-indigo-600">{cell.letter}</span> : (
                        <input 
                          ref={el => { inputRefs.current[`${x}-${y}`] = el; }}
                          maxLength={1}
                          className="w-full h-full text-center bg-transparent outline-none uppercase z-10"
                          value={userInputs[`${x}-${y}`] || ''}
                          onChange={e => {
                            const val = e.target.value.toUpperCase();
                            const isLocked = cell.ids.some((id: string) => solvedCrosswordWords.has(id));
                            if (isLocked) return;
                            setUserInputs(prev => ({ ...prev, [`${x}-${y}`]: val }));
                            if (val) {
                              const nextX = direction === 'HORIZONTAL' ? x + 1 : x;
                              const nextY = direction === 'VERTICAL' ? y + 1 : y;
                              if (grid[nextY]?.[nextX]?.isActive) {
                                setFocusedCell({x: nextX, y: nextY});
                                inputRefs.current[`${nextX}-${nextY}`]?.focus();
                              }
                            }
                          }}
                          onFocus={() => {
                            setFocusedCell({ x, y });
                            if (cell.acrossId && cell.downId) { /* keep current dir */ }
                            else if (cell.acrossId) setDirection('HORIZONTAL');
                            else if (cell.downId) setDirection('VERTICAL');
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Backspace' && !userInputs[`${x}-${y}`]) {
                              const prevX = direction === 'HORIZONTAL' ? x - 1 : x;
                              const prevY = direction === 'VERTICAL' ? y - 1 : y;
                              if (grid[prevY]?.[prevX]?.isActive) {
                                setFocusedCell({x: prevX, y: prevY});
                                inputRefs.current[`${prevX}-${prevY}`]?.focus();
                              }
                            } else if (e.key.startsWith('Arrow')) {
                              e.preventDefault();
                              let nx = x, ny = y;
                              if (e.key === 'ArrowRight') nx++; if (e.key === 'ArrowLeft') nx--;
                              if (e.key === 'ArrowDown') ny++; if (e.key === 'ArrowUp') ny--;
                              if (grid[ny]?.[nx]?.isActive) {
                                setFocusedCell({x: nx, y: ny});
                                inputRefs.current[`${nx}-${ny}`]?.focus();
                              }
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
              <h4 className="text-[10px] font-black uppercase text-indigo-600 tracking-widest mb-6 border-b pb-2">Pistas del Crucigrama</h4>
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
            <Badge className="bg-blue-600 text-white px-4 py-1">PREGUNTA {currentStep + 1} / {totalSteps}</Badge>
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
            <Badge className="bg-emerald-600 text-white px-4 py-1">AFIRMACIÓN {currentStep + 1} / {totalSteps}</Badge>
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
      const rightItems = shuffledItems.length > 0 ? shuffledItems : content.items.map((i: any) => i.right);
      const isComplete = Object.keys(matchedPairs).length === leftItems.length;

      const handleDragStartMatch = (e: React.DragEvent, left: string) => {
        e.dataTransfer.setData("text/plain", left);
      };

      const handleDropMatch = (e: React.DragEvent, right: string) => {
        e.preventDefault();
        const left = e.dataTransfer.getData("text/plain");
        if (!left) return;
        setMatchedPairs(prev => {
          const newPairs = { ...prev };
          const existingKey = Object.keys(newPairs).find(k => newPairs[k] === right);
          if (existingKey) delete newPairs[existingKey];
          newPairs[left] = right;
          return newPairs;
        });
      };

      return (
        <div className="max-w-5xl mx-auto space-y-10 py-10 animate-in fade-in zoom-in-95 duration-500">
          <div className="text-center space-y-3 bg-white p-8 rounded-[32px] shadow-sm border-2 border-purple-50">
            <h3 className="text-3xl font-black text-slate-800 uppercase tracking-widest flex items-center justify-center gap-3"><Layout className="text-purple-600"/> Relación de Columnas</h3>
            <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">Arrastra los conceptos (Izquierda) hacia su definición correspondiente (Derecha).</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-4 bg-purple-50/50 p-6 rounded-[32px] border-2 border-purple-100">
              <h4 className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-6 text-center">Conceptos (Arrastra estos)</h4>
              {leftItems.map((left: string, i: number) => {
                const isMatched = !!matchedPairs[left];
                return (
                  <div key={i} draggable={!isMatched} onDragStart={(e) => handleDragStartMatch(e, left)} className={cn("w-full p-6 py-5 rounded-2xl border-2 font-black transition-all text-center", isMatched ? "bg-slate-100 border-slate-200 text-slate-400 opacity-50 select-none" : "bg-white border-purple-200 text-purple-700 cursor-grab active:cursor-grabbing hover:border-purple-400 hover:shadow-lg hover:-translate-y-1 shadow-sm")}>
                    {left}
                  </div>
                );
              })}
            </div>
            <div className="space-y-4 bg-slate-50/50 p-6 rounded-[32px] border-2 border-slate-100">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 text-center">Definiciones (Suelta aquí)</h4>
              {rightItems.map((right: string, i: number) => {
                const matchedLeft = Object.keys(matchedPairs).find(k => matchedPairs[k] === right);
                return (
                  <div key={i} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDropMatch(e, right)} className={cn("w-full min-h-[80px] p-6 rounded-2xl border-4 border-dashed transition-all flex flex-col items-center justify-center gap-3", matchedLeft ? "bg-purple-100/50 border-purple-300" : "bg-white border-slate-200 hover:border-purple-300")}>
                    <p className="font-semibold text-slate-600 text-sm text-center leading-relaxed">{right}</p>
                    {matchedLeft ? (
                      <div className="w-full mt-2 py-3 px-4 bg-purple-600 text-white rounded-xl font-black text-sm text-center shadow-md animate-in zoom-in-50 duration-200">
                        {matchedLeft}
                      </div>
                    ) : (
                      <div className="w-full mt-2 py-3 bg-slate-100 rounded-xl font-black text-[10px] uppercase text-slate-400 text-center tracking-widest">
                        Soltar Aquí
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {isComplete && (
            <div className="flex justify-center mt-10">
              <Button onClick={finishGradedActivity} className="px-12 h-16 rounded-[32px] bg-purple-600 text-white font-black uppercase text-lg tracking-widest shadow-xl hover:bg-purple-700 hover:-translate-y-1 transition-all"><CheckCircle2 className="w-6 h-6 mr-3"/> Finalizar Actividad</Button>
            </div>
          )}
        </div>
      );
    }

    if (exercise.tipo === 'ordenar_secuencia' && sequenceItems.length > 0) {
      const handleDragStartSeq = (e: React.DragEvent, idx: number) => {
        e.dataTransfer.setData("text/plain", idx.toString());
      };
      
      const handleDragOverSeq = (e: React.DragEvent) => { e.preventDefault(); };
      
      const handleDropSeq = (e: React.DragEvent, dropIdx: number) => {
        e.preventDefault();
        const dragIdx = parseInt(e.dataTransfer.getData("text/plain"));
        if (isNaN(dragIdx) || dragIdx === dropIdx) return;
        const newItems = [...sequenceItems];
        const [dragged] = newItems.splice(dragIdx, 1);
        newItems.splice(dropIdx, 0, dragged);
        setSequenceItems(newItems);
      };

      return (
        <div className="max-w-3xl mx-auto space-y-10 py-10 animate-in fade-in zoom-in-95 duration-500">
          <div className="text-center space-y-3 bg-white p-8 rounded-[32px] shadow-sm border-2 border-orange-50">
            <h3 className="text-3xl font-black text-slate-800 uppercase tracking-widest flex items-center justify-center gap-3"><Hash className="text-orange-600"/> Ordenar Pasos</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Arrastra y suelta las tarjetas para organizar la secuencia en el orden correcto.</p>
          </div>
          <div className="space-y-4 bg-orange-50/30 p-8 rounded-[40px] border-2 border-orange-100/50">
            {sequenceItems.map((item, i) => (
              <div 
                key={i} 
                draggable 
                onDragStart={(e) => handleDragStartSeq(e, i)}
                onDragOver={handleDragOverSeq}
                onDrop={(e) => handleDropSeq(e, i)}
                className="flex items-center gap-6 p-6 bg-white border-2 border-slate-100 rounded-3xl shadow-md cursor-grab active:cursor-grabbing hover:border-orange-400 hover:shadow-xl hover:-translate-y-1 transition-all group"
              >
                <div className="h-12 w-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-xl shadow-inner group-hover:bg-orange-500 group-hover:text-white transition-colors">{i + 1}</div>
                <span className="flex-1 font-black text-slate-700 uppercase text-lg">{item}</span>
                <ListTree className="text-slate-200 group-hover:text-orange-300 w-6 h-6"/>
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-10">
            <Button onClick={finishGradedActivity} className="px-12 h-16 rounded-[32px] bg-orange-500 hover:bg-orange-600 text-white font-black uppercase text-lg tracking-widest shadow-xl hover:-translate-y-1 transition-all"><CheckCircle2 className="w-6 h-6 mr-3"/> Verificar Orden</Button>
          </div>
        </div>
      );
    }

    if (exercise.tipo === 'completar_espacios' && content.tokens) {
      return (
        <CompletarEspaciosPreview 
          content={content} 
          onFinish={(s, t) => {
            setScore(s);
            setTotalSteps(t);
            setSuccess(true);
          }} 
        />
      );
    }

    if (exercise.tipo === 'flashcards' && shuffledItems.length > 0) {
      const card = shuffledItems[currentStep];
      const progress = ((currentStep) / totalSteps) * 100;
      
      return (
        <div className="max-w-3xl mx-auto space-y-10 py-10 animate-in fade-in zoom-in-95 duration-500">
          <div className="space-y-4">
            <div className="flex justify-between items-center px-4">
              <Badge className="bg-amber-500/20 text-amber-700 px-4 py-1.5 border border-amber-500/30 text-[10px] tracking-widest">TARJETA {currentStep + 1} DE {totalSteps}</Badge>
              <span className="text-xs font-black text-slate-400 tracking-widest uppercase">Repasadas: {score} / {totalSteps}</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className="bg-amber-500 h-full transition-all duration-500" style={{width: `${progress}%`}}></div>
            </div>
          </div>

          <div className="perspective-1000 h-[450px] w-full mt-8" style={{ perspective: '1000px' }}>
            <div onClick={() => setIsFlipped(!isFlipped)} className={cn("relative w-full h-full transition-all duration-700 cursor-pointer group", isFlipped && "[transform:rotateY(180deg)]")} style={{ transformStyle: 'preserve-3d' }}>
              {/* DORSO / FRENTE */}
              <div className="absolute inset-0 w-full h-full bg-white border-[6px] border-amber-100 rounded-[64px] flex flex-col items-center justify-center p-12 text-center shadow-2xl group-hover:border-amber-300 transition-colors" style={{ backfaceVisibility: 'hidden' }}>
                <span className="absolute top-10 text-[10px] font-black uppercase text-amber-400 tracking-[0.4em]">Frente de Tarjeta</span>
                <h3 className="text-4xl md:text-5xl font-black text-slate-800 uppercase leading-snug">{card.front}</h3>
                <div className="absolute bottom-10 flex items-center gap-2 text-[10px] font-black text-amber-500/50 uppercase tracking-widest animate-pulse">
                  <RotateCcw className="w-4 h-4"/> Voltear para ver definición
                </div>
              </div>
              
              {/* REVERSO */}
              <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-amber-400 to-amber-600 border-[6px] border-amber-300 rounded-[64px] flex flex-col items-center justify-center p-12 text-center shadow-2xl text-white" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                <span className="absolute top-10 text-[10px] font-black uppercase text-amber-200 tracking-[0.4em]">Reverso (Definición)</span>
                <p className="text-3xl font-bold leading-relaxed">{card.back}</p>
                <div className="absolute bottom-10 flex items-center gap-2 text-[10px] font-black text-amber-100/50 uppercase tracking-widest animate-pulse">
                  <RotateCcw className="w-4 h-4"/> Voltear al frente
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-6 mt-12 justify-center">
            <Button onClick={() => handleNext(false)} className="w-48 h-20 rounded-[32px] bg-white border-4 border-slate-100 text-slate-400 font-black uppercase text-lg tracking-widest shadow-lg hover:border-red-200 hover:text-red-500 hover:bg-red-50 hover:-translate-y-2 transition-all"><X className="w-8 h-8 mr-2"/> Repasar</Button>
            <Button onClick={() => handleNext(true)} className="w-48 h-20 rounded-[32px] bg-white border-4 border-slate-100 text-slate-400 font-black uppercase text-lg tracking-widest shadow-lg hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50 hover:-translate-y-2 transition-all"><CheckCircle className="w-8 h-8 mr-2"/> Lo Sé</Button>
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
              <div className={cn(
                "h-32 w-32 rounded-full flex items-center justify-center shadow-inner animate-in zoom-in duration-500",
                score === totalSteps ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
              )}>
                {score === totalSteps ? <CheckCircle size={80} /> : <AlertCircle size={80} />}
              </div>
              <div className="space-y-2">
                <h2 className="text-4xl font-black text-slate-800 uppercase">
                  {score === totalSteps ? "¡Excelente Trabajo!" : "Actividad Finalizada"}
                </h2>
                <p className="text-2xl text-slate-500 font-bold uppercase">
                  Resumen: <span className="text-primary">{score}</span> aciertos de {totalSteps} totales
                </p>
              </div>
              <Button onClick={onClose} className="rounded-3xl px-12 h-16 bg-slate-800 text-white font-black uppercase text-lg tracking-widest shadow-2xl hover:scale-105 transition-transform">Volver al Panel</Button>
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
    </div>
  );
}
