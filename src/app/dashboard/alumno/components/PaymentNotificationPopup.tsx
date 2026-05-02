'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Check, CheckCheck, Bell, X, MessageCircle } from 'lucide-react';
import gsap from 'gsap';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  titulo: string;
  cuerpo: string;
  created_at: string;
}

interface Props {
  latestNotification: Notification | null;
}

export function PaymentNotificationPopup({ latestNotification }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  
  const bubbleRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const tl = useRef<gsap.core.Timeline>(null);

  useEffect(() => {
    if (!latestNotification) return;

    const storedId = localStorage.getItem('lastAckPaymentNotificationId');
    
    // Si la última notificación guardada es distinta a la actual, es nueva
    if (storedId !== latestNotification.id) {
      setHasUnread(true);
      setIsOpen(true);
      setIsAcknowledged(false);
    } else {
      setHasUnread(false);
      setIsOpen(false);
      setIsAcknowledged(true);
    }
  }, [latestNotification]);

  // Animaciones GSAP
  useEffect(() => {
    if (!latestNotification) return;

    if (isOpen) {
      // Animar entrada de la burbuja tipo mensaje de WhatsApp
      gsap.fromTo(bubbleRef.current,
        { opacity: 0, scale: 0.8, y: 20, transformOrigin: "bottom right" },
        { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.5)" }
      );
    } else if (!isOpen && bubbleRef.current) {
      // Animar salida
      gsap.to(bubbleRef.current, {
        opacity: 0,
        scale: 0.8,
        y: 20,
        duration: 0.3,
        ease: "power2.in"
      });
    }
  }, [isOpen, latestNotification]);

  const handleAcknowledge = () => {
    if (!latestNotification) return;
    
    // Guardar en local storage
    localStorage.setItem('lastAckPaymentNotificationId', latestNotification.id);
    setIsAcknowledged(true);
    setHasUnread(false);
    
    // Cerramos el popup
    setIsOpen(false);
  };

  const toggleOpen = () => {
    if (!isOpen) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  if (!latestNotification) return null;

  return (
    <div className="relative flex items-center justify-center z-50">
      {/* Icono de Campana / Mensaje (siempre visible cuando está cerrado o abierto) */}
      <button
        ref={iconRef}
        onClick={toggleOpen}
        className={cn(
          "relative p-3 rounded-full transition-all hover:bg-slate-100",
          isOpen ? "bg-slate-100 text-primary" : "bg-white border border-border shadow-sm text-slate-600 hover:shadow-md"
        )}
      >
        <MessageCircle size={24} className={hasUnread && !isOpen ? "animate-pulse text-green-600" : ""} />
        {hasUnread && !isOpen && (
          <span className="absolute top-0 right-0 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 border-2 border-white"></span>
          </span>
        )}
      </button>

      {/* Burbuja de chat flotante */}
      <div 
        ref={bubbleRef}
        className={cn(
          // Móvil: fixed centrado en pantalla. Desktop: absoluto anclado al icono
          "fixed inset-x-4 top-20 z-50 pointer-events-auto",
          "md:absolute md:inset-x-auto md:top-full md:right-0 md:mt-4 md:w-96",
          "w-auto drop-shadow-2xl",
          isOpen ? "block" : "hidden"
        )}
      >
        {/* Triangulito: solo visible en desktop */}
        <div className="hidden md:block absolute -top-2 right-4 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[12px] border-b-green-500"></div>
        
        <div className="bg-white rounded-2xl overflow-hidden border border-border shadow-xl">
          {/* Header tipo WhatsApp */}
          <div className="bg-green-500 text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                <Bell size={16} className="text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold leading-tight">Control Escolar</span>
                <span className="text-[10px] text-green-100 font-medium">Aviso de pago</span>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Cuerpo del mensaje */}
          <div className="p-5 bg-[url('/images/whatsapp-bg.png')] bg-cover bg-center">
            <div className="bg-white p-4 rounded-xl rounded-tl-none shadow-sm border border-slate-100 relative">
              <h4 className="text-sm font-bold text-slate-800 mb-1">{latestNotification.titulo}</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                {latestNotification.cuerpo}
              </p>
              <div className="flex justify-end items-center gap-1 mt-2">
                <span className="text-[10px] text-slate-400 font-medium">
                  {new Date(latestNotification.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {isAcknowledged ? (
                  <CheckCheck size={14} className="text-blue-500" />
                ) : (
                  <Check size={14} className="text-slate-400" />
                )}
              </div>
            </div>
          </div>

          {/* Botón de acción */}
          {!isAcknowledged && (
            <div className="p-3 bg-slate-50 border-t border-slate-100">
              <button
                onClick={handleAcknowledge}
                className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl text-sm transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
              >
                <CheckCheck size={18} />
                Marcar como enterado
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
