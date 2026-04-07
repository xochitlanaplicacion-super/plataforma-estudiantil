
"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2, Clock, CreditCard, Bell, BellOff, Loader2, ChevronDown, ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { getPagosAlumnoPropio, getNotificacionesAlumno, marcarNotificacionLeida, marcarTodasLeidas } from '@/lib/actions/pagos';

// ─── Componente: Barra circular de progreso ──────────────────────────────────
function CircularProgress({ pct }: { pct: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct === 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={color} strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-black leading-none" style={{ color }}>{pct}%</span>
        <span className="text-[9px] font-bold text-muted-foreground uppercase">pagado</span>
      </div>
    </div>
  );
}

export default function MisPagosPage() {
  const { toast } = useToast();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [pagos, setPagos] = useState<any[]>([]);
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNotifs, setShowNotifs] = useState(false);
  const [expandedPrograma, setExpandedPrograma] = useState<string | null>(null);

  const fetchData = useCallback(async (uid: string) => {
    setLoading(true);
    const [resPagos, resNotifs] = await Promise.all([
      getPagosAlumnoPropio(uid),
      getNotificacionesAlumno(uid),
    ]);
    if (resPagos.success) {
      setPagos(resPagos.data);
      // Auto-expandir el primer programa con pendientes
      const programas = [...new Set(resPagos.data.map((p: any) => p.plan_pagos?.programa as string))];
      if (programas.length > 0) setExpandedPrograma(programas[0]);
    }
    if (resNotifs.success) setNotificaciones(resNotifs.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        fetchData(data.user.id);
      }
    });
  }, []);

  const noLeidas = notificaciones.filter(n => !n.leida).length;
  const programas = [...new Set(pagos.map((p: any) => p.plan_pagos?.programa as string))];

  const totalConceptos = pagos.length;
  const totalPagados = pagos.filter((p: any) => p.estatus === 'pagado').length;
  const totalPendientes = pagos.filter((p: any) => p.estatus === 'pendiente').length;
  const pct = totalConceptos > 0 ? Math.round((totalPagados / totalConceptos) * 100) : 0;

  const handleMarcarLeida = async (id: string) => {
    await marcarNotificacionLeida(id);
    setNotificaciones(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
  };

  const handleMarcarTodasLeidas = async () => {
    if (!userId) return;
    await marcarTodasLeidas(userId);
    setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
    toast({ title: 'Notificaciones marcadas como leídas.' });
  };

  const tipoColor: Record<string, string> = {
    pago_recibido: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    pago_pendiente: 'bg-amber-50 border-amber-200 text-amber-700',
    recordatorio: 'bg-blue-50 border-blue-200 text-blue-700',
    general: 'bg-gray-50 border-gray-200 text-gray-700',
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-primary flex items-center gap-2">
            <CreditCard size={28} /> Mis Pagos
          </h2>
          <p className="text-muted-foreground mt-1">Estado de tus conceptos de inscripción y colegiatura.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="relative gap-2"
          onClick={() => setShowNotifs(!showNotifs)}
        >
          <Bell size={16} />
          Notificaciones
          {noLeidas > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
              {noLeidas}
            </span>
          )}
        </Button>
      </div>

      {/* Panel de Notificaciones */}
      {showNotifs && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">🔔 Notificaciones</CardTitle>
              {noLeidas > 0 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleMarcarTodasLeidas}>
                  <BellOff size={12} /> Marcar todas como leídas
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto">
            {notificaciones.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin notificaciones.</p>
            ) : notificaciones.map(notif => (
              <div
                key={notif.id}
                className={cn(
                  'p-3 rounded-xl border text-sm transition-all cursor-pointer',
                  tipoColor[notif.tipo] || '',
                  notif.leida ? 'opacity-60' : 'shadow-sm'
                )}
                onClick={() => !notif.leida && handleMarcarLeida(notif.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold leading-tight">{notif.titulo}</p>
                  {!notif.leida && <div className="w-2 h-2 rounded-full bg-current shrink-0 mt-1" />}
                </div>
                <p className="text-xs mt-1 leading-relaxed opacity-90">{notif.cuerpo}</p>
                <p className="text-[10px] mt-2 opacity-60">
                  {new Date(notif.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={32} /></div>
      ) : pagos.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <CreditCard size={40} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="font-bold text-lg mb-2">Sin conceptos de pago asignados</h3>
            <p className="text-muted-foreground text-sm">Comunícate con Servicios Escolares para regularizar tu situación.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Resumen General */}
          <Card className="border-primary/20">
            <CardContent className="flex items-center gap-6 pt-6 flex-wrap">
              <CircularProgress pct={pct} />
              <Separator orientation="vertical" className="h-20 hidden sm:block" />
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-500" />
                  <span className="text-sm font-bold">{totalPagados} conceptos pagados</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-amber-500" />
                  <span className="text-sm font-bold">{totalPendientes} conceptos pendientes</span>
                </div>
                {pct === 100 && (
                  <Badge className="bg-emerald-500 text-white text-xs w-fit mt-1">🎉 ¡Al corriente!</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Conceptos por Programa */}
          <div className="space-y-4">
            {programas.map(prog => {
              const pagosProg = pagos
                .filter((p: any) => p.plan_pagos?.programa === prog)
                .sort((a: any, b: any) => (a.plan_pagos?.orden || 0) - (b.plan_pagos?.orden || 0));
              const pagados = pagosProg.filter((p: any) => p.estatus === 'pagado').length;
              const isOpen = expandedPrograma === prog;

              return (
                <Card key={prog} className={cn('overflow-hidden transition-all', isOpen ? 'shadow-md' : '')}>
                  <button
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedPrograma(isOpen ? null : prog)}
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard size={16} className="text-primary" />
                      <span className="font-black text-sm uppercase tracking-wider">{prog}</span>
                      <Badge variant="outline" className={cn('text-[10px]', pagados === pagosProg.length && pagados > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : '')}>
                        {pagados}/{pagosProg.length}
                      </Badge>
                    </div>
                    {isOpen ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                  </button>

                  {isOpen && (
                    <div className="border-t divide-y">
                      {pagosProg.map((pago: any) => (
                        <div
                          key={pago.id}
                          className={cn(
                            'flex items-center gap-4 px-6 py-4',
                            pago.estatus === 'pagado' ? 'bg-emerald-50/50' : 'bg-white'
                          )}
                        >
                          {pago.estatus === 'pagado' ? (
                            <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                          ) : (
                            <Clock size={20} className="text-amber-400 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-sm font-bold', pago.estatus === 'pagado' ? 'text-emerald-700' : 'text-gray-800')}>
                              {pago.plan_pagos?.nombre_concepto}
                            </p>
                            {pago.estatus === 'pagado' && (
                              <p className="text-[11px] text-emerald-600 mt-0.5">
                                Pagado el {pago.fecha_pago ? new Date(pago.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                                {pago.recibo ? ` · Recibo #${pago.recibo}` : ''}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {pago.plan_pagos?.monto && (
                              <span className="text-sm font-black text-gray-600">
                                ${Number(pago.plan_pagos.monto).toLocaleString('es-MX')}
                              </span>
                            )}
                            <Badge
                              className={cn('text-[10px]', pago.estatus === 'pagado' ? 'bg-emerald-500 text-white' : 'bg-amber-100 text-amber-700 border border-amber-200')}
                            >
                              {pago.estatus === 'pagado' ? '✅ PAGADO' : '⏳ PENDIENTE'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Aviso */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-5 pb-4">
              <p className="text-sm text-blue-700 font-medium leading-relaxed">
                <strong>ℹ️ ¿Tienes dudas sobre tus pagos?</strong> Comunícate con Servicios Escolares o visita nuestras instalaciones en horario de lunes a viernes de 9:00 AM a 6:00 PM.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
