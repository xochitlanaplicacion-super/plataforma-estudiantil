"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useInstitucion } from '@/hooks/use-institucion';
import { motion, AnimatePresence } from 'framer-motion';

// Componente individual para cada bloque numérico con animación
function AnimatedNumber({ value, label, color }: { value: string | number; label: string; color: string }) {
  const displayValue = String(value).padStart(2, '0');
  
  return (
    <div className="flex flex-col items-center bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] border border-slate-100 p-4 min-w-[80px]">
      <div className="relative h-12 w-full overflow-hidden flex justify-center items-center">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={displayValue}
            initial={{ y: -30, opacity: 0, filter: 'blur(4px)' }}
            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            exit={{ y: 30, opacity: 0, filter: 'blur(4px)' }}
            transition={{ duration: 0.4, ease: 'backOut' }}
            className="absolute text-4xl font-black tabular-nums tracking-tighter"
            style={{ color }}
          >
            {displayValue}
          </motion.span>
        </AnimatePresence>
      </div>
      <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mt-2">
        {label}
      </span>
    </div>
  );
}

export function VigenciaPlataformaCard({ servicioPlataforma }: {
  servicioPlataforma: { estado: string | null; fecha_inicio: string | null }
}) {
  const { config: inst } = useInstitucion();
  const DURACION_SERVICIO_DIAS = 30;

  const [timeLeft, setTimeLeft] = useState({
    dias: 0,
    horas: 0,
    minutos: 0,
    segundos: 0,
    msRestantes: 0,
    porcentaje: 0
  });

  const fechaFin = useMemo(() => {
    if (!servicioPlataforma.fecha_inicio) return null;
    const inicio = new Date(servicioPlataforma.fecha_inicio + 'T00:00:00');
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + DURACION_SERVICIO_DIAS);
    return fin;
  }, [servicioPlataforma.fecha_inicio]);

  useEffect(() => {
    if (servicioPlataforma.estado !== 'SI' || !fechaFin) return;

    const tick = () => {
      const ahora = new Date();
      const diff = fechaFin.getTime() - ahora.getTime();
      
      if (diff <= 0) {
        setTimeLeft({ dias: 0, horas: 0, minutos: 0, segundos: 0, msRestantes: 0, porcentaje: 1 });
        return;
      }

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);

      const porcentaje = Math.max(0, Math.min(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) / DURACION_SERVICIO_DIAS));

      setTimeLeft({ dias: d, horas: h, minutos: m, segundos: s, msRestantes: diff, porcentaje });
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [fechaFin, servicioPlataforma.estado]);

  const getColorVigencia = (dias: number): string => {
    if (dias >= 21) return '#166534'; // verde oscuro
    if (dias >= 16) return '#22c55e'; // verde claro
    if (dias >= 11) return '#eab308'; // amarillo
    if (dias >= 6)  return '#f97316'; // naranja
    if (dias >= 3)  return '#ea580c'; // naranja oscuro
    return '#dc2626';                 // rojo
  };

  const formatFechaLarga = (date: Date | null): string => {
    if (!date) return '—';
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // SVG circular constants
  const RADIO = 60;
  const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
  const strokeColor = getColorVigencia(Math.ceil(timeLeft.msRestantes / (1000 * 60 * 60 * 24)));
  
  const textColor = inst?.color_primario || '#4A151F';
  
  const hasFecha = !!servicioPlataforma.fecha_inicio;

  if (servicioPlataforma.estado === 'NO') {
    return (
      <Card className="border-2 shadow-lg bg-red-50/60 border-red-300 transition-all duration-500">
         <CardContent className="py-6 flex flex-col md:flex-row items-center gap-6">
           <div className="w-[140px] h-[140px] rounded-full bg-red-100 border-4 border-red-300 flex flex-col items-center justify-center flex-shrink-0 shadow-inner">
             <ShieldOff className="text-red-500 mb-1" size={32} />
             <span className="text-[11px] font-black uppercase text-red-600 tracking-wider">Suspendido</span>
           </div>
           <div className="text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                <ShieldOff size={18} className="text-red-500" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">Pago de Servicio Plataforma</h3>
              </div>
              <h2 className="text-3xl font-black mt-1 mb-2 text-red-700">Servicio Vencido</h2>
              <p className="text-sm text-red-600 font-medium max-w-md">El servicio de la plataforma está suspendido. Por favor contacta al proveedor del software para renovar tu suscripción.</p>
           </div>
         </CardContent>
      </Card>
    );
  }

  if (!hasFecha) {
    return (
      <Card className="border-2 shadow-lg bg-amber-50/40 border-amber-200 transition-all duration-500">
         <CardContent className="py-6">
            <p className="text-sm text-amber-600 font-medium">Servicio activo sin fecha de inicio configurada.</p>
         </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white transition-all duration-500 overflow-hidden relative">
      {/* Fondo Glow sutil arriba a la derecha */}
      <div 
        className="absolute top-0 right-0 p-32 rounded-full blur-3xl opacity-10 pointer-events-none transform translate-x-1/3 -translate-y-1/3" 
        style={{ backgroundColor: strokeColor }}
      />
      
      <CardContent className="py-10 px-8 relative z-10">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-10 md:gap-14">
          
          {/* Lado Izquierdo: SVG Circular */}
          <div className="relative flex-shrink-0" style={{ width: 170, height: 170 }}>
            <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90 filter drop-shadow-lg">
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              {/* Track de fondo */}
              <circle
                cx="70" cy="70" r={RADIO}
                fill="none"
                stroke="#1e293b" // slate-800
                strokeWidth="10"
              />
              {/* Arco de progreso */}
              <circle
                cx="70" cy="70" r={RADIO}
                fill="none"
                stroke={strokeColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={CIRCUNFERENCIA}
                strokeDashoffset={CIRCUNFERENCIA * (1 - timeLeft.porcentaje)}
                style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                filter="url(#glow)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[2.75rem] leading-none font-black tabular-nums tracking-tighter" style={{ color: strokeColor }}>
                {Math.ceil(timeLeft.msRestantes / (1000 * 60 * 60 * 24))}
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 mt-1">
                Días
              </span>
            </div>
          </div>

          {/* Lado Derecho: Textos y Reloj */}
          <div className="flex-1 min-w-0 flex flex-col items-center md:items-start text-center md:text-left mt-2">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-3">
              <ShieldCheck size={18} className="text-emerald-500" />
              <h3 className="text-xs font-black uppercase tracking-widest text-emerald-500">
                Pago de Servicio Plataforma
              </h3>
            </div>
            
            <h2 
              className="text-3xl md:text-[2.5rem] font-black tracking-tight mb-4 leading-tight"
              style={{ color: textColor }}
            >
              Próximo vencimiento en curso
            </h2>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-8 mb-8">
              <p className="text-[13px] text-slate-500 font-medium">
                Inicio: <span className="font-bold" style={{ color: textColor }}>{formatFechaLarga(new Date(servicioPlataforma.fecha_inicio + 'T00:00:00'))}</span>
              </p>
              <p className="text-[13px] text-slate-500 font-medium">
                Vence el: <span className="font-bold" style={{ color: textColor }}>{formatFechaLarga(fechaFin)}</span>
              </p>
            </div>

            {/* Contador en tiempo real */}
            <div className="flex items-center gap-3">
              <AnimatedNumber value={timeLeft.horas} label="Horas" color={textColor} />
              <div className="text-2xl font-black text-slate-200 mb-6">:</div>
              <AnimatedNumber value={timeLeft.minutos} label="Minutos" color={textColor} />
              <div className="text-2xl font-black text-slate-200 mb-6">:</div>
              <AnimatedNumber value={timeLeft.segundos} label="Segundos" color={textColor} />
            </div>

          </div>
        </div>
      </CardContent>
    </Card>
  );
}
