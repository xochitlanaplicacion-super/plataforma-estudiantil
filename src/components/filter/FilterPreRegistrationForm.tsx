'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, ClipboardList, DoorOpen, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { createFilterPreregistration } from '@/lib/actions/filter-preregistrations';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FilterEvidenceCapture } from './FilterEvidenceCapture';

type Kind = 'early' | 'extraordinary';
type Student = { id: string; full_name: string; group_label: string };

export type FilterPreRegistrationFormData = {
  actorKind: 'teacher' | 'filter';
  actorName: string;
  students: Student[];
  rosterWarning?: string | null;
};

const NOTIFIED_PARTIES = [
  ['madre', 'Madre'], ['padre', 'Padre'], ['tutor', 'Tutor(a)'], ['familiar_autorizado', 'Familiar autorizado'],
] as const;
const EARLY_METHODS = [
  ['whatsapp', 'WhatsApp'], ['llamada', 'Llamada'], ['sms', 'Mensaje de texto'], ['presencial', 'Presencial'], ['otro', 'Otro'],
] as const;
const EARLY_REASONS = [
  ['cita_medica', 'Cita médica'], ['malestar', 'Enfermedad o malestar'], ['asunto_familiar', 'Asunto familiar'],
  ['salida_autorizada', 'Salida anticipada autorizada'], ['cambio_transporte', 'Cambio de transporte'], ['otro', 'Otro'],
] as const;
const CONTEXTS = [
  ['horario_escolar', 'Durante horario escolar'], ['fin_jornada', 'Fin de la jornada'],
  ['emergencia', 'Emergencia'], ['otro', 'Otro'],
] as const;
function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX').trim();
}

export function FilterPreRegistrationForm({ initialData }: { initialData: FilterPreRegistrationFormData }) {
  const router = useRouter();
  const { toast } = useToast();
  const requestId = useRef<string | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [query, setQuery] = useState('');
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<File | null>(null);
  const [notifiedStaffName, setNotifiedStaffName] = useState(initialData.actorKind === 'teacher' ? initialData.actorName : '');
  const [notifiedParty, setNotifiedParty] = useState('');
  const [notificationMethod, setNotificationMethod] = useState('');
  const [notificationMethodOther, setNotificationMethodOther] = useState('');
  const [departureReason, setDepartureReason] = useState('');
  const [departureReasonOther, setDepartureReasonOther] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryContext, setDeliveryContext] = useState('');
  const [deliveryContextOther, setDeliveryContextOther] = useState('');
  const [deliveryReason, setDeliveryReason] = useState('');
  const [reporterName, setReporterName] = useState(initialData.actorKind === 'teacher' ? initialData.actorName : '');
  const [submitting, setSubmitting] = useState(false);
  const [savedKind, setSavedKind] = useState<Kind | null>(null);

  const selected = useMemo(() => initialData.students.filter((student) => studentIds.includes(student.id)), [initialData.students, studentIds]);
  const results = useMemo(() => {
    const term = normalizeSearch(query);
    if (term.length < 2) return [];
    return initialData.students.filter((student) => !studentIds.includes(student.id) && normalizeSearch(`${student.full_name} ${student.group_label}`).includes(term)).slice(0, 12);
  }, [initialData.students, query, studentIds]);

  const addStudent = (id: string) => {
    if (studentIds.length >= 5) return;
    setStudentIds((current) => current.includes(id) ? current : [...current, id]);
    setQuery('');
  };

  const submit = async () => {
    if (!kind) return toast({ variant: 'destructive', title: 'Elige un tipo de registro' });
    if (!studentIds.length) return toast({ variant: 'destructive', title: 'Selecciona al menos un alumno' });
    if (!evidence) return toast({ variant: 'destructive', title: 'Adjunta la evidencia del aviso' });
    if (kind === 'early' && notifiedStaffName.trim().length < 2) return toast({ variant: 'destructive', title: 'Indica quién recibió el aviso' });
    if (kind === 'extraordinary' && initialData.actorKind === 'filter' && reporterName.trim().length < 2) return toast({ variant: 'destructive', title: 'Indica quién inicia el preregistro' });
    if (kind === 'early' && notificationMethod === 'otro' && notificationMethodOther.trim().length < 2) return toast({ variant: 'destructive', title: 'Especifica el medio de notificación' });
    if (kind === 'early' && departureReason === 'otro' && departureReasonOther.trim().length < 2) return toast({ variant: 'destructive', title: 'Especifica el motivo de salida' });
    if (kind === 'extraordinary' && deliveryContext === 'otro' && deliveryContextOther.trim().length < 2) return toast({ variant: 'destructive', title: 'Especifica el contexto de entrega' });

    const form = new FormData();
    requestId.current ||= crypto.randomUUID();
    form.set('clientRequestId', requestId.current);
    form.set('kind', kind);
    form.set('studentIds', JSON.stringify(studentIds));
    form.set('evidence', evidence);
    if (kind === 'early') {
      form.set('notifiedStaffName', notifiedStaffName.trim());
      form.set('notifiedParty', notifiedParty);
      form.set('notificationMethod', notificationMethod);
      form.set('notificationMethodOther', notificationMethod === 'otro' ? notificationMethodOther.trim() : '');
      form.set('departureReason', departureReason);
      form.set('departureReasonOther', departureReason === 'otro' ? departureReasonOther.trim() : '');
      form.set('description', description.trim());
    } else {
      form.set('deliveryContext', deliveryContext);
      form.set('deliveryContextOther', deliveryContext === 'otro' ? deliveryContextOther.trim() : '');
      form.set('deliveryReason', deliveryReason.trim());
      form.set('reporterName', reporterName.trim());
    }
    setSubmitting(true);
    try {
      const result = await createFilterPreregistration(form);
      if (!result.success) throw new Error(result.error || 'No se pudo guardar la orden.');
      setSavedKind(kind);
      window.dispatchEvent(new Event('filter-pending-orders-changed'));
      requestId.current = null;
      setKind(null);
      setQuery('');
      setStudentIds([]);
      setEvidence(null);
      setNotifiedStaffName(initialData.actorKind === 'teacher' ? initialData.actorName : '');
      setNotifiedParty(''); setNotificationMethod(''); setNotificationMethodOther('');
      setDepartureReason(''); setDepartureReasonOther(''); setDescription('');
      setDeliveryContext(''); setDeliveryContextOther(''); setDeliveryReason('');
      setReporterName(initialData.actorKind === 'teacher' ? initialData.actorName : '');
      router.refresh();
    } catch (error) {
      toast({ variant: 'destructive', title: 'La orden no quedó confirmada', description: error instanceof Error ? error.message : 'Revisa la conexión y vuelve a intentarlo.' });
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="mx-auto max-w-4xl space-y-6 pb-16">
    <div>
      <div className="flex items-center gap-3"><ClipboardList className="h-9 w-9 text-primary" /><div><p className="text-xs font-bold uppercase tracking-widest text-primary">Control de Filtro</p><h1 className="text-3xl font-bold">Preregistros de salidas</h1></div></div>
      <p className="mt-3 text-muted-foreground">Inicia una orden con la información que ya conoces. Filtro revisará los datos y completará el registro normal antes de entregar al alumno.</p>
    </div>

    {savedKind && <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950"><CheckCircle2 className="h-4 w-4" /><AlertTitle>Orden guardada en pendientes</AlertTitle><AlertDescription>El preregistro de {savedKind === 'early' ? 'salida anticipada' : 'entrega extraordinaria'} se guardó en la base de datos. Abrirlo no lo retirará de la lista; desaparecerá solo cuando Filtro complete el expediente.</AlertDescription></Alert>}

    <Card><CardHeader><CardTitle>1. Tipo de salida</CardTitle><CardDescription>Elige la bitácora en la que terminará el expediente.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
      <button type="button" aria-pressed={kind === 'early'} disabled={submitting} onClick={() => { if (kind !== 'early') requestId.current = null; setKind('early'); setSavedKind(null); }} className={`rounded-xl border-2 p-5 text-left transition hover:border-primary/70 ${kind === 'early' ? 'border-primary bg-primary/5' : 'border-border'}`}><DoorOpen className="mb-3 h-7 w-7 text-primary" /><span className="block text-lg font-semibold">Salida anticipada</span><span className="mt-1 block text-sm text-muted-foreground">Un familiar solicita retirar al alumno antes de terminar su jornada.</span></button>
      <button type="button" aria-pressed={kind === 'extraordinary'} disabled={submitting} onClick={() => { if (kind !== 'extraordinary') requestId.current = null; setKind('extraordinary'); setSavedKind(null); }} className={`rounded-xl border-2 p-5 text-left transition hover:border-primary/70 ${kind === 'extraordinary' ? 'border-primary bg-primary/5' : 'border-border'}`}><ShieldCheck className="mb-3 h-7 w-7 text-primary" /><span className="block text-lg font-semibold">Entrega extraordinaria</span><span className="mt-1 block text-sm text-muted-foreground">Una entrega que exige revisión de autorización y protocolo en Filtro.</span></button>
    </CardContent></Card>

    {kind && <><Card><CardHeader><CardTitle>2. Alumno y evidencia</CardTitle><CardDescription>Selecciona de uno a cinco alumnos del padrón que puedes consultar.</CardDescription></CardHeader><CardContent className="space-y-5">
      {initialData.students.length === 0 ? <Alert><AlertTitle>No hay alumnos disponibles</AlertTitle><AlertDescription>{initialData.rosterWarning || 'Verifica la asignación de tu grupo con la administración antes de crear una orden.'}</AlertDescription></Alert> : <>
        <div className="space-y-2"><Label htmlFor="prereg-student-search">Buscar alumno</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="prereg-student-search" className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} disabled={studentIds.length >= 5 || submitting} placeholder="Nombre, apellidos o grupo" autoComplete="off" /></div>
          {query.trim().length >= 2 && <div className="max-h-56 overflow-y-auto rounded-lg border bg-background p-1" role="listbox" aria-label="Resultados de alumnos">{results.length ? results.map((student) => <button type="button" role="option" aria-selected={false} key={student.id} onClick={() => addStudent(student.id)} className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-muted"><span className="font-medium">{student.full_name}</span><span className="text-xs text-muted-foreground">{student.group_label}</span></button>) : <p className="px-3 py-2 text-sm text-muted-foreground">No hay resultados disponibles.</p>}</div>}
        </div>
        <div className="space-y-2"><p className="text-sm font-medium">Alumnos seleccionados ({selected.length}/5)</p>{selected.length ? selected.map((student) => <div key={student.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"><div><p className="font-medium">{student.full_name}</p><p className="text-xs text-muted-foreground">{student.group_label}</p></div><Button type="button" variant="ghost" size="icon" aria-label={`Quitar a ${student.full_name}`} disabled={submitting} onClick={() => setStudentIds((current) => current.filter((id) => id !== student.id))}><Trash2 className="h-4 w-4" /></Button></div>) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aún no has seleccionado alumnos.</p>}</div>
      </>}
      <FilterEvidenceCapture label="Evidencia del mensaje o aviso" help="Adjunta una captura, fotografía o PDF que tengas en el celular. Filtro deberá revisar esta evidencia; por sí sola no confirma la autorización final." file={evidence} onChange={setEvidence} allowPdf />
    </CardContent></Card>

    <Card><CardHeader><CardTitle>3. Datos preliminares</CardTitle><CardDescription>Completa solo lo que ya sabes. Los campos de identidad, autorización final, firma y entrega los resolverá Filtro.</CardDescription></CardHeader><CardContent className="space-y-5">
      {kind === 'early' ? <>
        <div className="space-y-2"><Label htmlFor="prereg-notified-staff">Nombre del personal notificado *</Label><Input id="prereg-notified-staff" value={notifiedStaffName} onChange={(event) => setNotifiedStaffName(event.target.value)} disabled={submitting} placeholder="Quien recibió el aviso" /><p className="text-xs text-muted-foreground">Puede ser el profesor titular u otro integrante del personal que recibió el mensaje.</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>¿Quién notificó?</Label><Select value={notifiedParty} onValueChange={setNotifiedParty}><SelectTrigger aria-label="Quién notificó"><SelectValue placeholder="Si lo sabes" /></SelectTrigger><SelectContent>{NOTIFIED_PARTIES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Medio de notificación</Label><Select value={notificationMethod} onValueChange={setNotificationMethod}><SelectTrigger aria-label="Medio de notificación"><SelectValue placeholder="Si lo sabes" /></SelectTrigger><SelectContent>{EARLY_METHODS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>
        {notificationMethod === 'otro' && <div className="space-y-2"><Label htmlFor="prereg-method-other">Especifica el medio *</Label><Input id="prereg-method-other" value={notificationMethodOther} onChange={(event) => setNotificationMethodOther(event.target.value)} disabled={submitting} /></div>}
        <div className="space-y-2"><Label>Motivo de salida</Label><Select value={departureReason} onValueChange={setDepartureReason}><SelectTrigger aria-label="Motivo de salida"><SelectValue placeholder="Si lo sabes" /></SelectTrigger><SelectContent>{EARLY_REASONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        {departureReason === 'otro' && <div className="space-y-2"><Label htmlFor="prereg-reason-other">Especifica el motivo *</Label><Input id="prereg-reason-other" value={departureReasonOther} onChange={(event) => setDepartureReasonOther(event.target.value)} disabled={submitting} /></div>}
        <div className="space-y-2"><Label htmlFor="prereg-description">Descripción y observaciones</Label><Textarea id="prereg-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} disabled={submitting} placeholder="Solo información que ya conoces del aviso" /></div>
      </> : <>
        {initialData.actorKind === 'filter' && <div className="space-y-2"><Label htmlFor="prereg-reporter">Nombre del personal que inicia el preregistro *</Label><Input id="prereg-reporter" value={reporterName} onChange={(event) => setReporterName(event.target.value)} disabled={submitting} placeholder="Persona que recibió el aviso" /><p className="text-xs text-muted-foreground">La cuenta compartida no identifica por sí sola a la persona física que hizo el registro.</p></div>}
        <div className="space-y-2"><Label>Contexto de entrega</Label><Select value={deliveryContext} onValueChange={setDeliveryContext}><SelectTrigger aria-label="Contexto de entrega"><SelectValue placeholder="Si lo sabes" /></SelectTrigger><SelectContent>{CONTEXTS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        {deliveryContext === 'otro' && <div className="space-y-2"><Label htmlFor="prereg-context-other">Especifica el contexto *</Label><Input id="prereg-context-other" value={deliveryContextOther} onChange={(event) => setDeliveryContextOther(event.target.value)} disabled={submitting} /></div>}
        <div className="space-y-2"><Label htmlFor="prereg-delivery-reason">Motivo de la entrega extraordinaria</Label><Textarea id="prereg-delivery-reason" rows={3} value={deliveryReason} onChange={(event) => setDeliveryReason(event.target.value)} disabled={submitting} placeholder="Solo información comunicada en el aviso" /></div>
      </>}
    </CardContent></Card>

    <Alert><ClipboardList className="h-4 w-4" /><AlertTitle>La orden quedará pendiente</AlertTitle><AlertDescription>No se cerrará al abrirla ni si alguien abandona el formulario. Solo se completará después del guardado definitivo en la bitácora correspondiente.</AlertDescription></Alert>
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><Badge variant="outline" className="w-fit">Cuenta: {initialData.actorKind === 'filter' ? 'Filtro compartido' : initialData.actorName}</Badge><Button size="lg" disabled={submitting || initialData.students.length === 0} onClick={submit}>{submitting ? 'Guardando orden…' : 'Guardar orden pendiente'}<ArrowRight className="ml-2 h-4 w-4" /></Button></div>
    </>}

    {initialData.actorKind === 'filter' && <Button asChild variant="outline"><Link href="/dashboard/filtro">Ver órdenes pendientes</Link></Button>}
  </main>;
}
