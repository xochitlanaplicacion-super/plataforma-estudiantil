'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Clock3, CloudOff, Plus, RefreshCcw, Search, TimerReset, Trash2, UserRoundPlus } from 'lucide-react';
import { addFilterStudents, createLateEntry, getStudentLateAlert, searchFilterReporters, searchFilterStudents } from '@/lib/actions/filter-control';
import { FILTER_REASONS } from '@/lib/filter-control';
import { clearLateEntryDraft, getLateEntryDraft, LateEntryDraft, saveLateEntryDraft } from '@/lib/filter-early-departure-draft';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

export function FilterLateLog({ initialData, initialClock }: { initialData: any; initialClock: any }) {
  const router = useRouter(); const { toast } = useToast(); const [transitioning, startTransition] = useTransition();
  const scope = useMemo(() => `${initialData.tenantId}:${initialData.actorUserId}`, [initialData.tenantId, initialData.actorUserId]);
  const [studentQuery, setStudentQuery] = useState(''); const [studentResults, setStudentResults] = useState<any[]>([]); const [student, setStudent] = useState<any>(null); const [lateAlert, setLateAlert] = useState<any>(null);
  const [reason, setReason] = useState('trafico'); const [reasonDetail, setReasonDetail] = useState(''); const [automaticTime, setAutomaticTime] = useState(true); const [arrivedAt, setArrivedAt] = useState('');
  const [reporter, setReporter] = useState(initialData.isGeneral ? '' : initialData.actorName); const [reporterResults, setReporterResults] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false); const [newName, setNewName] = useState(''); const [newGroup, setNewGroup] = useState(initialData.groups[0]?.id || '');
  const [clockNow, setClockNow] = useState(() => initialClock.iso ? new Date(initialClock.iso) : new Date());
  const [requestId, setRequestId] = useState(''); const [hydrated, setHydrated] = useState(false); const [draftReadFailed, setDraftReadFailed] = useState(false); const [draftReadAttempt, setDraftReadAttempt] = useState(0); const [storageSafe, setStorageSafe] = useState(true); const [draftStatus, setDraftStatus] = useState<'draft'|'queued'>('draft'); const [savedAt, setSavedAt] = useState(''); const [online, setOnline] = useState(true); const [sending, setSending] = useState(false);
  const [resetOpen, setResetOpen] = useState(false); const [resetProgress, setResetProgress] = useState(0);
  const sendLock = useRef(false);
  const latestDraftState = useRef<{ requestId: string; status: 'draft' | 'queued'; student: any; studentQuery: string; reason: string; reasonDetail: string; automaticTime: boolean; arrivedAt: string; reporter: string } | null>(null);

  useEffect(() => { const timer = setInterval(() => setClockNow((current) => new Date(current.getTime() + 1000)), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { setOnline(navigator.onLine); const up = () => setOnline(true); const down = () => setOnline(false); window.addEventListener('online', up); window.addEventListener('offline', down); return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); }; }, []);
  useEffect(() => {
    setHydrated(false);
    void getLateEntryDraft(scope).then(async (draft) => {
      setDraftReadFailed(false);
      if (draft) {
        setRequestId(draft.clientRequestId); setDraftStatus(draft.status); setStudent(draft.student); setStudentQuery(draft.values.studentQuery);
        setReason(draft.values.reason); setReasonDetail(draft.values.reasonDetail); setAutomaticTime(draft.values.automaticTime); setArrivedAt(draft.values.arrivedAt); setReporter(draft.values.reporter); setSavedAt(draft.updatedAt);
        if (draft.student?.id) void getStudentLateAlert(String(draft.student.id)).then(setLateAlert);
      } else setRequestId(crypto.randomUUID());
    }).catch(() => { setDraftReadFailed(true); setStorageSafe(false); }).finally(() => setHydrated(true));
  }, [draftReadAttempt, scope]);
  const currentDraft = useCallback((status: 'draft'|'queued' = draftStatus): LateEntryDraft => ({ version: 1, clientRequestId: requestId, status, updatedAt: new Date().toISOString(), student, values: { studentQuery, reason, reasonDetail, automaticTime, arrivedAt, reporter }, evidence: null }), [requestId, draftStatus, student, studentQuery, reason, reasonDetail, automaticTime, arrivedAt, reporter]);
  latestDraftState.current = hydrated && requestId ? { requestId, status: draftStatus, student, studentQuery, reason, reasonDetail, automaticTime, arrivedAt, reporter } : null;
  useEffect(() => { if (!hydrated || !requestId) return; const timer = setTimeout(() => { void saveLateEntryDraft(scope, currentDraft()).then(() => { setStorageSafe(true); setSavedAt(new Date().toISOString()); }).catch(() => setStorageSafe(false)); }, 350); return () => clearTimeout(timer); }, [hydrated, requestId, scope, currentDraft]);
  useEffect(() => () => {
    const current = latestDraftState.current;
    if (current) void saveLateEntryDraft(scope, { version: 1, clientRequestId: current.requestId, status: current.status, updatedAt: new Date().toISOString(), student: current.student, values: { studentQuery: current.studentQuery, reason: current.reason, reasonDetail: current.reasonDetail, automaticTime: current.automaticTime, arrivedAt: current.arrivedAt, reporter: current.reporter }, evidence: null }).catch(() => undefined);
  }, [scope]);
  useEffect(() => { const preserve = () => { if (hydrated && requestId) void saveLateEntryDraft(scope, currentDraft()); }; const visibility = () => { if (document.visibilityState === 'hidden') preserve(); }; window.addEventListener('pagehide', preserve); document.addEventListener('visibilitychange', visibility); return () => { window.removeEventListener('pagehide', preserve); document.removeEventListener('visibilitychange', visibility); }; }, [hydrated, requestId, scope, currentDraft]);
  useEffect(() => { const timer = setTimeout(async () => { if (studentQuery.trim().length < 2 || student?.full_name === studentQuery) return setStudentResults([]); const result = await searchFilterStudents(studentQuery); if (result.success) setStudentResults(result.data); }, 250); return () => clearTimeout(timer); }, [studentQuery, student]);
  useEffect(() => { if (!initialData.isGeneral) return; const timer = setTimeout(async () => { if (reporter.trim().length < 1) return setReporterResults([]); const result = await searchFilterReporters(reporter); if (result.success) setReporterResults(result.data); }, 250); return () => clearTimeout(timer); }, [reporter, initialData.isGeneral]);

  const chooseStudent = async (selected: any) => { setStudent(selected); setStudentQuery(selected.full_name); setStudentResults([]); setLateAlert(await getStudentLateAlert(selected.id)); };
  const resetState = useCallback(() => { latestDraftState.current = null; setStudent(null); setStudentQuery(''); setStudentResults([]); setLateAlert(null); setReason('trafico'); setReasonDetail(''); setAutomaticTime(true); setArrivedAt(''); setDraftStatus('draft'); setSavedAt(''); setRequestId(crypto.randomUUID()); setResetProgress(0); setResetOpen(false); if (initialData.isGeneral) setReporter(''); }, [initialData.isGeneral]);
  const resetForm = useCallback(async () => {
    try { await clearLateEntryDraft(scope); resetState(); }
    catch { setStorageSafe(false); toast({ variant: 'destructive', title: 'No se pudo reiniciar', description: 'La copia local no se eliminó. Revisa el almacenamiento del navegador y vuelve a intentarlo.' }); }
  }, [resetState, scope, toast]);
  const send = useCallback(async () => {
    if (!student?.id || !requestId || sendLock.current) return;
    const draft = currentDraft(navigator.onLine ? 'draft' : 'queued');
    sendLock.current = true; setSending(true);
    let locallyCommitted = false;
    try { await saveLateEntryDraft(scope, draft); locallyCommitted = true; setStorageSafe(true); setSavedAt(new Date().toISOString()); }
    catch { setStorageSafe(false); }
    if (!navigator.onLine) {
      setDraftStatus('queued');
      toast(locallyCommitted
        ? { title: 'Registro protegido sin conexión', description: 'No se enviará automáticamente. Pulsa Guardar cuando vuelva internet.' }
        : { variant: 'destructive', title: 'No se pudo proteger el registro', description: 'El navegador no confirmó el guardado local. Los datos siguen en pantalla: no cierres esta pestaña.' });
      sendLock.current = false; setSending(false);
      return;
    }
    try {
      const form = new FormData(); form.set('clientRequestId', requestId); form.set('studentId', String(student.id)); form.set('automaticTime', String(automaticTime)); form.set('arrivedAt', arrivedAt); form.set('reasonCode', reason); form.set('reasonDetail', reasonDetail); form.set('reporterName', reporter);
      const result = await createLateEntry(form);
      if (!result.success) { setDraftStatus('queued'); const queuedCommitted = await saveLateEntryDraft(scope, { ...draft, status: 'queued', updatedAt: new Date().toISOString() }).then(() => true).catch(() => false); const protectedLocally = queuedCommitted || locallyCommitted; toast({ variant: 'destructive', title: 'No se guardó el retardo', description: protectedLocally ? `${result.error} La copia local confirmada permanece disponible; pulsa Guardar para reintentar.` : `${result.error} El navegador no confirmó una copia local: no cierres esta pestaña.` }); return; }
      latestDraftState.current = null;
      const localCopyRemoved = await clearLateEntryDraft(scope).then(() => true).catch(() => false);
      resetState();
      toast({ title: result.duplicate ? 'El retardo ya estaba guardado' : 'Retardo registrado y auditado', description: localCopyRemoved ? 'La base de datos confirmó el registro y se retiró la copia temporal.' : 'La base de datos confirmó el registro. El navegador no pudo retirar la copia temporal, pero no se volverá a enviar automáticamente.' });
      router.refresh();
    } catch { setDraftStatus('queued'); const queuedCommitted = await saveLateEntryDraft(scope, { ...draft, status: 'queued', updatedAt: new Date().toISOString() }).then(() => true).catch(() => false); const protectedLocally = queuedCommitted || locallyCommitted; if (!protectedLocally) setStorageSafe(false); toast({ variant: 'destructive', title: 'Envío pendiente', description: protectedLocally ? 'La conexión se interrumpió. La copia local confirmada permanece disponible; pulsa Guardar para reintentar.' : 'La conexión falló y el navegador no confirmó el almacenamiento local. Los datos siguen en pantalla; no cierres esta pestaña.' }); }
    finally { sendLock.current = false; setSending(false); }
  }, [student, requestId, scope, currentDraft, automaticTime, arrivedAt, reason, reasonDetail, reporter, toast, resetState, router]);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void send(); };
  const addStudent = () => startTransition(async () => { const result = await addFilterStudents({ groupId: newGroup, names: [newName] }); if (!result.success) toast({ variant: 'destructive', title: 'No se agregó', description: result.error }); else { toast({ title: 'Alumno agregado' }); setAddOpen(false); setNewName(''); router.refresh(); } });
  const groupLabel = (group: any) => { const level = initialData.levels.find((item: any) => item.id === group.level_id); return `${level?.name || 'Nivel'} · ${group.grade_name} · ${group.group_name}`; };

  if (!hydrated) return <Card><CardContent className="flex min-h-64 items-center justify-center">Recuperando el registro guardado en este dispositivo…</CardContent></Card>;
  if (draftReadFailed) return <Card className="mx-auto max-w-2xl"><CardHeader><CardTitle>No fue posible leer la copia local</CardTitle><CardDescription>Por seguridad no se inició ni sobrescribió ningún registro. Tus datos anteriores permanecen intactos en este dispositivo.</CardDescription></CardHeader><CardContent className="space-y-4"><Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Recuperación detenida</AlertTitle><AlertDescription>Verifica que el navegador permita almacenamiento para este sitio. En Safari evita la navegación privada y vuelve a intentarlo.</AlertDescription></Alert><Button onClick={() => { setStorageSafe(true); setDraftReadAttempt((current) => current + 1); }}>Reintentar recuperación</Button></CardContent></Card>;
  return <div className={`space-y-6 ${sending ? 'pointer-events-none' : ''}`} aria-busy={sending}>
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h1 className="flex items-center gap-2 text-3xl font-bold text-primary"><TimerReset />Bitácora de retardos</h1><p className="text-muted-foreground">Registro móvil y de escritorio, atribuido y aislado para esta institución.</p></div><Button type="button" variant="outline" disabled={sending} onClick={() => setResetOpen(true)}><RefreshCcw className="mr-2 h-4 w-4" />Reiniciar proceso</Button></div>
    <Alert variant={!storageSafe ? 'destructive' : 'default'}>{!online ? <CloudOff className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}<AlertTitle>{!storageSafe ? 'El navegador bloqueó el almacenamiento local' : draftStatus === 'queued' ? 'Guardado pendiente y protegido' : 'Borrador protegido en este dispositivo'}</AlertTitle><AlertDescription>{!storageSafe ? 'No cierres esta pestaña hasta guardar. En Safari, evita la navegación privada y permite almacenamiento del sitio.' : draftStatus === 'queued' ? 'Se recuperaron los datos y la evidencia. Nada se enviará hasta que pulses Guardar.' : !online ? 'Puedes continuar y conservar el borrador; el sistema esperará a que tú decidas enviarlo.' : savedAt ? `Guardado localmente ${new Date(savedAt).toLocaleTimeString('es-MX')}. Puedes recargar, bloquear o cerrar y volver a esta pantalla.` : 'Los datos y la evidencia se conservan automáticamente.'}</AlertDescription></Alert>
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2"><CardHeader><CardTitle>Nuevo registro</CardTitle><CardDescription>Busca al alumno incluso por nombre o cualquiera de sus apellidos.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-5">
        <div className="relative"><Label>Nombre del alumno *</Label><div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={studentQuery} onChange={(e) => { setStudentQuery(e.target.value); setStudent(null); }} autoComplete="off" placeholder="Escribe nombre o apellido" />{studentResults.length > 0 && <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover p-1 shadow-xl">{studentResults.map((item) => <button type="button" key={item.id} onClick={() => void chooseStudent(item)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">{item.full_name}</button>)}</div>}</div><Button type="button" variant="outline" size="icon" aria-label="Dar de alta alumno" onClick={() => setAddOpen(true)}><UserRoundPlus className="h-4 w-4" /></Button></div></div>
        {student && <div className="rounded-lg border border-primary/20 bg-primary/5 p-3"><p className="font-semibold">{student.full_name}</p></div>}
        {lateAlert?.success && <Alert variant={lateAlert.alert ? 'destructive' : 'default'}><AlertTriangle className="h-4 w-4" /><AlertTitle>{lateAlert.count} retardo(s) en el periodo configurado</AlertTitle><AlertDescription>{lateAlert.alert ? `Alerta activa: se alcanzó el límite de ${lateAlert.settings?.threshold}.` : `Aún no alcanza el umbral de ${lateAlert.settings?.threshold || 3}.`}</AlertDescription></Alert>}
        <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><div className="flex items-center justify-between"><Label>Hora de llegada *</Label><div className="flex items-center gap-2 text-xs"><span>Automática</span><Switch checked={automaticTime} onCheckedChange={setAutomaticTime} /></div></div>{automaticTime ? <div className="flex min-h-10 items-center gap-2 rounded-md border bg-muted/30 px-3 text-sm"><Clock3 className="h-4 w-4 text-primary" />{initialClock.success ? new Intl.DateTimeFormat('es-MX', { timeZone: initialClock.timezone, dateStyle: 'medium', timeStyle: 'medium' }).format(clockNow) : 'Hora del servidor al guardar'}</div> : <Input value={arrivedAt} onChange={(event) => setArrivedAt(event.target.value)} type="datetime-local" required />}{initialClock.timezone && <p className="text-xs text-muted-foreground">Zona: {initialClock.timezone}</p>}</div><div><Label>Motivo *</Label><Select value={reason} onValueChange={setReason}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FILTER_REASONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div></div>
        <div><Label>{reason === 'otro' ? 'Especifica el motivo *' : 'Detalles del motivo (opcional)'}</Label><Textarea value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} required={reason === 'otro'} rows={3} placeholder="Describe información útil del retardo" /></div>
        <div className="relative"><Label>Nombre de quien registra {initialData.isGeneral ? '*' : ''}</Label><Input value={reporter} onChange={(e) => setReporter(e.target.value)} disabled={!initialData.isGeneral} autoComplete="off" required={initialData.isGeneral} />{reporterResults.length > 0 && <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover p-1 shadow-xl">{reporterResults.map((item) => <button type="button" key={item.id} onClick={() => { setReporter(item.name); setReporterResults([]); }} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">{item.name}</button>)}</div>}</div>
        <Button type="submit" size="lg" disabled={!hydrated || sending || !student || (initialData.isGeneral && reporter.trim().length < 2)}>{sending ? 'Guardando…' : draftStatus === 'queued' && online ? 'Reintentar guardado' : !online ? 'Conservar borrador' : 'Guardar retardo'}</Button>
      </form></CardContent></Card>
      <Card><CardHeader><CardTitle>Estado del servicio</CardTitle></CardHeader><CardContent className="space-y-3"><div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Usuario autenticado</p><p className="font-semibold">{initialData.actorName}</p></div><div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Modalidad</p><p className="font-semibold">{initialData.isGeneral ? 'Encargado general' : 'Encargado individual'}</p></div><div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Alumnos disponibles</p><p className="text-2xl font-bold text-primary">{initialData.students.length}</p></div></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Registros recientes</CardTitle><CardDescription>Últimos 100 eventos compartidos por el equipo.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Fecha y hora</TableHead><TableHead>Alumno</TableHead><TableHead>Motivo</TableHead><TableHead>Registró</TableHead></TableRow></TableHeader><TableBody>{initialData.recent.map((entry: any) => <TableRow key={entry.id}><TableCell>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short', timeZone: initialClock.timezone || 'America/Mexico_City' }).format(new Date(entry.arrived_at))}</TableCell><TableCell className="font-medium">{entry.filter_students?.full_name}</TableCell><TableCell><Badge variant="outline">{FILTER_REASONS.find((item) => item.value === entry.reason_code)?.label || entry.reason_code}</Badge>{entry.reason_detail && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{entry.reason_detail}</p>}</TableCell><TableCell>{entry.reporter_name}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent><DialogHeader><DialogTitle>Alta rápida de alumno</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Nombre completo</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div><div><Label>Nivel, grado y grupo</Label><Select value={newGroup} onValueChange={setNewGroup}><SelectTrigger><SelectValue placeholder="Selecciona grupo" /></SelectTrigger><SelectContent>{initialData.groups.map((group: any) => <SelectItem key={group.id} value={group.id}>{groupLabel(group)}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button><Button disabled={transitioning || newName.trim().length < 2 || !newGroup} onClick={addStudent}><Plus className="mr-2 h-4 w-4" />Agregar</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={resetOpen} onOpenChange={(open) => { setResetOpen(open); if (!open) setResetProgress(0); }}><DialogContent><DialogHeader><DialogTitle>¿Reiniciar el registro de retardo?</DialogTitle></DialogHeader><Alert variant="destructive"><Trash2 className="h-4 w-4" /><AlertTitle>Se descartará el borrador guardado en este dispositivo</AlertTitle><AlertDescription>Esta acción no elimina registros que ya hayan sido confirmados en la base de datos.</AlertDescription></Alert><div className="space-y-3 rounded-xl border p-5"><Label>Desliza hasta el final para confirmar</Label><Slider value={[resetProgress]} onValueChange={([value]) => setResetProgress(value)} onValueCommit={([value]) => { if (value >= 100) void resetForm(); }} max={100} /><p className="text-center text-sm font-semibold text-primary">{resetProgress}%</p></div><DialogFooter><Button type="button" variant="outline" onClick={() => setResetOpen(false)}>Conservar proceso</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
