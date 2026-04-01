'use client';
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import confetti from 'canvas-confetti';
import { 
  ArrowLeft, RotateCcw, X, XCircle, ChevronLeft, ChevronRight,
  CheckCircle2, Play, HelpCircle, CheckCircle, Eye, EyeOff, AlertCircle, FileText, Layout, Hash, ListTree
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EntregaAlumno } from './EntregaAlumno';

export interface Token {
  id: string;
  text: string;
  isMissing: boolean;
}

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

export const ActivityPreview = ({ exercise, onClose, onComplete, entregaExistente, isPreview }: { 
  exercise: any; 
  onClose: () => void; 
  onComplete?: (score: number, total: number) => void;
  entregaExistente?: any;
  isPreview?: boolean;
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [score, setScore] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [finished, setSuccess] = useState(false);

  const hasCompleted = useRef(false);
  useEffect(() => {
    if (finished && onComplete && !hasCompleted.current) {
      hasCompleted.current = true;
      onComplete(score, totalSteps);
    }
  }, [finished, onComplete, score, totalSteps]); // Dependency array updated for clarity
  
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
          {/* Sección de entrega de archivo del alumno */}
          <EntregaAlumno 
            ejercicioId={exercise.id} 
            entregaExistente={entregaExistente}
            isPreview={isPreview}
          />
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


export function CompletarEspaciosPreview({ content, onFinish }: { content: any, onFinish: (score: number, total: number) => void }) {
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
