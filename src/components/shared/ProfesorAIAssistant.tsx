"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HelpCircle, Sparkles, X, MessageSquare, BookOpen } from "lucide-react";
import Image from "next/image";
import { ProfesorAICopilot } from "./ProfesorAICopilot";

type DialogStep = 
  | 'INIT_PRESENTATION'
  | 'EXPLAIN_PRESENTATION'
  | 'INIT_EXERCISES'
  | 'EXPLAIN_EXERCISES'
  | 'COPILOT_INFO'
  | 'CLOSED';

interface ProfesorAIAssistantProps {
  userId?: string;
  userName?: string;
}

export function ProfesorAIAssistant({ userId, userName }: ProfesorAIAssistantProps) {
  const [step, setStep] = useState<DialogStep>('CLOSED');
  const [isVisible, setIsVisible] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    const hasSeen = localStorage.getItem('ai_assistant_seen_v1');
    if (!hasSeen) {
      setTimeout(() => {
        setStep('INIT_PRESENTATION');
        setIsVisible(true);
      }, 1000);
    }
  }, []);

  const closeAndSave = () => {
    setIsVisible(false);
    setTimeout(() => setStep('CLOSED'), 500);
    localStorage.setItem('ai_assistant_seen_v1', 'true');
  };

  const openTutorial = () => {
    setMenuOpen(false);
    setStep('INIT_PRESENTATION');
    setIsVisible(true);
  };

  const openCopilot = () => {
    setMenuOpen(false);
    setCopilotOpen(true);
  };

  if (!hasMounted) return null;

  return createPortal(
    <>
      {/* TUTORIAL BOT OVERLAY */}
      <div 
        className={cn(
          "fixed inset-0 z-40 flex items-center justify-center transition-all duration-700 ease-in-out",
          isVisible ? "opacity-100 pointer-events-auto backdrop-blur-md bg-slate-900/40" : "opacity-0 pointer-events-none"
        )}
      >
        <div 
          className={cn(
            "relative w-full max-w-5xl flex flex-col md:flex-row items-center gap-8 p-8 transition-all duration-700",
            isVisible ? "scale-100 translate-y-0" : "scale-90 translate-y-20"
          )}
        >
          {/* SECCION DEL BOT */}
          <div className="relative flex flex-col items-center justify-center w-80 md:w-[28rem] lg:w-[32rem] shrink-0">
            <div className="relative z-10 w-full aspect-square animate-bot-hover">
              <Image 
                src="/images/NORMALBOT.png" 
                alt="AI Assistant Bot" 
                fill
                className="object-contain drop-shadow-2xl"
                priority
              />
            </div>
            <div className="absolute -bottom-4 w-40 h-8 rounded-[100%] bg-blue-400/30 blur-[20px] animate-pulse-fast shadow-[0_0_50px_20px_rgba(59,130,246,0.6)]" />
            <div className="absolute -bottom-4 w-20 h-4 rounded-[100%] bg-cyan-300/60 blur-[10px] animate-pulse-slow shadow-[0_0_30px_10px_rgba(34,211,238,0.8)]" />
          </div>

          {/* BOCADILLO DE DIALOGO */}
          <div className="relative flex-1 bg-white rounded-[32px] p-8 md:p-10 shadow-2xl border-2 border-indigo-50 animate-in zoom-in-95 duration-500">
            <div className="absolute top-1/2 -left-6 transform -translate-y-1/2 hidden md:block w-0 h-0 border-y-[15px] border-y-transparent border-r-[25px] border-r-white" />
            <button onClick={closeAndSave} className="absolute top-6 right-6 text-slate-300 hover:text-slate-500 transition-colors">
              <X size={24} />
            </button>

            <div className="space-y-6">
              {step === 'INIT_PRESENTATION' && (
                <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl"><Sparkles size={28} /></div>
                    <h3 className="text-2xl font-black uppercase text-slate-800 tracking-tight">¡Hola, Profesor!</h3>
                  </div>
                  <p className="text-lg md:text-xl text-slate-600 font-medium leading-relaxed">
                    He notado que es tu primera vez por aquí, o al menos es la primera vez que charlamos. ¿Sabías que ahora puedes crear <strong className="text-indigo-600 font-black">Presentaciones (Diapositivas) con Inteligencia Artificial</strong> para tus clases en cuestión de segundos?
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <Button onClick={() => setStep('INIT_EXERCISES')} className="h-14 rounded-2xl bg-slate-800 hover:bg-slate-900 text-white font-black uppercase tracking-widest text-sm shadow-xl transition-transform hover:scale-105 flex-1">
                      ¡Sí, me convence!
                    </Button>
                    <Button onClick={() => setStep('EXPLAIN_PRESENTATION')} variant="outline" className="h-14 rounded-2xl border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-black uppercase tracking-widest text-sm flex-1">
                      No, cuéntame más
                    </Button>
                  </div>
                </div>
              )}

              {step === 'EXPLAIN_PRESENTATION' && (
                <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                  <h3 className="text-2xl font-black uppercase text-indigo-600 tracking-tight flex items-center gap-2">
                    <Sparkles size={24} /> ¡Así de fácil es:
                  </h3>
                  <div className="space-y-4 text-slate-600 text-lg">
                    <div className="flex items-start gap-3"><span className="font-black text-indigo-600 shrink-0">1.</span><span>Ve a cualquiera de tus <strong>Temas</strong>.</span></div>
                    <div className="flex items-start gap-3"><span className="font-black text-indigo-600 shrink-0">2.</span><span>Haz clic en el botón de <strong>"Diseño de Clase con IA"</strong>.</span></div>
                    <div className="flex items-start gap-3"><span className="font-black text-indigo-600 shrink-0">3.</span><span>Escribe de qué tratará tu clase y la IA armará todo el contenido estructurado en diapositivas.</span></div>
                    <p className="pt-2 font-black text-slate-800">¡Incluso puedes exportarlas a PowerPoint directo a tu computadora!</p>
                  </div>
                  <div className="pt-4 flex justify-end">
                    <Button onClick={() => setStep('INIT_EXERCISES')} className="h-14 px-10 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-sm shadow-xl">
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}

              {step === 'INIT_EXERCISES' && (
                <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl"><Sparkles size={28} /></div>
                    <h3 className="text-2xl font-black uppercase text-slate-800 tracking-tight">¡Eso no es todo!</h3>
                  </div>
                  <p className="text-lg md:text-xl text-slate-600 font-medium leading-relaxed">
                    ¿Ya sabías que también puedes crear <strong className="text-blue-600 font-black">Ejercicios Automáticos e Interactivos</strong> para tus alumnos?
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <Button onClick={() => setStep('COPILOT_INFO')} className="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black uppercase tracking-widest text-sm flex-1">
                      ¡Genial, ya lo sabía!
                    </Button>
                    <Button onClick={() => setStep('EXPLAIN_EXERCISES')} className="h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-sm shadow-xl flex-1">
                      Enséñame cómo
                    </Button>
                  </div>
                </div>
              )}

              {step === 'EXPLAIN_EXERCISES' && (
                <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                  <h3 className="text-2xl font-black uppercase text-blue-600 tracking-tight flex items-center gap-2">
                    <Sparkles size={24} /> ¡Crea actividades en segundos:
                  </h3>
                  <div className="space-y-4 text-slate-600 text-lg">
                    <div className="flex items-start gap-3"><span className="font-black text-blue-600 shrink-0">1.</span><span>Dentro de un Tema, ve a la pestaña de <strong>Actividades</strong>.</span></div>
                    <div className="flex items-start gap-3"><span className="font-black text-blue-600 shrink-0">2.</span><span>Selecciona crear una (ej. Crucigrama, Cuestionario, Completar Espacios).</span></div>
                    <div className="flex items-start gap-3"><span className="font-black text-blue-600 shrink-0">3.</span><span>Verás un botón de <strong>"Generar con IA"</strong>.</span></div>
                    <div className="flex items-start gap-3"><span className="font-black text-blue-600 shrink-0">4.</span><span>Pega un texto o escribe tus instrucciones, y la IA llenará todo el formulario por ti ¡al instante!</span></div>
                    <p className="pt-2 font-black text-slate-800">¡Ahorrarás muchísimo tiempo preparando tus clases!</p>
                  </div>
                  <div className="pt-4 flex justify-end">
                    <Button onClick={() => setStep('COPILOT_INFO')} className="h-14 px-10 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-sm shadow-xl">
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}

              {step === 'COPILOT_INFO' && (
                <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl"><MessageSquare size={28} /></div>
                    <h3 className="text-2xl font-black uppercase text-slate-800 tracking-tight">¡Asesor IA 24/7!</h3>
                  </div>
                  <div className="space-y-4 text-slate-600 text-lg">
                    <p>
                      Recuerda que estoy disponible en cualquier momento como tu <strong>Copiloto Personal</strong>. Puedo:
                    </p>
                    <div className="flex items-start gap-3"><span className="font-black text-purple-600 shrink-0">•</span><span>Analizar en qué temas fallan tus estudiantes.</span></div>
                    <div className="flex items-start gap-3"><span className="font-black text-purple-600 shrink-0">•</span><span>Ayudarte en planeación buscando recursos, artículos y estrategias en la web.</span></div>
                    <p className="pt-2 font-medium text-slate-800">
                      Encuéntrame siempre en el botón <strong className="text-purple-600">"Ayuda IA"</strong> en la esquina inferior derecha de tu pantalla.
                    </p>
                  </div>
                  <div className="pt-4 flex justify-end">
                    <Button onClick={closeAndSave} className="h-14 px-10 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-black uppercase tracking-widest text-sm shadow-xl">
                      ¡Genial, a trabajar!
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* BOTON FLOTANTE + MENU */}
      {!isVisible && !copilotOpen && (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
          {menuOpen && (
            <div className="flex flex-col items-end gap-2 animate-in slide-in-from-bottom-4 duration-200">
              <button
                onClick={openTutorial}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 shadow-xl rounded-full hover:bg-slate-50 hover:scale-105 transition-all"
              >
                <span className="text-xs font-black uppercase tracking-widest text-slate-700">Guia de Inicio</span>
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white">
                  <BookOpen size={14} />
                </div>
              </button>
              <button
                onClick={openCopilot}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 shadow-xl rounded-full hover:bg-slate-50 hover:scale-105 transition-all"
              >
                <span className="text-xs font-black uppercase tracking-widest text-slate-700">Chat Copiloto</span>
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white">
                  <MessageSquare size={14} />
                </div>
              </button>
            </div>
          )}

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={cn(
              "group relative flex items-center gap-3 p-3 pr-5 bg-white border border-slate-200 shadow-2xl rounded-full transition-all hover:scale-105",
              menuOpen && "bg-slate-100 border-indigo-200"
            )}
          >
            {/* BOT ESCONDIDO (se asoma on hover en Desktop, a la izquierda en Mobile) */}
            <div className={cn(
              "absolute -z-10 pointer-events-none transition-all duration-500 w-32 h-32",
              // Estado oculto base
              "translate-y-12 scale-50 opacity-0",
              // COMPORTAMIENTO DESKTOP: Hover asoma arriba a la derecha
              "md:right-2 md:bottom-6 md:origin-bottom-right",
              "md:group-hover:translate-y-0 md:group-hover:scale-100 md:group-hover:-rotate-12 md:group-hover:opacity-100",
              // COMPORTAMIENTO MOBILE: Click asoma a la izquierda del botón principal
              "max-md:origin-bottom-right",
              menuOpen 
                ? "max-md:opacity-100 max-md:scale-100 max-md:-translate-x-4 max-md:right-full max-md:bottom-0" 
                : "max-md:right-0 max-md:bottom-0"
            )}>
              <div className="w-full h-full animate-bot-hover">
                <Image src="/images/NORMALBOT.png" alt="Bot Peeking" fill className="object-contain drop-shadow-2xl" />
              </div>
            </div>

            <div className={cn(
              "w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white transition-transform duration-300",
              menuOpen && "rotate-45"
            )}>
              <HelpCircle size={20} />
            </div>
            <span className="font-black text-xs uppercase tracking-widest text-slate-700">Ayuda IA</span>
          </button>
        </div>
      )}

      {/* COPILOTO CHAT */}
      {copilotOpen && userId && (
        <ProfesorAICopilot userId={userId} userName={userName} onClose={() => setCopilotOpen(false)} />
      )}
    </>,
    document.body
  );
}
