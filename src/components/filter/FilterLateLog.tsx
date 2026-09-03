'use client';

import { FormEvent, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Camera, Clock3, FileText, Plus, Search, TimerReset, UserRoundPlus } from 'lucide-react';
import { addFilterStudents, createLateEntry, getFilterEvidenceUrl, getStudentLateAlert, searchFilterReporters, searchFilterStudents } from '@/lib/actions/filter-control';
import { FILTER_REASONS } from '@/lib/filter-control';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

export function FilterLateLog({ initialData, initialClock }: { initialData: any; initialClock: any }) {
  const router = useRouter(); const { toast } = useToast(); const [pending, startTransition] = useTransition();
  const [studentQuery, setStudentQuery] = useState(''); const [studentResults, setStudentResults] = useState<any[]>([]); const [student, setStudent] = useState<any>(null); const [lateAlert, setLateAlert] = useState<any>(null);
  const [reason, setReason] = useState('trafico'); const [automaticTime, setAutomaticTime] = useState(true); const [reporter, setReporter] = useState(initialData.isGeneral ? '' : initialData.actorName); const [reporterResults, setReporterResults] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false); const [newName, setNewName] = useState(''); const [newGroup, setNewGroup] = useState(initialData.groups[0]?.id || '');
  const [clockNow, setClockNow] = useState(() => initialClock.iso ? new Date(initialClock.iso) : new Date());

  useEffect(() => { const timer = setInterval(() => setClockNow((current) => new Date(current.getTime() + 1000)), 1000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (studentQuery.trim().length < 2 || student?.full_name === studentQuery) return setStudentResults([]);
      const result = await searchFilterStudents(studentQuery); if (result.success) setStudentResults(result.data);
    }, 250); return () => clearTimeout(timer);
  }, [studentQuery, student]);
  useEffect(() => {
    if (!initialData.isGeneral) return;
    const timer = setTimeout(async () => { if (reporter.trim().length < 1) return setReporterResults([]); const result = await searchFilterReporters(reporter); if (result.success) setReporterResults(result.data); }, 250);
    return () => clearTimeout(timer);
  }, [reporter, initialData.isGeneral]);

  const chooseStudent = async (selected: any) => {
    setStudent(selected); setStudentQuery(selected.full_name); setStudentResults([]);
    setLateAlert(await getStudentLateAlert(selected.id));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); form.set('studentId', student?.id || ''); form.set('automaticTime', String(automaticTime)); form.set('reporterName', reporter);
    startTransition(async () => { const result = await createLateEntry(form); if (!result.success) toast({ variant: 'destructive', title: 'No se guardó el retardo', description: result.error }); else { toast({ title: 'Retardo registrado y auditado' }); setStudent(null); setStudentQuery(''); setLateAlert(null); router.refresh(); } });
  };
  const addStudent = () => startTransition(async () => {
    const result = await addFilterStudents({ groupId: newGroup, names: [newName] });
    if (!result.success) toast({ variant: 'destructive', title: 'No se agregó', description: result.error }); else { toast({ title: 'Alumno agregado' }); setAddOpen(false); setNewName(''); router.refresh(); }
  });
  const openEvidence = async (path: string) => { const result = await getFilterEvidenceUrl(path); if (result.success && result.url) window.open(result.url, '_blank', 'noopener,noreferrer'); else toast({ variant: 'destructive', title: 'No se pudo abrir', description: result.error }); };
  const groupLabel = (group: any) => { const level = initialData.levels.find((item: any) => item.id === group.level_id); return `${level?.name || 'Nivel'} · ${group.grade_name} · ${group.group_name}`; };

  return <div className="space-y-6">
    <div><h1 className="flex items-center gap-2 text-3xl font-bold text-primary"><TimerReset />Bitácora de retardos</h1><p className="text-muted-foreground">Registro móvil y de escritorio, atribuido y aislado para esta institución.</p></div>
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2"><CardHeader><CardTitle>Nuevo registro</CardTitle><CardDescription>Busca al alumno incluso por nombre o cualquiera de sus apellidos.</CardDescription></CardHeader><CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="relative"><Label>Nombre del alumno *</Label><div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={studentQuery} onChange={(e) => { setStudentQuery(e.target.value); setStudent(null); }} autoComplete="off" placeholder="Escribe nombre o apellido" />{studentResults.length > 0 && <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover p-1 shadow-xl">{studentResults.map((item) => <button type="button" key={item.id} onClick={() => chooseStudent(item)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">{item.full_name}</button>)}</div>}</div><Button type="button" variant="outline" size="icon" aria-label="Dar de alta alumno" onClick={() => setAddOpen(true)}><UserRoundPlus className="h-4 w-4" /></Button></div></div>
          {student && <div className="rounded-lg border border-primary/20 bg-primary/5 p-3"><p className="font-semibold">{student.full_name}</p></div>}
          {lateAlert?.success && <Alert variant={lateAlert.alert ? 'destructive' : 'default'}><AlertTriangle className="h-4 w-4" /><AlertTitle>{lateAlert.count} retardo(s) en el periodo configurado</AlertTitle><AlertDescription>{lateAlert.alert ? `Alerta activa: se alcanzó el límite de ${lateAlert.settings?.threshold}. Revisa la política de la institución.` : `Aún no alcanza el umbral de ${lateAlert.settings?.threshold || 3}.`}</AlertDescription></Alert>}
          <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><div className="flex items-center justify-between"><Label>Hora de llegada *</Label><div className="flex items-center gap-2 text-xs"><span>Automática</span><Switch checked={automaticTime} onCheckedChange={setAutomaticTime} /></div></div>{automaticTime ? <div className="flex min-h-10 items-center gap-2 rounded-md border bg-muted/30 px-3 text-sm"><Clock3 className="h-4 w-4 text-primary" />{initialClock.success ? new Intl.DateTimeFormat('es-MX', { timeZone: initialClock.timezone, dateStyle: 'medium', timeStyle: 'medium' }).format(clockNow) : 'Hora del servidor al guardar'}</div> : <Input name="arrivedAt" type="datetime-local" required />}{initialClock.timezone && <p className="text-xs text-muted-foreground">Zona: {initialClock.timezone}</p>}</div>
          <div><Label>Motivo *</Label><Select name="reasonCode" value={reason} onValueChange={setReason}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FILTER_REASONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div></div>
          <div><Label>{reason === 'otro' ? 'Especifica el motivo *' : 'Detalles del motivo (opcional)'}</Label><Textarea name="reasonDetail" required={reason === 'otro'} rows={3} placeholder="Describe información útil del retardo" /></div>
          <div><Label>Foto o comprobante (opcional)</Label><Input name="evidence" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" /><p className="mt-1 text-xs text-muted-foreground">Imagen o PDF, máximo 10 MB. Se guarda en un bucket privado del tenant.</p></div>
          <div className="relative"><Label>Nombre de quien registra {initialData.isGeneral ? '*' : ''}</Label><Input value={reporter} onChange={(e) => setReporter(e.target.value)} disabled={!initialData.isGeneral} autoComplete="off" required={initialData.isGeneral} />{reporterResults.length > 0 && <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover p-1 shadow-xl">{reporterResults.map((item) => <button type="button" key={item.id} onClick={() => { setReporter(item.name); setReporterResults([]); }} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">{item.name}</button>)}</div>}<p className="mt-1 text-xs text-muted-foreground">{initialData.isGeneral ? 'Obligatorio para Encargado general; puedes reutilizar nombres guardados.' : 'Se atribuye automáticamente a tu cuenta.'}</p></div>
          <Button type="submit" size="lg" disabled={pending || !student || (initialData.isGeneral && reporter.trim().length < 2)}>{pending ? 'Guardando…' : 'Guardar retardo'}</Button>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Estado del servicio</CardTitle></CardHeader><CardContent className="space-y-3"><div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Usuario autenticado</p><p className="font-semibold">{initialData.actorName}</p></div><div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Modalidad</p><p className="font-semibold">{initialData.isGeneral ? 'Encargado general' : 'Encargado individual'}</p></div><div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Alumnos disponibles</p><p className="text-2xl font-bold text-primary">{initialData.students.length}</p></div></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Registros recientes</CardTitle><CardDescription>Últimos 100 eventos compartidos por el equipo.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Fecha y hora</TableHead><TableHead>Alumno</TableHead><TableHead>Motivo</TableHead><TableHead>Registró</TableHead><TableHead>Evidencia</TableHead></TableRow></TableHeader><TableBody>{initialData.recent.map((entry: any) => <TableRow key={entry.id}><TableCell>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short', timeZone: initialClock.timezone || 'America/Mexico_City' }).format(new Date(entry.arrived_at))}</TableCell><TableCell className="font-medium">{entry.filter_students?.full_name}</TableCell><TableCell><Badge variant="outline">{FILTER_REASONS.find((item) => item.value === entry.reason_code)?.label || entry.reason_code}</Badge>{entry.reason_detail && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{entry.reason_detail}</p>}</TableCell><TableCell>{entry.reporter_name}</TableCell><TableCell>{entry.evidence_path ? <Button size="sm" variant="outline" onClick={() => openEvidence(entry.evidence_path)}><FileText className="mr-2 h-4 w-4" />Abrir</Button> : '—'}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent><DialogHeader><DialogTitle>Alta rápida de alumno</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Nombre completo</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div><div><Label>Nivel, grado y grupo</Label><Select value={newGroup} onValueChange={setNewGroup}><SelectTrigger><SelectValue placeholder="Selecciona grupo" /></SelectTrigger><SelectContent>{initialData.groups.map((group: any) => <SelectItem key={group.id} value={group.id}>{groupLabel(group)}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button><Button disabled={pending || newName.trim().length < 2 || !newGroup} onClick={addStudent}><Plus className="mr-2 h-4 w-4" />Agregar</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
