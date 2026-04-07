
"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  Tabs, TabsContent, TabsList, TabsTrigger
} from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  CreditCard, Users, CheckCircle2, Clock, Send, Plus, Trash2,
  Loader2, ChevronDown, ChevronUp, BarChart3, Pencil, DollarSign, BellRing
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getTodosLosAlumnosConPagos, getPagosAlumno, registrarPago,
  enviarRecordatorioPago, getPlanPagos, createConceptoPago,
  deleteConceptoPago, updateConceptoPago, inicializarPagosAlumno
} from '@/lib/actions/pagos';

const PROGRAMAS = [
  'PREPA JOVEN',
  'BACHILLERATO ADULTOS',
  'UNIVERSIDAD - LICENCIATURA',
  'UNIVERSIDAD - TITULACIÓN EXPERIENCIA',
  'CAPACITACIONES',
];

// ─── Componente: Barra de Progreso de Pagos ─────────────────────────────────
function ProgressBar({ pagados, total }: { pagados: number; total: number }) {
  const pct = total > 0 ? Math.round((pagados / total) * 100) : 0;
  const color = pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-muted-foreground shrink-0">{pagados}/{total}</span>
    </div>
  );
}

// ─── Modal: Detalle de Pagos de un Alumno ───────────────────────────────────
function ModalPagosAlumno({
  alumno, open, onClose, onUpdate
}: {
  alumno: any;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { toast } = useToast();
  const [pagos, setPagos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [editando, setEditando] = useState<any | null>(null);
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
    const nuevoEstatus = pago.estatus === 'pagado' ? 'pendiente' : 'pagado';
    if (nuevoEstatus === 'pagado') {
      setEditando(pago);
      setForm({
        fecha_pago: new Date().toISOString().split('T')[0],
        monto_pagado: pago.plan_pagos?.monto?.toString() || '',
        recibo: '',
        notas: '',
      });
    } else {
      setSaving(pago.id);
      const res = await registrarPago({ alumnoId: alumno.id, planPagoId: pago.plan_pago_id, estatus: 'pendiente' });
      if (res.success) { fetchPagos(); onUpdate(); } else toast({ variant: 'destructive', title: 'Error', description: res.error });
      setSaving(null);
    }
  };

  const handleGuardarPago = async () => {
    if (!editando) return;
    setSaving(editando.id);
    const res = await registrarPago({
      alumnoId: alumno.id,
      planPagoId: editando.plan_pago_id,
      estatus: 'pagado',
      fechaPago: form.fecha_pago,
      montoPagado: form.monto_pagado ? parseFloat(form.monto_pagado) : undefined,
      recibo: form.recibo,
      notas: form.notas,
    });
    if (res.success) {
      toast({ title: 'Pago registrado ✅', description: `${editando.plan_pagos?.nombre_concepto} marcado como pagado.` });
      setEditando(null);
      fetchPagos();
      onUpdate();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
    setSaving(null);
  };

  // Agrupar por programa
  const programas = [...new Set(pagos.map((p: any) => p.plan_pagos?.programa))];

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">
              💳 Pagos: {alumno?.nombre} {alumno?.apellidos}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{alumno?.matricula || 'Sin matrícula'}</Badge>
              <Badge variant="secondary">{alumno?.carreras?.nombre || 'Sin carrera'}</Badge>
              <Badge variant="secondary">{alumno?.carreras?.niveles?.nombre || ''}</Badge>
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
          ) : pagos.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <p>Este alumno no tiene conceptos de pago asignados.</p>
              <p className="text-xs mt-2">Selecciona su programa para inicializarlos:</p>
              <div className="flex gap-2 mt-3 justify-center flex-wrap">
                {PROGRAMAS.map(prog => (
                  <Button key={prog} size="sm" variant="outline" onClick={async () => {
                    setLoading(true);
                    await inicializarPagosAlumno(alumno.id, prog);
                    fetchPagos(); onUpdate();
                  }}>
                    {prog}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {programas.map(prog => {
                const pagosProg = pagos.filter((p: any) => p.plan_pagos?.programa === prog)
                  .sort((a: any, b: any) => (a.plan_pagos?.orden || 0) - (b.plan_pagos?.orden || 0));
                const pagados = pagosProg.filter((p: any) => p.estatus === 'pagado').length;
                return (
                  <div key={prog}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-black uppercase tracking-widest text-primary">{prog}</h4>
                      <span className="text-xs text-muted-foreground">{pagados}/{pagosProg.length} pagados</span>
                    </div>
                    <div className="space-y-2">
                      {pagosProg.map((pago: any) => (
                        <div
                          key={pago.id}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer hover:shadow-sm',
                            pago.estatus === 'pagado' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-dashed border-gray-200'
                          )}
                          onClick={() => saving === pago.id ? null : handleTogglePago(pago)}
                        >
                          {saving === pago.id ? (
                            <Loader2 size={18} className="animate-spin text-muted-foreground shrink-0" />
                          ) : pago.estatus === 'pagado' ? (
                            <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                          ) : (
                            <Clock size={18} className="text-gray-400 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-sm font-bold truncate', pago.estatus === 'pagado' ? 'text-emerald-700' : 'text-gray-700')}>
                              {pago.plan_pagos?.nombre_concepto}
                            </p>
                            {pago.estatus === 'pagado' && (
                              <p className="text-[10px] text-emerald-600 leading-tight">
                                {pago.fecha_pago ? new Date(pago.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX') : ''}
                                {pago.recibo ? ` · Recibo: ${pago.recibo}` : ''}
                                {pago.monto_pagado ? ` · $${Number(pago.monto_pagado).toLocaleString('es-MX')}` : ''}
                              </p>
                            )}
                          </div>
                          {pago.plan_pagos?.monto && pago.estatus !== 'pagado' && (
                            <span className="text-xs font-bold text-gray-500 shrink-0">${Number(pago.plan_pagos.monto).toLocaleString('es-MX')}</span>
                          )}
                          <Badge variant={pago.estatus === 'pagado' ? 'default' : 'secondary'} className={cn('text-[9px] shrink-0', pago.estatus === 'pagado' ? 'bg-emerald-500' : '')}>
                            {pago.estatus === 'pagado' ? 'PAGADO' : 'PENDIENTE'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de detalle de pago */}
      <Dialog open={!!editando} onOpenChange={() => setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
            <DialogDescription>{editando?.plan_pagos?.nombre_concepto}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Fecha de Pago</Label>
              <Input type="date" value={form.fecha_pago} onChange={e => setForm(f => ({ ...f, fecha_pago: e.target.value }))} />
            </div>
            <div>
              <Label>Monto Pagado ($)</Label>
              <Input type="number" placeholder="0.00" value={form.monto_pagado} onChange={e => setForm(f => ({ ...f, monto_pagado: e.target.value }))} />
            </div>
            <div>
              <Label>No. de Recibo / Folio</Label>
              <Input placeholder="Opcional" value={form.recibo} onChange={e => setForm(f => ({ ...f, recibo: e.target.value }))} />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea placeholder="Observaciones adicionales..." value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={handleGuardarPago} disabled={!!saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              Confirmar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Página Principal ────────────────────────────────────────────────────────
export default function ControlVigenciasPage() {
  const { toast } = useToast();
  const [alumnos, setAlumnos] = useState<any[]>([]);
  const [planPagos, setPlanPagos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroPrograma, setFiltroPrograma] = useState('todos');
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState<any | null>(null);
  const [enviandoRecordatorio, setEnviandoRecordatorio] = useState<string | null>(null);

  // Gestión Plan de Pagos
  const [modalConcepto, setModalConcepto] = useState(false);
  const [nuevoConcepto, setNuevoConcepto] = useState({ programa: PROGRAMAS[0], nombre_concepto: '', orden: '', monto: '' });
  const [guardandoConcepto, setGuardandoConcepto] = useState(false);
  const [expandedPrograma, setExpandedPrograma] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [resAlumnos, resPlan] = await Promise.all([getTodosLosAlumnosConPagos(), getPlanPagos()]);
    if (resAlumnos.success) setAlumnos(resAlumnos.data);
    if (resPlan.success) setPlanPagos(resPlan.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const alumnosFiltrados = alumnos.filter(a => {
    const nombre = `${a.nombre} ${a.apellidos}`.toLowerCase();
    const matchBusqueda = nombre.includes(busqueda.toLowerCase()) || (a.matricula || '').includes(busqueda);
    const nivNombre = a.carreras?.niveles?.nombre?.toLowerCase() || '';
    const carrNombre = a.carreras?.nombre?.toLowerCase() || '';
    const matchPrograma = filtroPrograma === 'todos' || (
      filtroPrograma === 'PREPA JOVEN' ? carrNombre.includes('joven') :
      filtroPrograma === 'BACHILLERATO ADULTOS' ? carrNombre.includes('adulto') || carrNombre.includes('2 meses') :
      filtroPrograma === 'UNIVERSIDAD - LICENCIATURA' ? nivNombre.includes('universidad') :
      filtroPrograma === 'CAPACITACIONES' ? nivNombre.includes('capacitac') : true
    );
    return matchBusqueda && matchPrograma;
  });

  const stats = {
    total: alumnos.length,
    alDia: alumnos.filter(a => a.conceptos_pendientes === 0 && a.total_conceptos > 0).length,
    conPendientes: alumnos.filter(a => a.conceptos_pendientes > 0).length,
    sinAsignar: alumnos.filter(a => a.total_conceptos === 0).length,
  };

  const handleRecordatorio = async (alumno: any) => {
    setEnviandoRecordatorio(alumno.id);
    const res = await enviarRecordatorioPago(alumno.id);
    if (res.success) {
      toast({ title: '📧 Recordatorio Enviado', description: `Se notificó a ${alumno.nombre} por correo y plataforma.` });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: (res as any).error });
    }
    setEnviandoRecordatorio(null);
  };

  const handleCrearConcepto = async () => {
    if (!nuevoConcepto.nombre_concepto.trim()) return;
    setGuardandoConcepto(true);
    const res = await createConceptoPago({
      programa: nuevoConcepto.programa,
      nombre_concepto: nuevoConcepto.nombre_concepto,
      orden: parseInt(nuevoConcepto.orden) || 99,
      monto: nuevoConcepto.monto ? parseFloat(nuevoConcepto.monto) : null,
    });
    if (res.success) {
      toast({ title: 'Concepto creado ✅' });
      setModalConcepto(false);
      setNuevoConcepto({ programa: PROGRAMAS[0], nombre_concepto: '', orden: '', monto: '' });
      fetchData();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
    setGuardandoConcepto(false);
  };

  const handleEliminarConcepto = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar el concepto "${nombre}"? Esta acción no se puede deshacer.`)) return;
    const res = await deleteConceptoPago(id);
    if (res.success) {
      toast({ title: 'Concepto eliminado' });
      fetchData();
    } else {
      toast({ variant: 'destructive', title: 'No se pudo eliminar', description: res.error });
    }
  };

  const programasConConceptos = PROGRAMAS.map(prog => ({
    nombre: prog,
    conceptos: planPagos.filter(p => p.programa === prog).sort((a, b) => a.orden - b.orden),
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-primary flex items-center gap-2">
            <CreditCard size={28} /> Control de Pagos
          </h2>
          <p className="text-muted-foreground">Seguimiento de inscripciones y colegiaturas.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Alumnos Activos', value: stats.total, icon: <Users size={18} />, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Al Corriente', value: stats.alDia, icon: <CheckCircle2 size={18} />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Con Pendientes', value: stats.conPendientes, icon: <Clock size={18} />, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Sin Asignar', value: stats.sinAsignar, icon: <BarChart3 size={18} />, color: 'text-slate-500', bg: 'bg-slate-100' },
        ].map((s, i) => (
          <Card key={i} className="border-muted">
            <CardContent className="flex items-center gap-4 pt-5">
              <div className={cn('p-2 rounded-xl', s.bg, s.color)}>{s.icon}</div>
              <div>
                <p className="text-2xl font-black">{loading ? '—' : s.value}</p>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="alumnos">
        <TabsList className="mb-6">
          <TabsTrigger value="alumnos">👥 Alumnos y Pagos</TabsTrigger>
          <TabsTrigger value="plan">📋 Plan de Pagos</TabsTrigger>
        </TabsList>

        {/* TAB 1: Alumnos */}
        <TabsContent value="alumnos">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle>Estado de Pagos por Alumno</CardTitle>
                  <CardDescription>Haz clic en un alumno para gestionar sus pagos.</CardDescription>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap mt-3">
                <Input
                  placeholder="Buscar por nombre o matrícula..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  className="max-w-xs"
                />
                <Select value={filtroPrograma} onValueChange={setFiltroPrograma}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Filtrar por programa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los programas</SelectItem>
                    {PROGRAMAS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
              ) : (
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
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                          No se encontraron alumnos.
                        </TableCell>
                      </TableRow>
                    ) : alumnosFiltrados.map(alumno => (
                      <TableRow key={alumno.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setAlumnoSeleccionado(alumno)}>
                        <TableCell>
                          <div className="font-semibold text-sm">{alumno.nombre} {alumno.apellidos}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{alumno.matricula || 'Sin matrícula'}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">
                            {alumno.carreras?.niveles?.nombre || '—'}
                          </Badge>
                          <div className="text-[10px] text-muted-foreground mt-1">{alumno.carreras?.nombre || '—'}</div>
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          {alumno.total_conceptos === 0 ? (
                            <span className="text-[10px] text-muted-foreground italic">Sin conceptos asignados</span>
                          ) : (
                            <ProgressBar pagados={alumno.conceptos_pagados} total={alumno.total_conceptos} />
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setAlumnoSeleccionado(alumno)}>
                              <Pencil size={12} /> Gestionar
                            </Button>
                            {alumno.conceptos_pendientes > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs gap-1 border-amber-400 text-amber-600 hover:bg-amber-50"
                                disabled={enviandoRecordatorio === alumno.id}
                                onClick={() => handleRecordatorio(alumno)}
                              >
                                {enviandoRecordatorio === alumno.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                Recordatorio
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

        {/* TAB 2: Plan de Pagos */}
        <TabsContent value="plan">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Plan de Pagos por Programa</CardTitle>
                  <CardDescription>Define los conceptos y precios de cada modalidad.</CardDescription>
                </div>
                <Button size="sm" className="gap-1" onClick={() => setModalConcepto(true)}>
                  <Plus size={16} /> Nuevo Concepto
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {programasConConceptos.map(prog => (
                <div key={prog.nombre} className="border rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 bg-muted/40 hover:bg-muted/60 transition-colors"
                    onClick={() => setExpandedPrograma(expandedPrograma === prog.nombre ? null : prog.nombre)}
                  >
                    <div className="flex items-center gap-3">
                      <DollarSign size={16} className="text-primary" />
                      <span className="font-black text-sm uppercase tracking-wider">{prog.nombre}</span>
                      <Badge variant="outline" className="text-[10px]">{prog.conceptos.length} conceptos</Badge>
                    </div>
                    {expandedPrograma === prog.nombre ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {expandedPrograma === prog.nombre && (
                    <div className="divide-y">
                      {prog.conceptos.length === 0 ? (
                        <p className="text-center py-6 text-sm text-muted-foreground">Sin conceptos. Añade uno con el botón "Nuevo Concepto".</p>
                      ) : prog.conceptos.map(concepto => (
                        <ConceptoRow key={concepto.id} concepto={concepto} onDelete={handleEliminarConcepto} onUpdate={fetchData} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Detalle Pagos Alumno */}
      {alumnoSeleccionado && (
        <ModalPagosAlumno
          alumno={alumnoSeleccionado}
          open={!!alumnoSeleccionado}
          onClose={() => setAlumnoSeleccionado(null)}
          onUpdate={fetchData}
        />
      )}

      {/* Modal Nuevo Concepto */}
      <Dialog open={modalConcepto} onOpenChange={setModalConcepto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Concepto de Pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Programa</Label>
              <Select value={nuevoConcepto.programa} onValueChange={v => setNuevoConcepto(n => ({ ...n, programa: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROGRAMAS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nombre del Concepto</Label>
              <Input placeholder="Ej: MENSUALIDAD 5" value={nuevoConcepto.nombre_concepto} onChange={e => setNuevoConcepto(n => ({ ...n, nombre_concepto: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Orden</Label>
                <Input type="number" placeholder="Ej: 5" value={nuevoConcepto.orden} onChange={e => setNuevoConcepto(n => ({ ...n, orden: e.target.value }))} />
              </div>
              <div>
                <Label>Monto ($) <span className="text-muted-foreground text-xs">Opcional</span></Label>
                <Input type="number" placeholder="0.00" value={nuevoConcepto.monto} onChange={e => setNuevoConcepto(n => ({ ...n, monto: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalConcepto(false)}>Cancelar</Button>
            <Button onClick={handleCrearConcepto} disabled={guardandoConcepto || !nuevoConcepto.nombre_concepto.trim()}>
              {guardandoConcepto ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              Crear Concepto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-componente: Fila de Concepto con edición inline ─────────────────────
function ConceptoRow({ concepto, onDelete, onUpdate }: { concepto: any; onDelete: (id: string, nombre: string) => void; onUpdate: () => void }) {
  const { toast } = useToast();
  const [editando, setEditando] = useState(false);
  const [monto, setMonto] = useState(concepto.monto?.toString() || '');
  const [guardando, setGuardando] = useState(false);

  const handleGuardarMonto = async () => {
    setGuardando(true);
    const res = await updateConceptoPago(concepto.id, { monto: monto ? parseFloat(monto) : null });
    if (res.success) {
      toast({ title: 'Monto actualizado ✅' });
      setEditando(false);
      onUpdate();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error });
    }
    setGuardando(false);
  };

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
      <span className="text-[10px] font-bold text-muted-foreground w-6 text-center">{concepto.orden}</span>
      <span className="flex-1 text-sm font-semibold">{concepto.nombre_concepto}</span>
      {editando ? (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="h-7 w-28 text-xs"
            value={monto}
            onChange={e => setMonto(e.target.value)}
            placeholder="0.00"
          />
          <Button size="sm" className="h-7 text-xs px-3" onClick={handleGuardarMonto} disabled={guardando}>
            {guardando ? <Loader2 size={12} className="animate-spin" /> : 'OK'}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditando(false)}>✕</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-bold text-primary cursor-pointer hover:underline"
            onClick={() => setEditando(true)}
          >
            {concepto.monto ? `$${Number(concepto.monto).toLocaleString('es-MX')}` : <span className="text-muted-foreground text-xs">Sin precio</span>}
          </span>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => setEditando(true)}>
            <Pencil size={12} />
          </Button>
        </div>
      )}
      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => onDelete(concepto.id, concepto.nombre_concepto)}>
        <Trash2 size={12} />
      </Button>
    </div>
  );
}
