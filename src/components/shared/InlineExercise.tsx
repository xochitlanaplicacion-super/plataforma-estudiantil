"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle, XCircle, RotateCcw } from "lucide-react";

export interface ExerciseState {
  answers: Record<number, string | boolean>;
  evaluated: boolean;
  scoreData: { score: number, failed: string[] } | null;
  order: number[];
  optionsOrder: Record<number, string[]>;
}

interface InlineExerciseProps {
  type: "multiple" | "boolean";
  items: any[];
  exerciseState?: ExerciseState;
  onStateChange?: (state: ExerciseState) => void;
  onFinish: (score: number, failedQuestions: string[], internalPrompt: string) => void;
  disabled?: boolean;
}

function shuffleArray<T>(array: T[]): T[] {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

export function InlineExercise({ type, items, exerciseState, onStateChange, onFinish, disabled = false }: InlineExerciseProps) {
  const [answers, setAnswers] = useState<Record<number, string | boolean>>(exerciseState?.answers || {});
  const [evaluated, setEvaluated] = useState(exerciseState?.evaluated || false);
  const [scoreData, setScoreData] = useState<{ score: number, failed: string[] } | null>(exerciseState?.scoreData || null);
  
  const [order, setOrder] = useState<number[]>(exerciseState?.order || []);
  const [optionsOrder, setOptionsOrder] = useState<Record<number, string[]>>(exerciseState?.optionsOrder || {});

  // Inicializar orden aleatorio si no viene del estado
  useEffect(() => {
    if (order.length === 0) {
      const newOrder = shuffleArray(items.map((_, i) => i));
      const newOptionsOrder: Record<number, string[]> = {};
      
      items.forEach((item, index) => {
        if (type === "multiple" && item.options) {
          newOptionsOrder[index] = shuffleArray(item.options.map((o: any) => o.id));
        }
      });
      
      setOrder(newOrder);
      setOptionsOrder(newOptionsOrder);
      
      // Notificar al padre el estado inicial
      if (onStateChange) {
        onStateChange({ answers, evaluated, scoreData, order: newOrder, optionsOrder: newOptionsOrder });
      }
    }
  }, []);

  const notifyState = (updates: Partial<ExerciseState>) => {
    if (onStateChange) {
      onStateChange({
        answers,
        evaluated,
        scoreData,
        order,
        optionsOrder,
        ...updates
      });
    }
  };

  const handleSelect = (originalIndex: number, val: string | boolean) => {
    if (evaluated || disabled) return;
    const newAnswers = { ...answers, [originalIndex]: val };
    setAnswers(newAnswers);
    notifyState({ answers: newAnswers });
  };

  const handleCalificar = () => {
    if (Object.keys(answers).length < items.length) {
      alert("Por favor responde todas las preguntas.");
      return;
    }

    let correctCount = 0;
    const failed: string[] = [];
    let internalPrompt = `[INSTRUCCIÓN INTERNA DEL SISTEMA]: El alumno acaba de terminar un ejercicio. Tu tarea es darle feedback pedagógico sobre sus errores (o felicitarlo si sacó 10). ESTE ES SU RESULTADO REAL:\n`;

    items.forEach((item, originalIndex) => {
      const userAnswer = answers[originalIndex];
      let isCorrect = false;

      if (type === "multiple") {
        isCorrect = userAnswer === item.correctId;
      } else if (type === "boolean") {
        isCorrect = userAnswer === item.correct;
      }

      if (isCorrect) {
        correctCount++;
      } else {
        const questionNumber = order.indexOf(originalIndex) + 1;
        failed.push(`Pregunta ${questionNumber}`);
        
        let questionText = type === "multiple" ? item.question : item.statement;
        let userAnswerText = String(userAnswer);
        let correctAnswerText = String(type === "multiple" ? item.correctId : item.correct);

        if (type === "multiple") {
          const userOpt = item.options.find((o: any) => o.id === userAnswer);
          const correctOpt = item.options.find((o: any) => o.id === item.correctId);
          userAnswerText = userOpt ? userOpt.text : String(userAnswer);
          correctAnswerText = correctOpt ? correctOpt.text : String(item.correctId);
        } else {
          userAnswerText = userAnswer ? "Verdadero" : "Falso";
          correctAnswerText = item.correct ? "Verdadero" : "Falso";
        }

        internalPrompt += `\n❌ Falló la pregunta: "${questionText}"\nEl alumno respondió: "${userAnswerText}"\nLa respuesta correcta era: "${correctAnswerText}".\nFeedback esperado: ${item.feedback}\n`;
      }
    });

    const score = (correctCount / items.length) * 10;
    const newScoreData = { score, failed };
    
    internalPrompt += `\nCalificación final: ${score.toFixed(1)}/10.\nNo menciones que esto es una instrucción interna, actúa natural como su tutor. Solo explícale por qué falló basándote en la información que acabo de proveerte.`;

    setScoreData(newScoreData);
    setEvaluated(true);
    notifyState({ evaluated: true, scoreData: newScoreData });
    onFinish(score, failed, internalPrompt);
  };

  const handleRetry = () => {
    // Resetear todo y mezclar de nuevo
    const newAnswers = {};
    const newOrder = shuffleArray(items.map((_, i) => i));
    const newOptionsOrder: Record<number, string[]> = {};
    
    items.forEach((item, index) => {
      if (type === "multiple" && item.options) {
        newOptionsOrder[index] = shuffleArray(item.options.map((o: any) => o.id));
      }
    });

    setAnswers(newAnswers);
    setEvaluated(false);
    setScoreData(null);
    setOrder(newOrder);
    setOptionsOrder(newOptionsOrder);
    
    notifyState({
      answers: newAnswers,
      evaluated: false,
      scoreData: null,
      order: newOrder,
      optionsOrder: newOptionsOrder
    });
  };

  if (order.length === 0) return null; // Evitar hidratación mismatch o render sin orden

  return (
    <div className="bg-[#130f2a]/80 border border-indigo-500/30 rounded-xl p-4 my-2 text-sm text-slate-200">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-indigo-500/20">
        <span className="text-xl">📝</span>
        <h4 className="font-bold text-indigo-300">
          Ejercicio Práctico: {type === "multiple" ? "Opción Múltiple" : "Verdadero / Falso"}
        </h4>
      </div>

      <div className="space-y-6">
        {order.map((originalIndex, displayIndex) => {
          const item = items[originalIndex];
          const userAnswer = answers[originalIndex];
          let isCorrect = false;
          
          if (evaluated) {
            isCorrect = type === "multiple" ? userAnswer === item.correctId : userAnswer === item.correct;
          }

          return (
            <div key={originalIndex} className="space-y-2">
              <p className="font-medium text-slate-100">
                {displayIndex + 1}. {type === "multiple" ? item.question : item.statement}
              </p>

              <div className="space-y-2 pl-2">
                {type === "multiple" && optionsOrder[originalIndex]?.map((optId) => {
                  const opt = item.options.find((o: any) => o.id === optId);
                  if (!opt) return null;
                  
                  return (
                    <label
                      key={opt.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all border ${
                        userAnswer === opt.id ? "bg-indigo-600/30 border-indigo-500" : "bg-white/5 border-transparent hover:bg-white/10"
                      } ${evaluated && opt.id === item.correctId ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : ""} ${
                        evaluated && userAnswer === opt.id && !isCorrect ? "border-rose-500 bg-rose-500/10" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${originalIndex}`}
                        value={opt.id}
                        checked={userAnswer === opt.id}
                        onChange={() => handleSelect(originalIndex, opt.id)}
                        disabled={evaluated || disabled}
                        className="accent-indigo-500 w-4 h-4 shrink-0 mt-0.5"
                      />
                      <span className={`flex-1 ${evaluated && opt.id === item.correctId ? "font-semibold text-emerald-200" : ""}`}>{opt.text}</span>
                      {evaluated && opt.id === item.correctId && <CheckCircle size={18} className="text-emerald-500 shrink-0" />}
                      {evaluated && userAnswer === opt.id && !isCorrect && <XCircle size={18} className="text-rose-500 shrink-0" />}
                    </label>
                  );
                })}

                {type === "boolean" && [true, false].map((val) => (
                  <label
                    key={String(val)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all border ${
                      userAnswer === val ? "bg-indigo-600/30 border-indigo-500" : "bg-white/5 border-transparent hover:bg-white/10"
                    } ${evaluated && val === item.correct ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : ""} ${
                      evaluated && userAnswer === val && !isCorrect ? "border-rose-500 bg-rose-500/10" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${originalIndex}`}
                      checked={userAnswer === val}
                      onChange={() => handleSelect(originalIndex, val)}
                      disabled={evaluated || disabled}
                      className="accent-indigo-500 w-4 h-4 shrink-0 mt-0.5"
                    />
                    <span className={`flex-1 ${evaluated && val === item.correct ? "font-semibold text-emerald-200" : ""}`}>{val ? "Verdadero" : "Falso"}</span>
                    {evaluated && val === item.correct && <CheckCircle size={18} className="text-emerald-500 shrink-0" />}
                    {evaluated && userAnswer === val && !isCorrect && <XCircle size={18} className="text-rose-500 shrink-0" />}
                  </label>
                ))}
              </div>

              {evaluated && (
                <div className={`mt-2 p-3 text-[13px] rounded-lg leading-relaxed ${isCorrect ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/10 text-rose-200"}`}>
                  <span className="font-bold">{isCorrect ? "¡Correcto!" : "Incorrecto."}</span> {item.feedback}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!evaluated && !disabled && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleCalificar}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all active:scale-95 flex items-center gap-2"
          >
            <CheckCircle size={18} />
            Calificar
          </button>
        </div>
      )}

      {evaluated && scoreData && (
        <div className="mt-6 p-5 bg-indigo-950/40 border border-indigo-500/30 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-slate-300 font-medium">Tu calificación:</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-black text-white">{scoreData.score.toFixed(1)}</span>
                <span className="text-sm font-medium text-slate-400">/ 10</span>
              </div>
            </div>
            <div className="text-right text-xs text-slate-400">
              {scoreData.failed.length === 0 ? (
                <span className="text-emerald-400 font-medium flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-full"><CheckCircle size={14} /> ¡Todo perfecto!</span>
              ) : (
                <span className="bg-rose-500/10 text-rose-300 px-3 py-1.5 rounded-full font-medium">Errores en: {scoreData.failed.join(", ")}</span>
              )}
            </div>
          </div>
          
          {!disabled && (
            <div className="flex justify-end pt-4 border-t border-indigo-500/20">
              <button
                onClick={handleRetry}
                className="px-4 py-2 rounded-lg text-sm font-medium text-indigo-300 hover:text-white hover:bg-indigo-500/20 transition-all flex items-center gap-2 border border-indigo-500/30 hover:border-indigo-500/50"
              >
                <RotateCcw size={16} />
                Intentar otra vez
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
