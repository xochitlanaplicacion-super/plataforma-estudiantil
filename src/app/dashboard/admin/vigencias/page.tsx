
"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Users, CheckCircle2, Clock, Send, Plus, Trash2, Loader2, ChevronDown, ChevronUp, BarChart3, Pencil, DollarSign, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getTodosLosAlumnosConPagos, getPagosAlumno, registrarPago,
  enviarRecordatorioPago, getPlanPagos, createConceptoPago,
  deleteConceptoPago, updateConceptoPago, inicializarPagosAlumno,
  getPrograms, registrarAbono, getAbonosConcepto, deleteAbono, deletePrograma
} from '@/lib/actions/pagos';

// ─── Barra de Progreso ───────────────────────────────────────────────────────
function ProgressBar({ valor, total, mostrarTexto = true }: { valor: number; total: number; mostrarTexto?: boolean }) {
  const pct = total > 0 ? Math.min(Math.round((valor / total) * 100), 100) : 0;
  const color = pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : pct > 0 ? 'bg-blue-400' : 'bg-gray-200';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={cn('h-2 rounded-full transition-all duration-500', pct > 0 ? color : '')} style={{ width: `${pct}%` }} />
      </div>
      {mostrarTexto && <span className="text-xs font-bold text-muted-foreground shrink-0">{Math.floor(valor)}/{total}</span>}
    </div>
  );
}

// ─── Barra de Progreso de Concepto (mini) ───────────────────────────────────
function ConceptProgressBar({ pagado, total }: { pagado: number; total: number }) {
  if (!total || total === 0) return null;
  const pct = Math.min((pagado / total) * 100, 100);
  const color = pct >= 100 ? 'bg-emerald-500' : 'bg-blue-400';
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
        <span>${pagado.toLocaleString('es-MX')} pagados</span>
        <span>Saldo: ${Math.max(total - pagado, 0).toLocaleString('es-MX')}</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={cn('h-1.5 rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Modal Abono ─────────────────────────────────────────────────────────────
function ModalAbono({ pago, alumnoId, open, onClose, onSuccess }: any) {
  const { toast } = useToast();
  const [form, setForm] = useState({ monto: '', fecha: new Date().toISOString().split('T')[0], recibo: '', notas: '' });
  const [loading, setLoading] = useState(false);
  const [abonos, setAbonos] = useState<any[]>([]);
  const [loadingAbonos, setLoadingAbonos] = useState(false);

  const montoPlan = pago?.plan_pagos?.monto ? Number(pago.plan_pagos.monto) : null;
  const sumaActual = pago?.monto_pagado ? Number(pago.monto_pagado) : 0;
  const saldo = montoPlan ? Math.max(montoPlan - sumaActual, 0) : null;

  const fetchAbonos = useCallback(async () => {
    if (!pago) return;
    setLoadingAbonos(true);
    const res = await getAbonosConcepto(pago.id);
    if (res.success) setAbonos(res.data);
    setLoadingAbonos(false);
  }, [pago]);

  useEffect(() => { if (open) { fetchAbonos(); setForm({ monto: saldo?.toString() || '', fecha: new Date().toISOString().split('T')[0], recibo: '', notas: '' }); } }, [open, fetchAbonos]);

  const handleSubmit = async () => {
    const montoNum = parseFloat(form.monto);
    if (!montoNum || montoNum <= 0) { toast({ variant: 'destructive', title: 'Monto inválido' }); return; }
    setLoading(true);
    const res = await registrarAbono({
      pagoAlumnoId: pago.id,
      alumnoId,
      planPagoId: pago.plan_pago_id,
      monto: montoNum,
      fecha: form.fecha,
      recibo: form.recibo || undefined,
      notas: form.notas || undefined,
    });
    if (res.success) {
      toast({ title: '✅ Abono registrado', description: (res as any).nuevoEstatus === 'pagado' ? '¡Concepto cubierto en su totalidad!' : `Suma actual: $${(res as any).sumaAbonos?.toLocaleString('es-MX')}` });
      fetchAbonos();
      onSuccess();
      setForm(f => ({ ...f, monto: '' }));
    } else { toast({ variant: 'destructive', title: 'Error', description: (res as any).error }); }
    setLoading(false);
  };

  const handleDeleteAbono = async (abonoId: string) => {
    if (!confirm('¿Eliminar este abono?')) return;
    const res = await deleteAbono(abonoId, pago.id, alumnoId, pago.plan_pago_id);
    if (res.success) { toast({ title: 'Abono eliminado' }); fetchAbonos(); onSuccess(); }
    else toast({ variant: 'destructive', title: 'Error', description: (res as any).error });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>💳 Abonos: {pago?.plan_pagos?.nombre_concepto}</DialogTitle>
          <DialogDescription>Registra pagos parciales para este concepto.</DialogDescription>
        </DialogHeader>

        {/* Barra de progreso del concepto */}
        {montoPlan && (
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="flex justify-between text-sm font-bold mb-2">
              <span>Pagado: <span className="text-emerald-600">${sumaActual.toLocaleString('es-MX')}</span></span>
              <span>Total: <span className="text-primary">${montoPlan.toLocaleString('es-MX')}</span></span>
            </div>
            <ConceptProgressBar pagado={sumaActual} total={montoPlan} />
            {saldo !== null && saldo > 0 && (
              <p className="text-xs text-red-500 font-bold mt-2 text-center">Saldo pendiente: ${saldo.toLocaleString('es-MX')}</p>
            )}
            {saldo === 0 && <p className="text-xs text-emerald-600 font-black mt-2 text-center">✅ ¡Concepto cubierto en su totalidad!</p>}
          </div>
        )}

        {/* Historial de abonos */}
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-2">Historial de Abonos</p>
          {loadingAbonos ? <Loader2 className="animate-spin mx-auto" size={16} /> : abonos.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Sin abonos registrados aún.</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {abonos.map((a: any) => (
                <div key={a.id} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-emerald-600">${Number(a.monto).toLocaleString('es-MX')}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{new Date(a.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    {a.recibo && <span className="text-[10px] text-muted-foreground ml-1">· #{a.recibo}</span>}
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleDeleteAbono(a.id)}><Trash2 size={10} /></Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Formulario nuevo abono */}
        <div className="border-t pt-4 space-y-3">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Nuevo Abono</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Monto ($) *</Label>
              <Input type="number" placeholder={saldo ? saldo.toString() : '0.00'} value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-xs">No. Recibo / Folio <span className="text-muted-foreground">(opcional)</span></Label>
            <Input placeholder="Opcional" value={form.recibo} onChange={e => setForm(f => ({ ...f, recibo: e.target.value }))} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={handleSubmit} disabled={loading || !form.monto} className="bg-blue-600 hover:bg-blue-700 text-white">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            Registrar Abono
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal Pagos del Alumno ──────────────────────────────────────────────────
function ModalPagosAlumno({ alumno, open, onClose, onUpdate, programasDisponibles }: any) {
  const { toast } = useToast();
  const [pagos, setPagos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [editando, setEditando] = useState<any | null>(null);
  const [abonoTarget, setAbonoTarget] = useState<any | null>(null);
  const [form, setForm] = useState({ fecha_pago: '', monto_pagado: '', recibo: '', notas: '' });

  const fetchPagos = useCallback(async () => {
    if (!alumno) return;
    setLoading(true);
    const res = await getPagosAlumno(alumno.id);
    setPagos(res.data);
    setLoading(false);
  }, [alumno]);

  useEffect(() => { if (open) fetchPagos(); }, [open, fetchPagos]);

  const handleTogglePago = async (pago: any) => {
    if (pago.estatus === 'pagado') {
      setSaving(pago.id);
      const res = await registrarPago({ alumnoId: alumno.id, planPagoId: pago.plan_pago_id, estatus: 'pendiente' });
      if (res.success) { fetchPagos(); onUpdate(); } else toast({ variant: 'destructive', title: 'Error', description: (res as any).error });
      setSaving(null);
    } else {
      setEditando(pago);
      setForm({ fecha_pago: new Date().toISOString().split('T')[0], monto_pagado: pago.plan_pagos?.monto?.toString() || '', recibo: '', notas: '' });
    }
  };

  const handleGuardarPago = async () => {
    if (!editando) return;
    setSaving(editando.id);
    const res = await registrarPago({
      alumnoId: alumno.id, planPagoId: editando.plan_pago_id, estatus: 'pagado',
      fechaPago: form.fecha_pago, montoPagado: form.monto_pagado ? parseFloat(form.monto_pagado) : undefined,
      recibo: form.recibo, notas: form.notas,
    });
    if (res.success) { toast({ title: 'Pago completo registrado ✅' }); setEditando(null); fetchPagos(); onUpdate(); }
    else toast({ variant: 'destructive', title: 'Error', description: (res as any).error });
    setSaving(null);
  };

  const detectarPrograma = () => {
    const nivel = (alumno?.carreras?.niveles?.nombre || '').toUpperCase();
    const carrera = (alumno?.carreras?.nombre || '').toUpperCase();
    if (nivel.includes('BACHILLERATO') || nivel.includes('PREPARATORIA')) {
      return carrera.includes('ADULTO') || carrera.includes('2 MESES') ? 'BACHILLERATO ADULTOS' : 'PREPA JOVEN';
    }
    if (nivel.includes('UNIVERSIDAD')) return 'UNIVERSIDAD - LICENCIATURA';
    if (nivel.includes('CAPACITAC')) return 'CAPACITACIONES';
    return null;
  };

  const programaDetectado = detectarPrograma();
  const programas = [...new Set(pagos.map((p: any) => p.plan_pagos?.programa as string))];

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>💳 {alumno?.nombre} {alumno?.apellidos}</DialogTitle>
            <DialogDescription className="flex flex-wrap gap-2 mt-1">
              <Badge variant="outline">{alumno?.matricula || 'Sin matrícula'}</Badge>
              <Badge variant="secondary">{alumno?.carreras?.nombre || '—'}</Badge>
              <Badge variant="secondary">{alumno?.carreras?.niveles?.nombre || '—'}</Badge>
            </DialogDescription>
          </DialogHeader>

          {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
          : pagos.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <p className="text-sm text-muted-foreground">Este alumno no tiene conceptos asignados.</p>
              {programaDetectado && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-blue-700 mb-3">Programa detectado automáticamente:</p>
                  <p className="text-base font-black text-blue-900 mb-3">{programaDetectado}</p>
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={async () => {
                    setLoading(true);
                    await inicializarPagosAlumno(alumno.id, programaDetectado);
                    fetchPagos(); onUpdate();
                  }}>
                    <Plus size={16} /> Inicializar conceptos automáticamente
                  </Button>
                </div>
              )}
              <div className="flex gap-2 flex-wrap justify-center">
                {programasDisponibles.filter((p: string) => p !== programaDetectado).map((prog: string) => (
                  <Button key={prog} size="sm" variant="outline" onClick={async () => {
                    setLoading(true);
                    await inicializarPagosAlumno(alumno.id, prog);
                    fetchPagos(); onUpdate();
                  }}>{prog}</Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {programas.map(prog => {
                const pagosProg = pagos.filter((p: any) => p.plan_pagos?.programa === prog)
                  .sort((a: any, b: any) => (a.plan_pagos?.orden || 0) - (b.plan_pagos?.orden || 0));
                const pagados = pagosProg.filter((p: any) => p.estatus === 'pagado').length;
                const abonos = pagosProg.filter((p: any) => p.estatus === 'abono').length;
                return (
                  <div key={prog}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-black uppercase tracking-widest text-primary">{prog}</h4>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {abonos > 0 && <Badge variant="outline" className="text-[9px] bg-blue-50 border-blue-200 text-blue-600">{abonos} en abono</Badge>}
                        <span>{pagados}/{pagosProg.length} pagados</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {pagosProg.map((pago: any) => {
                        const montoPlan = pago.plan_pagos?.monto ? Number(pago.plan_pagos.monto) : null;
                        const montoPagado = pago.monto_pagado ? Number(pago.monto_pagado) : 0;
                        const isAbono = pago.estatus === 'abono';
                        return (
                          <div key={pago.id} className={cn(
                            'rounded-xl border transition-all p-3',
                            pago.estatus === 'pagado' ? 'bg-emerald-50 border-emerald-200' :
                            isAbono ? 'bg-blue-50 border-blue-200' : 'bg-white border-dashed border-gray-200'
                          )}>
                            <div className="flex items-center gap-3">
                              {saving === pago.id ? <Loader2 size={18} className="animate-spin shrink-0" /> :
                               pago.estatus === 'pagado' ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0 cursor-pointer" onClick={() => handleTogglePago(pago)} /> :
                               isAbono ? <div className="w-[18px] h-[18px] rounded-full border-2 border-blue-400 bg-blue-100 shrink-0" /> :
                               <Clock size={18} className="text-gray-400 shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <p className={cn('text-sm font-bold', pago.estatus === 'pagado' ? 'text-emerald-700' : isAbono ? 'text-blue-700' : 'text-gray-700')}>
                                  {pago.plan_pagos?.nombre_concepto}
                                </p>
                                {isAbono && montoPlan && <ConceptProgressBar pagado={montoPagado} total={montoPlan} />}
                                {pago.estatus === 'pagado' && pago.fecha_pago && (
                                  <p className="text-[10px] text-emerald-600">
                                    {new Date(pago.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX')}
                                    {pago.recibo ? ` · #${pago.recibo}` : ''}
                                    {pago.monto_pagado ? ` · $${Number(pago.monto_pagado).toLocaleString('es-MX')}` : ''}
                                  </p>
                                )}
                              </div>
                              {montoPlan && pago.estatus !== 'pagado' && (
                                <span className="text-xs font-bold text-gray-500 shrink-0">${montoPlan.toLocaleString('es-MX')}</span>
                              )}
                              <div className="flex gap-1 shrink-0">
                                {pago.estatus !== 'pagado' && (
                                  <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 border-blue-300 text-blue-600 hover:bg-blue-50" onClick={() => setAbonoTarget(pago)}>
                                    + Abono
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" className={cn('h-7 text-[10px] px-2', pago.estatus === 'pagado' ? 'border-red-200 text-red-500 hover:bg-red-50' : 'hover:bg-muted')} onClick={() => handleTogglePago(pago)}>
                                  {pago.estatus === 'pagado' ? <Minus size={10} /> : <CheckCircle2 size={10} />}
                                  {pago.estatus === 'pagado' ? 'Revertir' : 'Completo'}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Pago Completo */}
      <Dialog open={!!editando} onOpenChange={() => setEditando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Pago Completo</DialogTitle><DialogDescription>{editando?.plan_pagos?.nombre_concepto}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Fecha de Pago</Label><Input type="date" value={form.fecha_pago} onChange={e => setForm(f => ({ ...f, fecha_pago: e.target.value }))} /></div>
            <div><Label>Monto Pagado ($)</Label><Input type="number" value={form.monto_pagado} onChange={e => setForm(f => ({ ...f, monto_pagado: e.target.value }))} /></div>
            <div><Label>No. Recibo / Folio</Label><Input placeholder="Opcional" value={form.recibo} onChange={e => setForm(f => ({ ...f, recibo: e.target.value }))} /></div>
            <div><Label>Notas</Label><Textarea placeholder="Opcional" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={handleGuardarPago} disabled={!!saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} Confirmar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Abono */}
      {abonoTarget && (
        <ModalAbono pago={abonoTarget} alumnoId={alumno?.id} open={!!abonoTarget} onClose={() => setAbonoTarget(null)} onSuccess={() => { fetchPagos(); onUpdate(); }} />
      )}
    </>
  );
}

// ─── Fila de Concepto con edición inline ────────────────────────────────────
function ConceptoRow({ concepto, onDelete, onUpdate }: { concepto: any; onDelete: (id: string, nombre: string) => void; onUpdate: () => void }) {
  const { toast } = useToast();
  const [editando, setEditando] = useState(false);
  const [monto, setMonto] = useState(concepto.monto?.toString() || '');
  const [guardando, setGuardando] = useState(false);

  const handleGuardar = async () => {
    setGuardando(true);
    const res = await updateConceptoPago(concepto.id, { monto: monto ? parseFloat(monto) : null });
    if (res.success) { toast({ title: 'Monto actualizado ✅' }); setEditando(false); onUpdate(); }
    else toast({ variant: 'destructive', title: 'Error', description: res.error });
    setGuardando(false);
  };

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20">
      <span className="text-[10px] font-bold text-muted-foreground w-6 text-center">{concepto.orden}</span>
      <span className="flex-1 text-sm font-semibold">{concepto.nombre_concepto}</span>
      {editando ? (
        <div className="flex items-center gap-2">
          <Input type="number" className="h-7 w-28 text-xs" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" />
          <Button size="sm" className="h-7 text-xs px-3" onClick={handleGuardar} disabled={guardando}>{guardando ? <Loader2 size={12} className="animate-spin" /> : 'OK'}</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditando(false)}>✕</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-primary cursor-pointer hover:underline" onClick={() => setEditando(true)}>
            {concepto.monto ? `$${Number(concepto.monto).toLocaleString('es-MX')}` : <span className="text-muted-foreground text-xs">Sin precio</span>}
          </span>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => setEditando(true)}><Pencil size={12} /></Button>
        </div>
      )}
      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => onDelete(concepto.id, concepto.nombre_concepto)}><Trash2 size={12} /></Button>
    </div>
  );
}

// ─── Página Principal ────────────────────────────────────────────────────────
export default function ControlVigenciasPage() {
  const { toast } = useToast();
  const [alumnos, setAlumnos] = useState<any[]>([]);
  const [planPagos, setPlanPagos] = useState<any[]>([]);
  const [programas, setProgramas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroPrograma, setFiltroPrograma] = useState('todos');
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState<any | null>(null);
  const [enviandoRecordatorio, setEnviandoRecordatorio] = useState<string | null>(null);

  // Gestión Plan
  const [modalConcepto, setModalConcepto] = useState(false);
  const [modalPrograma, setModalPrograma] = useState(false);
  const [modalBorrarPrograma, setModalBorrarPrograma] = useState<string | null>(null);
  const [confirmacionBorrar, setConfirmacionBorrar] = useState('');
  const [nuevoPrograma, setNuevoPrograma] = useState('');
  const [nuevoConcepto, setNuevoConcepto] = useState({ programa: '', nombre_concepto: '', orden: '', monto: '' });
  const [guardando, setGuardando] = useState(false);
  const [expandedPrograma, setExpandedPrograma] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [resAlumnos, resPlan, resProgramas] = await Promise.all([getTodosLosAlumnosConPagos(), getPlanPagos(), getPrograms()]);
    if (resAlumnos.success) setAlumnos(resAlumnos.data);
    if (resPlan.success) setPlanPagos(resPlan.data);
    if (resProgramas.success) setProgramas(resProgramas.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const alumnosFiltrados = alumnos.filter(a => {
    const nombre = `${a.nombre} ${a.apellidos}`.toLowerCase();
    const matchB = nombre.includes(busqueda.toLowerCase()) || (a.matricula || '').includes(busqueda);
    const nivel = (a.carreras?.niveles?.nombre || '').toLowerCase();
    const carrera = (a.carreras?.nombre || '').toLowerCase();
    const matchP = filtroPrograma === 'todos' || (
      filtroPrograma === 'PREPA JOVEN' ? carrera.includes('joven') :
      filtroPrograma === 'BACHILLERATO ADULTOS' ? (carrera.includes('adulto') || carrera.includes('2 meses')) :
      filtroPrograma === 'UNIVERSIDAD - LICENCIATURA' ? nivel.includes('universidad') :
      filtroPrograma === 'CAPACITACIONES' ? nivel.includes('capacitac') : true
    );
    return matchB && matchP;
  });

  const stats = {
    total: alumnos.length,
    alDia: alumnos.filter(a => a.conceptos_pendientes === 0 && a.total_conceptos > 0 && a.conceptos_abono === 0).length,
    conPendientes: alumnos.filter(a => a.conceptos_pendientes > 0 || a.conceptos_abono > 0).length,
    sinAsignar: alumnos.filter(a => a.total_conceptos === 0).length,
  };

  const handleRecordatorio = async (alumno: any) => {
    setEnviandoRecordatorio(alumno.id);
    const res = await enviarRecordatorioPago(alumno.id);
    if (res.success) toast({ title: '📧 Recordatorio enviado', description: `Se notificó a ${alumno.nombre}.` });
    else toast({ variant: 'destructive', title: 'Error', description: (res as any).error });
    setEnviandoRecordatorio(null);
  };

  const handleBorrarPrograma = async () => {
    if (confirmacionBorrar !== 'BORRAR' || !modalBorrarPrograma) return;
    setGuardando(true);
    const res = await deletePrograma(modalBorrarPrograma);
    if (res.success) {
      toast({ title: `Programa eliminado` });
      setModalBorrarPrograma(null);
      setConfirmacionBorrar('');
      fetchData();
      if (expandedPrograma === modalBorrarPrograma) setExpandedPrograma(null);
    } else toast({ variant: 'destructive', title: 'Error', description: res.error });
    setGuardando(false);
  };

  const handleCrearPrograma = async () => {
    if (!nuevoPrograma.trim()) return;
    const nombre = nuevoPrograma.toUpperCase().trim();
    setGuardando(true);
    // Crear el primer concepto dummy para "registrar" el programa
    const res = await createConceptoPago({ programa: nombre, nombre_concepto: 'INSCRIPCIÓN', orden: 1, monto: null });
    if (res.success) {
      toast({ title: `Programa "${nombre}" creado`, description: 'Ahora puedes añadir sus conceptos de pago.' });
      setModalPrograma(false);
      setNuevoPrograma('');
      fetchData();
      setExpandedPrograma(nombre);
    } else toast({ variant: 'destructive', title: 'Error', description: res.error });
    setGuardando(false);
  };

  const handleCrearConcepto = async () => {
    if (!nuevoConcepto.nombre_concepto.trim() || !nuevoConcepto.programa || !nuevoConcepto.orden) return;
    setGuardando(true);
    const res = await createConceptoPago({ programa: nuevoConcepto.programa, nombre_concepto: nuevoConcepto.nombre_concepto, orden: parseInt(nuevoConcepto.orden), monto: nuevoConcepto.monto ? parseFloat(nuevoConcepto.monto) : null });
    if (res.success) { toast({ title: 'Concepto creado ✅' }); setModalConcepto(false); setNuevoConcepto({ programa: programas[0] || '', nombre_concepto: '', orden: '', monto: '' }); fetchData(); }
    else toast({ variant: 'destructive', title: 'Error', description: res.error });
    setGuardando(false);
  };

  const handleEliminarConcepto = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar el concepto "${nombre}"?`)) return;
    const res = await deleteConceptoPago(id);
    if (res.success) { toast({ title: 'Concepto eliminado' }); fetchData(); }
    else toast({ variant: 'destructive', title: 'No se pudo eliminar', description: res.error });
  };

  const programasConConceptos = programas.map(prog => ({
    nombre: prog,
    conceptos: planPagos.filter(p => p.programa === prog).sort((a, b) => a.orden - b.orden),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-primary flex items-center gap-2"><CreditCard size={28} /> Control de Pagos</h2>
        <p className="text-muted-foreground">Seguimiento de inscripciones y colegiaturas con sistema de abonos.</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Alumnos Activos', value: stats.total, color: 'text-blue-600', bg: 'bg-blue-50', icon: <Users size={18} /> },
          { label: 'Al Corriente', value: stats.alDia, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: <CheckCircle2 size={18} /> },
          { label: 'Con Pendientes', value: stats.conPendientes, color: 'text-amber-600', bg: 'bg-amber-50', icon: <Clock size={18} /> },
          { label: 'Sin Asignar', value: stats.sinAsignar, color: 'text-slate-500', bg: 'bg-slate-100', icon: <BarChart3 size={18} /> },
        ].map((s, i) => (
          <Card key={i}><CardContent className="flex items-center gap-4 pt-5">
            <div className={cn('p-2 rounded-xl', s.bg, s.color)}>{s.icon}</div>
            <div><p className="text-2xl font-black">{loading ? '—' : s.value}</p><p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{s.label}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="alumnos">
        <TabsList className="mb-6">
          <TabsTrigger value="alumnos">👥 Alumnos y Pagos</TabsTrigger>
          <TabsTrigger value="plan">📋 Plan de Pagos</TabsTrigger>
        </TabsList>

        <TabsContent value="alumnos">
          <Card>
            <CardHeader>
              <CardTitle>Estado de Pagos por Alumno</CardTitle>
              <CardDescription>Haz clic en "Gestionar" para ver conceptos, registrar pagos o agregar abonos.</CardDescription>
              <div className="flex gap-3 flex-wrap mt-3">
                <Input placeholder="Buscar por nombre o matrícula..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="max-w-xs" />
                <Select value={filtroPrograma} onValueChange={setFiltroPrograma}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los programas</SelectItem>
                    {programas.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Alumno</TableHead>
                      <TableHead>Programa</TableHead>
                      <TableHead>Progreso de Pagos</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alumnosFiltrados.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No se encontraron alumnos.</TableCell></TableRow>
                    ) : alumnosFiltrados.map(alumno => (
                      <TableRow key={alumno.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-semibold text-sm">{alumno.nombre} {alumno.apellidos}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{alumno.matricula || 'Sin matrícula'}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">{alumno.carreras?.niveles?.nombre || '—'}</Badge>
                          <div className="text-[10px] text-muted-foreground mt-1">{alumno.carreras?.nombre || '—'}</div>
                        </TableCell>
                        <TableCell className="min-w-[200px]">
                          {alumno.total_conceptos === 0 ? (
                            <span className="text-[10px] text-muted-foreground italic">Sin conceptos asignados</span>
                          ) : (
                            <>
                              <ProgressBar valor={alumno.progreso_ponderado || 0} total={alumno.total_conceptos} />
                              {alumno.conceptos_abono > 0 && (
                                <span className="text-[10px] text-blue-500 font-bold">{alumno.conceptos_abono} en abono parcial</span>
                              )}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setAlumnoSeleccionado(alumno)}><Pencil size={12} /> Gestionar</Button>
                            {(alumno.conceptos_pendientes > 0 || alumno.conceptos_abono > 0) && (
                              <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-amber-400 text-amber-600 hover:bg-amber-50" disabled={enviandoRecordatorio === alumno.id} onClick={() => handleRecordatorio(alumno)}>
                                {enviandoRecordatorio === alumno.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Recordatorio
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plan">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div><CardTitle>Plan de Pagos por Programa</CardTitle><CardDescription>Define conceptos y precios. Crea nuevos programas según la oferta educativa.</CardDescription></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setModalPrograma(true)}><Plus size={16} /> Nuevo Programa</Button>
                  <Button size="sm" className="gap-1" onClick={() => { 
                    const p = programas[0] || '';
                    const maxOrden = planPagos.filter(x => x.programa === p).reduce((max, x) => Math.max(max, x.orden), 0);
                    setNuevoConcepto({ programa: p, nombre_concepto: '', orden: (maxOrden + 1).toString(), monto: '' }); 
                    setModalConcepto(true); 
                  }}><Plus size={16} /> Nuevo Concepto</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {programasConConceptos.map(prog => (
                <div key={prog.nombre} className="border rounded-xl overflow-hidden">
                  <div className="w-full flex items-center justify-between px-5 py-4 bg-muted/40 hover:bg-muted/60 transition-colors">
                    <button className="flex-1 flex items-center gap-3 text-left" onClick={() => setExpandedPrograma(expandedPrograma === prog.nombre ? null : prog.nombre)}>
                      <DollarSign size={16} className="text-primary" />
                      <span className="font-black text-sm uppercase tracking-wider">{prog.nombre}</span>
                      <Badge variant="outline" className="text-[10px]">{prog.conceptos.length} conceptos</Badge>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => { setModalBorrarPrograma(prog.nombre); setConfirmacionBorrar(''); }}>
                        <Trash2 size={16} />
                      </Button>
                      <button onClick={() => setExpandedPrograma(expandedPrograma === prog.nombre ? null : prog.nombre)}>
                        {expandedPrograma === prog.nombre ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>
                  {expandedPrograma === prog.nombre && (
                    <div className="divide-y">
                      {prog.conceptos.length === 0 ? (
                        <p className="text-center py-6 text-sm text-muted-foreground">Sin conceptos. Usa "Nuevo Concepto" para añadir.</p>
                      ) : prog.conceptos.map(c => <ConceptoRow key={c.id} concepto={c} onDelete={handleEliminarConcepto} onUpdate={fetchData} />)}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modales */}
      {alumnoSeleccionado && (
        <ModalPagosAlumno alumno={alumnoSeleccionado} open={!!alumnoSeleccionado} onClose={() => setAlumnoSeleccionado(null)} onUpdate={fetchData} programasDisponibles={programas} />
      )}

      {/* Modal Nuevo Programa */}
      <Dialog open={modalPrograma} onOpenChange={setModalPrograma}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Programa de Pago</DialogTitle><DialogDescription>Se creará el nuevo programa con un concepto inicial "INSCRIPCIÓN". Podrás añadir más conceptos después.</DialogDescription></DialogHeader>
          <div>
            <Label>Nombre del Programa</Label>
            <Input placeholder="Ej: CURSOS DE INGLÉS PARA TITULACIÓN" value={nuevoPrograma} onChange={e => setNuevoPrograma(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCrearPrograma()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalPrograma(false)}>Cancelar</Button>
            <Button onClick={handleCrearPrograma} disabled={guardando || !nuevoPrograma.trim()}>
              {guardando ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Crear Programa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nuevo Concepto */}
      <Dialog open={modalConcepto} onOpenChange={setModalConcepto}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Concepto de Pago</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Programa</Label>
              <Select value={nuevoConcepto.programa} onValueChange={v => {
                const maxOrden = planPagos.filter(x => x.programa === v).reduce((max, x) => Math.max(max, x.orden), 0);
                setNuevoConcepto(n => ({ ...n, programa: v, orden: (maxOrden + 1).toString() }))
              }}>
                <SelectTrigger><SelectValue placeholder="Selecciona un programa" /></SelectTrigger>
                <SelectContent>{programas.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Nombre del Concepto</Label><Input placeholder="Ej: MENSUALIDAD 5" value={nuevoConcepto.nombre_concepto} onChange={e => setNuevoConcepto(n => ({ ...n, nombre_concepto: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Orden</Label><Input type="number" placeholder="Ej: 5" value={nuevoConcepto.orden} onChange={e => setNuevoConcepto(n => ({ ...n, orden: e.target.value }))} /></div>
              <div><Label>Monto ($) <span className="text-muted-foreground text-xs">Opc.</span></Label><Input type="number" placeholder="0.00" value={nuevoConcepto.monto} onChange={e => setNuevoConcepto(n => ({ ...n, monto: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalConcepto(false)}>Cancelar</Button>
            <Button onClick={handleCrearConcepto} disabled={guardando || !nuevoConcepto.nombre_concepto.trim() || !nuevoConcepto.programa || !nuevoConcepto.orden}>
              {guardando ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Crear Concepto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Borrar Programa */}
      <Dialog open={!!modalBorrarPrograma} onOpenChange={() => { setModalBorrarPrograma(null); setConfirmacionBorrar(''); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-destructive">⚠️ Borrar Programa Completo</DialogTitle>
          <DialogDescription>
            Estás a punto de borrar el programa <strong className="text-black">{modalBorrarPrograma}</strong>.<br/><br/>
            Esto borrará <strong className="text-destructive">absolutamente TODO</strong>:<br/>
            - Todos sus conceptos asociados.<br/>
            - Todos los pagos y abonos realizados por los estudiantes vinculados a estos conceptos.<br/>
            <br/>
            Para confirmar, escribe la palabra "BORRAR" en mayúsculas a continuación:
          </DialogDescription>
          </DialogHeader>
          <div>
            <Input placeholder="Escribe BORRAR aquí..." value={confirmacionBorrar} onChange={e => setConfirmacionBorrar(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmacionBorrar === 'BORRAR' && handleBorrarPrograma()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalBorrarPrograma(null); setConfirmacionBorrar(''); }}>Cancelar</Button>
            <Button variant="destructive" onClick={handleBorrarPrograma} disabled={guardando || confirmacionBorrar !== 'BORRAR'}>
              {guardando ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />} Borrar Definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
