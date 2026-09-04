'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, CircleEllipsis, Clock3, DoorOpen, FileText, MessageCircle, MessageSquareText, Phone, Plus, RefreshCcw, Search, ShieldCheck, Signal, SignalZero, Trash2, UserRoundPlus, UsersRound } from 'lucide-react';
import { addFilterStudents, createEarlyDeparture, getFilterEvidenceUrl, searchFilterReporters, searchFilterStudents } from '@/lib/actions/filter-control';
import { clearEarlyDepartureDraft, EarlyDepartureDraft, getEarlyDepartureDraft, persistFile, restoreFile, saveEarlyDepartureDraft } from '@/lib/filter-early-departure-draft';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { FilterEvidenceCapture } from './FilterEvidenceCapture';
import { FilterSignaturePad } from './FilterSignaturePad';

const STEPS = ['Alumno y horario', 'Persona que retira', 'Aviso y motivo', 'Entrega del alumno', 'Confirmación'];
const RELATIONSHIPS = [
  ['madre', 'Madre'], ['padre', 'Padre'], ['tutor', 'Tutor(a)'], ['abuelo', 'Abuelo(a)'],
  ['hermano', 'Hermano(a)'], ['familiar_autorizado', 'Familiar autorizado'], ['otro', 'Otro'],
] as const;
const REASONS = [
  ['cita_medica', 'Cita médica'], ['malestar', 'Enfermedad o malestar'], ['asunto_familiar', 'Asunto familiar'],
  ['salida_autorizada', 'Salida anticipada autorizada'], ['cambio_transporte', 'Cambio de transporte'], ['otro', 'Otro'],
] as const;
const METHODS = [
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'llamada', label: 'Llamada', icon: Phone },
  { value: 'sms', label: 'Mensaje de texto', icon: MessageSquareText },
  { value: 'presencial', label: 'Presencial', icon: UsersRound },
  { value: 'otro', label: 'Otro', icon: CircleEllipsis },
];

const EMPTY_VALUES: Record<string, string | boolean> = {
  studentQuery: '', automaticTime: true, departedAt: '', pickupPersonName: '', relationship: '', relationshipOther: '',
  notifiedParty: '', notifiedStaffName: '', notificationMethod: '', notificationMethodOther: '', departureReason: '',
  departureReasonOther: '', description: '', deliveringTeacherName: '', reporterName: '', confirmed: false,
};

export function FilterEarlyDepartureWizard({ initialData, initialClock }: { initialData: any; initialClock: any }) {
  const router = useRouter(); const { toast } = useToast();
  const draftScope = `${initialData.tenantId}:${initialData.actorUserId}`;
  const [values, setValues] = useState<Record<string, string | boolean>>({ ...EMPTY_VALUES, reporterName: initialData.isGeneral ? '' : initialData.actorName });
  const [student, setStudent] = useState<any>(null); const [studentResults, setStudentResults] = useState<any[]>([]);
  const [reporterResults, setReporterResults] = useState<any[]>([]);
  const [step, setStep] = useState(0); const [requestId, setRequestId] = useState('');
  const [identificationEvidence, setIdentificationEvidence] = useState<File | null>(null);
  const [pickupPersonPhoto, setPickupPersonPhoto] = useState<File | null>(null);
  const [finalHandoverPhoto, setFinalHandoverPhoto] = useState<File | null>(null);
  const [pickupSignature, setPickupSignature] = useState<File | null>(null);
  const [hydrated, setHydrated] = useState(false); const [storageSafe, setStorageSafe] = useState(true);
  const [draftStatus, setDraftStatus] = useState<'draft' | 'queued'>('draft');
  const [online, setOnline] = useState(true); const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null); const [clock, setClock] = useState(() => new Date(initialClock.iso || Date.now()));
  const [addOpen, setAddOpen] = useState(false); const [newName, setNewName] = useState(''); const [newGroup, setNewGroup] = useState(initialData.groups[0]?.id || '');
  const [resetOpen, setResetOpen] = useState(false); const [resetProgress, setResetProgress] = useState(0);
  const syncRunning = useRef(false);

  const setValue = (key: string, value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));
  const selectedGroup = useMemo(() => initialData.groups.find((item: any) => item.id === student?.group_id), [initialData.groups, student]);
  const selectedLevel = useMemo(() => initialData.levels.find((item: any) => item.id === selectedGroup?.level_id), [initialData.levels, selectedGroup]);
  const groupLabel = (group: any) => `${initialData.levels.find((item: any) => item.id === group.level_id)?.name || 'Nivel'} · ${group.grade_name} · Grupo ${group.group_name}`;

  const makeDraft = useCallback((status = draftStatus): EarlyDepartureDraft => ({
    version: 1, clientRequestId: requestId, step, status, updatedAt: new Date().toISOString(), values, student,
    identificationEvidence: persistFile(identificationEvidence), pickupPersonPhoto: persistFile(pickupPersonPhoto), finalHandoverPhoto: persistFile(finalHandoverPhoto), pickupSignature: persistFile(pickupSignature),
  }), [draftStatus, finalHandoverPhoto, identificationEvidence, pickupPersonPhoto, pickupSignature, requestId, step, student, values]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const cameOnline = () => setOnline(true); const wentOffline = () => setOnline(false);
    window.addEventListener('online', cameOnline); window.addEventListener('offline', wentOffline);
    return () => { window.removeEventListener('online', cameOnline); window.removeEventListener('offline', wentOffline); };
  }, []);
  useEffect(() => { const timer = setInterval(() => setClock((current) => new Date(current.getTime() + 1000)), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    getEarlyDepartureDraft(draftScope).then((draft) => {
      if (draft?.version === 1 && draft.clientRequestId) {
        setRequestId(draft.clientRequestId); setStep(Math.min(Math.max(draft.step, 0), 4)); setDraftStatus(draft.status);
        setValues({ ...EMPTY_VALUES, reporterName: initialData.isGeneral ? '' : initialData.actorName, ...draft.values }); setStudent(draft.student);
        setIdentificationEvidence(restoreFile(draft.identificationEvidence)); setPickupPersonPhoto(restoreFile(draft.pickupPersonPhoto)); setFinalHandoverPhoto(restoreFile(draft.finalHandoverPhoto)); setPickupSignature(restoreFile(draft.pickupSignature || null));
        toast({ title: draft.status === 'queued' ? 'Registro pendiente recuperado' : 'Borrador recuperado', description: 'También se restauraron las fotografías guardadas en este dispositivo.' });
      } else setRequestId(crypto.randomUUID());
    }).catch(() => { setRequestId(crypto.randomUUID()); setStorageSafe(false); }).finally(() => setHydrated(true));
  }, [draftScope, initialData.actorName, initialData.isGeneral, toast]);
  useEffect(() => {
    if (!hydrated || !requestId) return;
    void saveEarlyDepartureDraft(draftScope, makeDraft()).then(() => setSavedAt(new Date().toISOString())).catch(() => setStorageSafe(false));
  }, [draftScope, hydrated, makeDraft, requestId]);
  useEffect(() => {
    if (!hydrated) return;
    const persistNow = () => { void saveEarlyDepartureDraft(draftScope, makeDraft()).catch(() => setStorageSafe(false)); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') persistNow(); };
    window.addEventListener('pagehide', persistNow); document.addEventListener('visibilitychange', onVisibility);
    return () => { window.removeEventListener('pagehide', persistNow); document.removeEventListener('visibilitychange', onVisibility); };
  }, [draftScope, hydrated, makeDraft]);
  useEffect(() => {
    const query = String(values.studentQuery || '');
    const timer = setTimeout(async () => {
      if (query.trim().length < 2 || student?.full_name === query) return setStudentResults([]);
      const result = await searchFilterStudents(query); if (result.success) setStudentResults(result.data);
    }, 250); return () => clearTimeout(timer);
  }, [student, values.studentQuery]);
  useEffect(() => {
    const reporter = String(values.reporterName || ''); if (!initialData.isGeneral) return;
    const timer = setTimeout(async () => { if (reporter.length < 1) return setReporterResults([]); const result = await searchFilterReporters(reporter); if (result.success) setReporterResults(result.data); }, 250);
    return () => clearTimeout(timer);
  }, [initialData.isGeneral, values.reporterName]);

  const validationError = (targetStep = step) => {
    if (targetStep === 0 && !student) return 'Selecciona un alumno de los resultados de búsqueda.';
    if (targetStep === 0 && values.automaticTime === false && !values.departedAt) return 'Indica la fecha y hora personalizada.';
    if (targetStep === 1 && String(values.pickupPersonName).trim().length < 2) return 'Escribe el nombre completo de quien retira.';
    if (targetStep === 1 && !values.relationship) return 'Selecciona el parentesco.';
    if (targetStep === 1 && values.relationship === 'otro' && String(values.relationshipOther).trim().length < 2) return 'Especifica el parentesco.';
    if (targetStep === 1 && !identificationEvidence) return 'Adjunta la identificación presentada.';
    if (targetStep === 1 && !pickupPersonPhoto) return 'Toma o adjunta la foto de la persona que retira.';
    if (targetStep === 2 && !values.notifiedParty) return 'Indica a quién se notificó.';
    if (targetStep === 2 && String(values.notifiedStaffName).trim().length < 2) return 'Escribe el nombre del personal notificado.';
    if (targetStep === 2 && !values.notificationMethod) return 'Selecciona el medio de notificación.';
    if (targetStep === 2 && values.notificationMethod === 'otro' && String(values.notificationMethodOther).trim().length < 2) return 'Especifica el medio de notificación.';
    if (targetStep === 2 && !values.departureReason) return 'Selecciona el motivo de retiro.';
    if (targetStep === 2 && values.departureReason === 'otro' && String(values.departureReasonOther).trim().length < 2) return 'Especifica el motivo de retiro.';
    if (targetStep === 3 && String(values.deliveringTeacherName).trim().length < 2) return 'Escribe el nombre del docente que entrega al alumno.';
    if (targetStep === 3 && initialData.isGeneral && String(values.reporterName).trim().length < 2) return 'Escribe el nombre del personal de guardia que registra.';
    if (targetStep === 3 && !finalHandoverPhoto) return 'Toma la foto final de la persona que retira junto con el alumno.';
    if (targetStep === 3 && !pickupSignature) return 'Solicita la firma de la persona que retira al alumno.';
    if (targetStep === 4 && values.confirmed !== true) return 'Marca la confirmación obligatoria para finalizar.';
    return null;
  };
  const next = () => { const error = validationError(); if (error) return toast({ variant: 'destructive', title: 'Completa este paso', description: error }); setStep((current) => Math.min(current + 1, 4)); };
  const chooseStudent = (selected: any) => { const canonical = initialData.students.find((item: any) => item.id === selected.id) || selected; setStudent(canonical); setValue('studentQuery', canonical.full_name); setStudentResults([]); };
  const addStudent = async () => {
    const result = await addFilterStudents({ groupId: newGroup, names: [newName] });
    if (!result.success) return toast({ variant: 'destructive', title: 'No se agregó el alumno', description: result.error });
    const search = await searchFilterStudents(newName); if (search.success && search.data[0]) chooseStudent(search.data[0]);
    setAddOpen(false); setNewName(''); toast({ title: 'Alumno agregado al padrón' }); router.refresh();
  };

  const formDataFromDraft = (draft: EarlyDepartureDraft) => {
    const data = new FormData(); data.set('clientRequestId', draft.clientRequestId); data.set('studentId', String((draft.student as any)?.id || ''));
    Object.entries(draft.values).forEach(([key, value]) => data.set(key, String(value)));
    const identification = restoreFile(draft.identificationEvidence); const pickup = restoreFile(draft.pickupPersonPhoto); const handover = restoreFile(draft.finalHandoverPhoto); const signature = restoreFile(draft.pickupSignature || null);
    if (identification) data.set('identificationEvidence', identification); if (pickup) data.set('pickupPersonPhoto', pickup); if (handover) data.set('finalHandoverPhoto', handover); if (signature) data.set('pickupSignature', signature);
    return data;
  };
  const resetForm = useCallback(async () => {
    await clearEarlyDepartureDraft(draftScope); setRequestId(crypto.randomUUID()); setStep(0); setDraftStatus('draft');
    setValues({ ...EMPTY_VALUES, reporterName: initialData.isGeneral ? '' : initialData.actorName }); setStudent(null);
    setIdentificationEvidence(null); setPickupPersonPhoto(null); setFinalHandoverPhoto(null); setPickupSignature(null); setResetProgress(0); setResetOpen(false);
  }, [draftScope, initialData.actorName, initialData.isGeneral]);
  const sendDraft = useCallback(async (draft: EarlyDepartureDraft) => {
    if (syncRunning.current) return; syncRunning.current = true; setSaving(true);
    try {
      const result = await createEarlyDeparture(formDataFromDraft(draft));
      if (!result.success) {
        setDraftStatus('queued'); await saveEarlyDepartureDraft(draftScope, { ...draft, status: 'queued', updatedAt: new Date().toISOString() });
        toast({ variant: 'destructive', title: 'No se pudo guardar todavía', description: `${result.error} El contenido y las fotos permanecen protegidos. Corrige lo indicado y pulsa Guardar para reintentar.` });
        return;
      }
      await clearEarlyDepartureDraft(draftScope);
      toast({ title: result.duplicate ? 'La salida ya estaba registrada' : 'Salida anticipada guardada y auditada', description: 'La base de datos confirmó el registro; el borrador local ya puede retirarse.' });
      await resetForm(); router.refresh();
    } catch {
      const queued = { ...draft, status: 'queued' as const, updatedAt: new Date().toISOString() }; setDraftStatus('queued');
      try { await saveEarlyDepartureDraft(draftScope, queued); } catch { setStorageSafe(false); }
      toast({ variant: 'destructive', title: 'Sin conexión con el servidor', description: 'El registro permanece protegido. Cuando vuelva internet, pulsa Guardar para reintentar.' });
    } finally { syncRunning.current = false; setSaving(false); }
  }, [draftScope, resetForm, router, toast]);
  const save = async () => {
    const error = validationError(4); if (error) return toast({ variant: 'destructive', title: 'No se puede finalizar', description: error });
    const draft = makeDraft(online ? 'draft' : 'queued'); await saveEarlyDepartureDraft(draftScope, draft).catch(() => setStorageSafe(false));
    if (!online) { setDraftStatus('queued'); return toast({ title: 'Borrador protegido sin conexión', description: 'No se enviará automáticamente. Pulsa Guardar cuando el dispositivo recupere internet.' }); }
    await sendDraft(draft);
  };
  const openEvidence = async (path: string) => { const result = await getFilterEvidenceUrl(path); if (result.success && result.url) window.open(result.url, '_blank', 'noopener,noreferrer'); else toast({ variant: 'destructive', title: 'No se pudo abrir', description: result.error }); };

  if (!hydrated) return <Card><CardContent className="flex min-h-64 items-center justify-center">Recuperando el proceso guardado en este dispositivo…</CardContent></Card>;

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-primary sm:text-3xl"><DoorOpen />Bitácora de salidas anticipadas</h1><p className="text-muted-foreground">Entrega segura, guiada y auditable dentro de esta institución.</p></div><Button variant="outline" onClick={() => setResetOpen(true)}><RefreshCcw className="mr-2 h-4 w-4" />Reiniciar proceso</Button></div>
    <Alert variant={!storageSafe ? 'destructive' : 'default'}>{online ? <Signal className="h-4 w-4" /> : <SignalZero className="h-4 w-4" />}<AlertTitle>{!storageSafe ? 'El almacenamiento local no está disponible' : draftStatus === 'queued' ? 'Guardado pendiente y protegido' : online ? 'Borrador protegido' : 'Modo sin conexión'}</AlertTitle><AlertDescription>{!storageSafe ? 'No cierres ni recargues esta página hasta guardar. Revisa que el navegador permita almacenamiento del sitio.' : draftStatus === 'queued' ? 'Se recuperaron los datos y las fotos. Nada se enviará hasta que pulses Guardar.' : `Textos y fotos se conservan en este dispositivo${savedAt ? ` · última copia ${new Date(savedAt).toLocaleTimeString('es-MX')}` : ''}.`}</AlertDescription></Alert>
    <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Paso {step + 1} de {STEPS.length}: {STEPS[step]}</CardTitle><CardDescription>Completa los datos señalados para habilitar el siguiente paso.</CardDescription></div><Badge variant="outline">{Math.round(((step + 1) / STEPS.length) * 100)}%</Badge></div><Progress value={((step + 1) / STEPS.length) * 100} /><div className="hidden grid-cols-5 gap-2 pt-2 md:grid">{STEPS.map((title, index) => <div key={title} className={`text-center text-xs ${index <= step ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{index + 1}. {title}</div>)}</div></CardHeader>
      <CardContent className="space-y-6">
        <Alert className="border-primary/30 bg-primary/5"><BadgeCheck className="h-4 w-4" /><AlertTitle>Guía activa</AlertTitle><AlertDescription>{[
          'Busca y selecciona al alumno. Verifica que el nivel, grado y grupo sean correctos; estos datos no se pueden editar aquí.',
          'Registra a la persona autorizada y conserva evidencia legible de su identidad y rostro.',
          'Documenta a quién y cómo se avisó, además del motivo de la salida.',
          'Captura quién entrega, quién registra y una fotografía conjunta antes de permitir la salida.',
          'Revisa el resumen y confirma el protocolo. La hora automática se fijará exactamente al pulsar Guardar.',
        ][step]}</AlertDescription></Alert>

        {step === 0 && <StepStudent values={values} setValue={setValue} student={student} studentResults={studentResults} chooseStudent={chooseStudent} setStudent={setStudent} setAddOpen={setAddOpen} group={selectedGroup} level={selectedLevel} clock={clock} initialClock={initialClock} />}
        {step === 1 && <div className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><div><Label>Nombre completo de la persona que retira *</Label><Input value={String(values.pickupPersonName)} onChange={(e) => setValue('pickupPersonName', e.target.value)} autoComplete="name" /></div><div><Label>Parentesco *</Label><Select value={String(values.relationship)} onValueChange={(value) => setValue('relationship', value)}><SelectTrigger><SelectValue placeholder="Selecciona parentesco" /></SelectTrigger><SelectContent>{RELATIONSHIPS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>{values.relationship === 'otro' && <div><Label>Especifica el parentesco *</Label><Input value={String(values.relationshipOther)} onChange={(e) => setValue('relationshipOther', e.target.value)} /></div>}<FilterEvidenceCapture label="Identificación presentada" help="Fotografía legible o PDF de la identificación. La cámara trasera se abre por defecto." file={identificationEvidence} onChange={setIdentificationEvidence} allowPdf /><FilterEvidenceCapture label="Foto de la persona que retira" help="Centra el rostro y cuerpo dentro de la silueta; puedes cambiar a cámara frontal." file={pickupPersonPhoto} onChange={setPickupPersonPhoto} guide="adult" /></div>}
        {step === 2 && <div className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><div><Label>¿A quién se notificó? *</Label><Select value={String(values.notifiedParty)} onValueChange={(value) => setValue('notifiedParty', value)}><SelectTrigger><SelectValue placeholder="Selecciona una persona" /></SelectTrigger><SelectContent><SelectItem value="madre">Madre</SelectItem><SelectItem value="padre">Padre</SelectItem><SelectItem value="tutor">Tutor(a)</SelectItem></SelectContent></Select></div><div><Label>Nombre del personal notificado *</Label><Input value={String(values.notifiedStaffName)} onChange={(e) => setValue('notifiedStaffName', e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Profesor de grupo o personal del plantel al que se avisó del retiro.</p></div></div><div><Label>Medio de notificación *</Label><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">{METHODS.map((method) => <button type="button" key={method.value} onClick={() => setValue('notificationMethod', method.value)} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-sm transition ${values.notificationMethod === method.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}><method.icon className="h-5 w-5" />{method.label}</button>)}</div></div>{values.notificationMethod === 'otro' && <div><Label>Especifica el medio *</Label><Input value={String(values.notificationMethodOther)} onChange={(e) => setValue('notificationMethodOther', e.target.value)} /></div>}<div><Label>Motivo de retiro o salida *</Label><Select value={String(values.departureReason)} onValueChange={(value) => setValue('departureReason', value)}><SelectTrigger><SelectValue placeholder="Selecciona el motivo" /></SelectTrigger><SelectContent>{REASONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>{values.departureReason === 'otro' && <div><Label>Especifica el motivo *</Label><Input value={String(values.departureReasonOther)} onChange={(e) => setValue('departureReasonOther', e.target.value)} /></div>}<div><Label>Descripción y observaciones</Label><Textarea rows={5} value={String(values.description)} onChange={(e) => setValue('description', e.target.value)} placeholder="Agrega detalles útiles sobre la autorización, condición del alumno o entrega." /></div></div>}
        {step === 3 && <div className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><div><Label>Nombre del docente que entrega al alumno *</Label><Input value={String(values.deliveringTeacherName)} onChange={(e) => setValue('deliveringTeacherName', e.target.value)} /></div><div className="relative"><Label>Nombre del docente de guardia que registra *</Label><Input value={String(values.reporterName)} disabled={!initialData.isGeneral} onChange={(e) => setValue('reporterName', e.target.value)} autoComplete="off" />{reporterResults.length > 0 && <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover p-1 shadow-xl">{reporterResults.map((item) => <button type="button" key={item.id} onClick={() => { setValue('reporterName', item.name); setReporterResults([]); }} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">{item.name}</button>)}</div>}<p className="mt-1 text-xs text-muted-foreground">{initialData.isGeneral ? 'Obligatorio para Encargado general; se conservará para futuras búsquedas.' : 'Se obtiene de la cuenta autenticada.'}</p></div></div><div className="rounded-xl border bg-muted/30 p-4"><p className="text-sm font-semibold">Hora de salida</p><p className="mt-1 flex items-center gap-2 text-sm"><Clock3 className="h-4 w-4 text-primary" />{values.automaticTime ? `Se fijará al pulsar Guardar · ${new Intl.DateTimeFormat('es-MX', { timeZone: initialClock.timezone, dateStyle: 'medium', timeStyle: 'medium' }).format(clock)}` : String(values.departedAt)}</p></div><FilterEvidenceCapture label="Foto final: persona que retira y alumno juntos" help="Ambos deben quedar visibles dentro de las siluetas. Esta evidencia es obligatoria para confirmar la entrega." file={finalHandoverPhoto} onChange={setFinalHandoverPhoto} guide="adult-child" /><FilterSignaturePad label="Firma de la persona que retira" help="Firma dentro del recuadro con el dedo, lápiz digital o mouse." file={pickupSignature} onChange={setPickupSignature} /></div>}
        {step === 4 && <div className="space-y-5"><div className="rounded-xl border bg-muted/30 p-5"><h3 className="font-semibold">Resumen de entrega</h3><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Summary label="Alumno" value={student?.full_name} /><Summary label="Ubicación" value={`${selectedLevel?.name || ''} · ${selectedGroup?.grade_name || ''} · Grupo ${selectedGroup?.group_name || ''}`} /><Summary label="Persona que retira" value={String(values.pickupPersonName)} /><Summary label="Docente que entrega" value={String(values.deliveringTeacherName)} /><Summary label="Personal que registra" value={String(values.reporterName)} /><Summary label="Evidencias" value="Identificación, retrato, entrega conjunta y firma listas" /></dl></div><label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-5"><Checkbox checked={values.confirmed === true} onCheckedChange={(checked) => setValue('confirmed', checked === true)} className="mt-1" /><span><span className="font-semibold">Confirmación obligatoria</span><span className="mt-1 block text-sm text-muted-foreground">Confirmo que se verificó la identidad de la persona que retira al alumno y que se realizó la notificación correspondiente al padre, madre o tutor, conforme al procedimiento del plantel.</span></span></label>{draftStatus === 'queued' && <Alert><AlertCircle className="h-4 w-4" /><AlertTitle>Este registro ya está en cola</AlertTitle><AlertDescription>Puedes volver a pulsar Guardar para reintentar sin crear un duplicado.</AlertDescription></Alert>}</div>}

        <div className="flex flex-col-reverse justify-between gap-2 border-t pt-5 sm:flex-row"><Button variant="outline" disabled={step === 0 || saving} onClick={() => setStep((current) => Math.max(current - 1, 0))}><ArrowLeft className="mr-2 h-4 w-4" />Anterior</Button>{step < 4 ? <Button onClick={next}>Siguiente<ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button size="lg" disabled={saving || values.confirmed !== true} onClick={save}><ShieldCheck className="mr-2 h-5 w-5" />{saving ? 'Guardando y verificando…' : online ? 'Guardar salida anticipada' : 'Guardar para sincronizar'}</Button>}</div>
      </CardContent>
    </Card>

    <Card><CardHeader><CardTitle>Salidas recientes</CardTitle><CardDescription>Últimos 100 registros del equipo, aislados para esta institución.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Registro</TableHead><TableHead>Salida</TableHead><TableHead>Alumno</TableHead><TableHead>Retira</TableHead><TableHead>Motivo</TableHead><TableHead>Registró</TableHead><TableHead>Evidencias</TableHead></TableRow></TableHeader><TableBody>{initialData.recent.length ? initialData.recent.map((entry: any) => <TableRow key={entry.id}><TableCell>{new Intl.DateTimeFormat('es-MX', { timeZone: initialClock.timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.registered_at))}</TableCell><TableCell>{new Intl.DateTimeFormat('es-MX', { timeZone: initialClock.timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.departed_at))}</TableCell><TableCell><p className="font-medium">{entry.student_name}</p><p className="text-xs text-muted-foreground">{entry.level_name} · {entry.grade_name} · {entry.group_name}</p></TableCell><TableCell>{entry.pickup_person_name}</TableCell><TableCell>{REASONS.find(([value]) => value === entry.departure_reason)?.[1] || entry.departure_reason}</TableCell><TableCell>{entry.reporter_name}</TableCell><TableCell><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => openEvidence(entry.identification_evidence_path)}><FileText className="mr-1 h-3 w-3" />ID</Button><Button size="sm" variant="outline" onClick={() => openEvidence(entry.pickup_person_photo_path)}>Persona</Button><Button size="sm" variant="outline" onClick={() => openEvidence(entry.final_handover_photo_path)}>Entrega</Button></div></TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Aún no hay salidas anticipadas.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>

    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent><DialogHeader><DialogTitle>Alta rápida de alumno</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Nombre completo</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div><div><Label>Nivel, grado y grupo</Label><Select value={newGroup} onValueChange={setNewGroup}><SelectTrigger><SelectValue placeholder="Selecciona grupo" /></SelectTrigger><SelectContent>{initialData.groups.map((group: any) => <SelectItem key={group.id} value={group.id}>{groupLabel(group)}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button><Button disabled={newName.trim().length < 2 || !newGroup} onClick={addStudent}><Plus className="mr-2 h-4 w-4" />Agregar y seleccionar</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={resetOpen} onOpenChange={(open) => { setResetOpen(open); if (!open) setResetProgress(0); }}><DialogContent><DialogHeader><DialogTitle>¿Reiniciar todo el proceso?</DialogTitle></DialogHeader><div className="space-y-5"><Alert variant="destructive"><Trash2 className="h-4 w-4" /><AlertTitle>Se descartará el borrador local</AlertTitle><AlertDescription>También se borrarán las tres fotografías todavía no confirmadas por la base de datos. Esta acción no se puede deshacer.</AlertDescription></Alert><div className="space-y-3 rounded-xl border p-5"><Label>Desliza hasta el final para confirmar</Label><Slider value={[resetProgress]} onValueChange={([value]) => setResetProgress(value)} onValueCommit={async ([value]) => { if (value >= 100) await resetForm(); }} max={100} step={1} aria-label="Desliza para reiniciar" /><p className="text-center text-sm font-semibold text-primary">{resetProgress < 100 ? `${resetProgress}%` : 'Reiniciando…'}</p></div></div><DialogFooter><Button variant="outline" onClick={() => setResetOpen(false)}>Conservar proceso</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function StepStudent({ values, setValue, student, studentResults, chooseStudent, setStudent, setAddOpen, group, level, clock, initialClock }: any) {
  return <div className="space-y-5"><div className="relative"><Label>Nombre del alumno *</Label><div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={String(values.studentQuery)} onChange={(event) => { setValue('studentQuery', event.target.value); setStudent(null); }} autoComplete="off" placeholder="Escribe nombre o cualquiera de sus apellidos" />{studentResults.length > 0 && <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover p-1 shadow-xl">{studentResults.map((item: any) => <button type="button" key={item.id} onClick={() => chooseStudent(item)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">{item.full_name}</button>)}</div>}</div><Button type="button" variant="outline" size="icon" aria-label="Dar de alta alumno" onClick={() => setAddOpen(true)}><UserRoundPlus className="h-4 w-4" /></Button></div></div>{student && <div className="rounded-xl border border-primary/25 bg-primary/5 p-4"><p className="font-semibold text-primary"><CheckCircle2 className="mr-2 inline h-4 w-4" />{student.full_name}</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><ReadOnly label="Nivel" value={level?.name} /><ReadOnly label="Grado" value={group?.grade_name} /><ReadOnly label="Grupo" value={group?.group_name} /></div><p className="mt-3 text-xs text-muted-foreground">Información obtenida del padrón. No se puede modificar desde esta bitácora.</p></div>}<div className="space-y-2"><div className="flex items-center justify-between"><Label>Fecha y hora de salida *</Label><div className="flex items-center gap-2 text-xs"><span>Automática</span><Switch checked={values.automaticTime === true} onCheckedChange={(checked) => setValue('automaticTime', checked)} /></div></div>{values.automaticTime ? <div className="flex min-h-11 items-center gap-2 rounded-md border bg-muted/30 px-3 text-sm"><Clock3 className="h-4 w-4 text-primary" />{new Intl.DateTimeFormat('es-MX', { timeZone: initialClock.timezone, dateStyle: 'full', timeStyle: 'medium' }).format(clock)}</div> : <Input type="datetime-local" value={String(values.departedAt)} onChange={(e) => setValue('departedAt', e.target.value)} />}<p className="text-xs text-muted-foreground">Zona institucional: {initialClock.timezone}. En modo automático la hora definitiva se toma del servidor al guardar.</p></div></div>;
}

function ReadOnly({ label, value }: { label: string; value?: string }) { return <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value || 'Sin dato'}</p></div>; }
function Summary({ label, value }: { label: string; value?: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value || '—'}</dd></div>; }
