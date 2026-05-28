"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sparkles, X, MessageSquare, HelpCircle, BookOpen } from "lucide-react";
import Image from "next/image";
import { AlumnoAICopilot } from "./AlumnoAICopilot";

type DialogStep = 'INIT' | 'CLOSED';

interface AlumnoAIAssistantProps {
  userId?: string;
  userName?: string;
}

export function AlumnoAIAssistant({ userId, userName }: AlumnoAIAssistantProps) {
  const [step, setStep] = useState<DialogStep>('CLOSED');
  const [isVisible, setIsVisible] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    const hasSeen = localStorage.getItem('alumno_ai_assistant_seen_v1');
    if (!hasSeen) {
      setTimeout(() => {
        setStep('INIT');
        setIsVisible(true);
      }, 1000);
    }
  }, []);

  const closeAndSave = () => {
    setIsVisible(false);
    setTimeout(() => setStep('CLOSED'), 500);
    localStorage.setItem('alumno_ai_assistant_seen_v1', 'true');
  };

  if (!hasMounted) return null;

  return createPortal(
    <>
      {/* TUTORIAL BOT OVERLAY */}
      <div 
        className={cn(
          "fixed inset-0 z-[99999] flex items-center justify-center transition-all duration-700 ease-in-out p-4",
          isVisible ? "opacity-100 pointer-events-auto backdrop-blur-md bg-slate-900/40" : "opacity-0 pointer-events-none"
        )}
      >
        <div 
          className={cn(
            "relative w-full max-w-5xl flex flex-col md:flex-row items-center gap-6 md:gap-8 transition-all duration-700",
            isVisible ? "scale-100 translate-y-0" : "scale-90 translate-y-20"
          )}
        >
          {/* SECCIÓN DEL BOT (Adaptado para móvil) */}
          <div className="relative flex flex-col items-center justify-center w-48 sm:w-64 md:w-[28rem] shrink-0 md:mt-0 mt-8">
            <div className="relative z-10 w-full aspect-square animate-bot-hover">
              <Image 
                src="/images/NORMALBOT.png" 
                alt="AI Assistant Bot" 
                fill
                className="object-contain drop-shadow-2xl"
                priority
              />
            </div>
            <div className="absolute -bottom-2 md:-bottom-4 w-32 md:w-40 h-6 md:h-8 rounded-[100%] bg-blue-400/30 blur-[20px] animate-pulse-fast shadow-[0_0_50px_20px_rgba(59,130,246,0.6)]" />
          </div>

          {/* BOCADILLO DE DIÁLOGO */}
          <div className="relative flex-1 bg-white rounded-3xl md:rounded-[32px] p-6 sm:p-8 md:p-10 shadow-2xl border-2 border-indigo-50 animate-in zoom-in-95 duration-500 w-full max-w-lg md:max-w-none">
            {/* Flecha para Desktop (Izquierda) */}
            <div className="absolute top-1/2 -left-6 transform -translate-y-1/2 hidden md:block w-0 h-0 border-y-[15px] border-y-transparent border-r-[25px] border-r-white" />
            
            {/* Flecha para Móvil (Arriba) */}
            <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 md:hidden w-0 h-0 border-x-[15px] border-x-transparent border-b-[20px] border-b-white" />

            <button onClick={closeAndSave} className="absolute top-4 right-4 md:top-6 md:right-6 text-slate-300 hover:text-slate-500 transition-colors">
              <X size={24} />
            </button>

            <div className="space-y-6 md:space-y-8">
              {step === 'INIT' && (
                <div className="space-y-6 md:space-y-8 animate-in slide-in-from-bottom-4 duration-500 text-center md:text-left mt-2 md:mt-0">
                  <div className="flex flex-col md:flex-row items-center gap-3 justify-center md:justify-start">
                    <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl shrink-0"><Sparkles size={28} /></div>
                    <h3 className="text-xl sm:text-2xl font-black uppercase text-slate-800 tracking-tight">¡Hola, {userName?.split(' ')[0] || 'Alumno'}!</h3>
                  </div>
                  
                  <div className="space-y-4 text-base sm:text-lg text-slate-600 font-medium leading-relaxed">
                    <p>
                      Me presento, soy el <strong className="text-indigo-600 font-black">Asistente IA 24/7</strong> de tu plataforma.
                    </p>
                    <p>
                      A partir de hoy estoy disponible para ayudarte a entender mejor cualquier tema visto en clase, explicarte conceptos difíciles, o simplemente charlar sobre tus dudas académicas en cualquier momento.
                    </p>
                  </div>

                  <div className="pt-4 flex justify-center md:justify-end">
                    <Button onClick={closeAndSave} className="w-full md:w-auto h-12 md:h-14 px-8 md:px-10 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-sm shadow-xl transition-transform hover:scale-105">
                      ¡Entendido, genial!
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* BOTÓN FLOTANTE */}
      {!isVisible && !copilotOpen && (
        <div className="fixed bottom-6 right-6 z-[99998] flex flex-col items-end gap-2">
          {menuOpen && (
            <div className="flex flex-col items-end gap-2 animate-in slide-in-from-bottom-4 duration-200">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setCopilotOpen(true);
                }}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 shadow-xl rounded-full hover:bg-slate-50 hover:scale-105 transition-all"
              >
                <span className="text-xs font-black uppercase tracking-widest text-slate-700">Chat Asistente</span>
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
            {/* BOT ESCONDIDO */}
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
            <span className="font-black text-xs uppercase tracking-widest text-slate-700">Asistente</span>
          </button>
        </div>
      )}

      {/* COPILOTO CHAT */}
      {copilotOpen && userId && (
        <AlumnoAICopilot userId={userId} userName={userName} onClose={() => setCopilotOpen(false)} />
      )}
    </>,
    document.body
  );
}
