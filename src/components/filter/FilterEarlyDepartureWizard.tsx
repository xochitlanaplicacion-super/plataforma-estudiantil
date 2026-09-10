'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, CircleEllipsis, Clock3, DoorOpen, FileText, MessageCircle, MessageSquareText, Phone, Plus, RefreshCcw, Search, ShieldCheck, Signal, SignalZero, Trash2, UserRoundPlus, UsersRound } from 'lucide-react';
import { addFilterStudents, createEarlyDeparture, getFilterEvidenceUrl, searchFilterStudents } from '@/lib/actions/filter-control';
import { clearEarlyDepartureDraft, EarlyDepartureDraft, getEarlyDepartureDraft, PersistedFile, persistFile, restoreFileForUpload, saveEarlyDepartureDraft } from '@/lib/filter-early-departure-draft';
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
type EarlyFileKey = 'identificationEvidence' | 'pickupPersonPhoto' | 'finalHandoverPhoto' | 'pickupSignature';
const EARLY_FILE_LABELS: Record<EarlyFileKey, string> = { identificationEvidence: 'identificación', pickupPersonPhoto: 'foto de la persona', finalHandoverPhoto: 'foto final', pickupSignature: 'firma' };

export function FilterEarlyDepartureWizard({ initialData, initialClock }: { initialData: any; initialClock: any }) {
  const router = useRouter(); const { toast } = useToast();
  const draftScope = `${initialData.tenantId}:${initialData.actorUserId}`;
  const [values, setValues] = useState<Record<string, string | boolean>>({ ...EMPTY_VALUES, reporterName: initialData.isGeneral ? '' : initialData.actorName });
  const [student, setStudent] = useState<any>(null); const [studentResults, setStudentResults] = useState<any[]>([]);
  const [step, setStep] = useState(0); const [requestId, setRequestId] = useState('');
  const [identificationEvidence, setIdentificationEvidence] = useState<File | null>(null);
  const [pickupPersonPhoto, setPickupPersonPhoto] = useState<File | null>(null);
  const [finalHandoverPhoto, setFinalHandoverPhoto] = useState<File | null>(null);
  const [pickupSignature, setPickupSignature] = useState<File | null>(null);
  const [hydrated, setHydrated] = useState(false); const [draftReadFailed, setDraftReadFailed] = useState(false); const [draftReadAttempt, setDraftReadAttempt] = useState(0); const [storageSafe, setStorageSafe] = useState(true);
  const [recoveryFileIssues, setRecoveryFileIssues] = useState<EarlyFileKey[]>([]);
  const [draftStatus, setDraftStatus] = useState<'draft' | 'queued'>('draft');
  const [online, setOnline] = useState(true); const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null); const [clock, setClock] = useState(() => new Date(initialClock.iso || Date.now()));
  const [addOpen, setAddOpen] = useState(false); const [newName, setNewName] = useState(''); const [newGroup, setNewGroup] = useState(initialData.groups[0]?.id || '');
  const [resetOpen, setResetOpen] = useState(false); const [resetProgress, setResetProgress] = useState(0);
  const syncRunning = useRef(false); const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraftState = useRef<{ requestId: string; step: number; status: 'draft' | 'queued'; values: Record<string, string | boolean>; student: any; identificationEvidence: File | null; pickupPersonPhoto: File | null; finalHandoverPhoto: File | null; pickupSignature: File | null } | null>(null);
  const preservedUnrestoredFiles = useRef<Partial<Record<EarlyFileKey, PersistedFile>>>({});

  const setValue = (key: string, value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));
  const selectedGroup = useMemo(() => initialData.groups.find((item: any) => item.id === student?.group_id), [initialData.groups, student]);
  const selectedLevel = useMemo(() => initialData.levels.find((item: any) => item.id === selectedGroup?.level_id), [initialData.levels, selectedGroup]);
  const groupLabel = (group: any) => `${initialData.levels.find((item: any) => item.id === group.level_id)?.name || 'Nivel'} · ${group.grade_name} · Grupo ${group.group_name}`;

  const makeDraft = useCallback((status = draftStatus): EarlyDepartureDraft => ({
    version: 1, clientRequestId: requestId, step, status, updatedAt: new Date().toISOString(), values, student,
    identificationEvidence: identificationEvidence ? persistFile(identificationEvidence) : preservedUnrestoredFiles.current.identificationEvidence || null,
    pickupPersonPhoto: pickupPersonPhoto ? persistFile(pickupPersonPhoto) : preservedUnrestoredFiles.current.pickupPersonPhoto || null,
    finalHandoverPhoto: finalHandoverPhoto ? persistFile(finalHandoverPhoto) : preservedUnrestoredFiles.current.finalHandoverPhoto || null,
    pickupSignature: pickupSignature ? persistFile(pickupSignature) : preservedUnrestoredFiles.current.pickupSignature || null,
  }), [draftStatus, finalHandoverPhoto, identificationEvidence, pickupPersonPhoto, pickupSignature, requestId, step, student, values]);
  latestDraftState.current = hydrated && requestId ? { requestId, step, status: draftStatus, values, student, identificationEvidence, pickupPersonPhoto, finalHandoverPhoto, pickupSignature } : null;

  useEffect(() => {
    setOnline(navigator.onLine);
    const cameOnline = () => setOnline(true); const wentOffline = () => setOnline(false);
    window.addEventListener('online', cameOnline); window.addEventListener('offline', wentOffline);
    return () => { window.removeEventListener('online', cameOnline); window.removeEventListener('offline', wentOffline); };
  }, []);
  useEffect(() => { const timer = setInterval(() => setClock((current) => new Date(current.getTime() + 1000)), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    setHydrated(false);
    getEarlyDepartureDraft(draftScope).then(async (draft) => {
      setDraftReadFailed(false);
      if (draft?.version === 1 && draft.clientRequestId) {
        setRequestId(draft.clientRequestId); setStep(Math.min(Math.max(draft.step, 0), 4)); setDraftStatus(draft.status);
        setValues({ ...EMPTY_VALUES, reporterName: initialData.isGeneral ? '' : initialData.actorName, ...draft.values }); setStudent(draft.student);
        const [identificationEvidence, pickupPersonPhoto, finalHandoverPhoto, pickupSignature] = await Promise.all([
          restoreFileForUpload(draft.identificationEvidence), restoreFileForUpload(draft.pickupPersonPhoto),
          restoreFileForUpload(draft.finalHandoverPhoto), restoreFileForUpload(draft.pickupSignature || null),
        ]);
        const restored = { identificationEvidence, pickupPersonPhoto, finalHandoverPhoto, pickupSignature };
        const persisted: Partial<Record<EarlyFileKey, PersistedFile | null>> = { identificationEvidence: draft.identificationEvidence, pickupPersonPhoto: draft.pickupPersonPhoto, finalHandoverPhoto: draft.finalHandoverPhoto, pickupSignature: draft.pickupSignature || null };
        const damaged = (Object.keys(restored) as EarlyFileKey[]).filter((key) => persisted[key] && !restored[key]);
        preservedUnrestoredFiles.current = Object.fromEntries(damaged.map((key) => [key, persisted[key]]));
        setIdentificationEvidence(restored.identificationEvidence); setPickupPersonPhoto(restored.pickupPersonPhoto); setFinalHandoverPhoto(restored.finalHandoverPhoto); setPickupSignature(restored.pickupSignature);
        setRecoveryFileIssues(damaged);
        toast(damaged.length
          ? { variant: 'destructive', title: 'Borrador recuperado parcialmente', description: `Vuelve a capturar: ${damaged.map((key) => EARLY_FILE_LABELS[key]).join(', ')}.` }
          : { title: draft.status === 'queued' ? 'Registro pendiente recuperado' : 'Borrador recuperado', description: 'Los datos y fotografías se reconstruyeron y están listos para revisión.' });
      } else setRequestId(crypto.randomUUID());
    }).catch(() => { setDraftReadFailed(true); setStorageSafe(false); }).finally(() => setHydrated(true));
  }, [draftReadAttempt, draftScope, initialData.actorName, initialData.isGeneral, toast]);
  useEffect(() => {
    if (!hydrated || !requestId) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void saveEarlyDepartureDraft(draftScope, makeDraft()).then(() => { setStorageSafe(true); setSavedAt(new Date().toISOString()); }).catch(() => setStorageSafe(false));
    }, 350);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, [draftScope, hydrated, makeDraft, requestId]);
  useEffect(() => () => {
    const current = latestDraftState.current;
    if (current) {
      const draft: EarlyDepartureDraft = {
        version: 1, clientRequestId: current.requestId, step: current.step, status: current.status,
        updatedAt: new Date().toISOString(), values: current.values, student: current.student,
        identificationEvidence: persistFile(current.identificationEvidence), pickupPersonPhoto: persistFile(current.pickupPersonPhoto),
        finalHandoverPhoto: persistFile(current.finalHandoverPhoto), pickupSignature: persistFile(current.pickupSignature),
      };
      if (!draft.identificationEvidence) draft.identificationEvidence = preservedUnrestoredFiles.current.identificationEvidence || null;
      if (!draft.pickupPersonPhoto) draft.pickupPersonPhoto = preservedUnrestoredFiles.current.pickupPersonPhoto || null;
      if (!draft.finalHandoverPhoto) draft.finalHandoverPhoto = preservedUnrestoredFiles.current.finalHandoverPhoto || null;
      if (!draft.pickupSignature) draft.pickupSignature = preservedUnrestoredFiles.current.pickupSignature || null;
      void saveEarlyDepartureDraft(draftScope, draft).catch(() => undefined);
    }
  }, [draftScope]);
  useEffect(() => {
    if (!hydrated) return;
    const persistNow = () => { if (persistTimer.current) clearTimeout(persistTimer.current); void saveEarlyDepartureDraft(draftScope, makeDraft()).catch(() => setStorageSafe(false)); };
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
  const validationError = (targetStep = step) => {
    if (targetStep === 0 && !student) return 'Selecciona un alumno de los resultados de búsqueda.';
    if (targetStep === 0 && values.automaticTime === false && !values.departedAt) return 'Indica la fecha y hora personalizada.';
    if (targetStep === 1 && String(values.pickupPersonName).trim().length < 2) return 'Escribe el nombre completo de quien retira.';
    if (targetStep === 1 && !values.relationship) return 'Selecciona el parentesco.';
    if (targetStep === 1 && values.relationship === 'otro' && String(values.relationshipOther).trim().length < 2) return 'Especifica el parentesco.';
    if (targetStep === 1 && !identificationEvidence) return 'Adjunta la identificación presentada.';
    if (targetStep === 1 && !pickupPersonPhoto) return 'Toma o adjunta la foto de la persona que retira.';
    if (targetStep === 2 && !values.notifiedParty) return 'Indica quién notificó.';
    if (targetStep === 2 && String(values.notifiedStaffName).trim().length < 2) return 'Escribe el nombre del personal notificado.';
    if (targetStep === 2 && !values.notificationMethod) return 'Selecciona el medio de notificación.';
    if (targetStep === 2 && values.notificationMethod === 'otro' && String(values.notificationMethodOther).trim().length < 2) return 'Especifica el medio de notificación.';
    if (targetStep === 2 && !values.departureReason) return 'Selecciona el motivo de retiro.';
    if (targetStep === 2 && values.departureReason === 'otro' && String(values.departureReasonOther).trim().length < 2) return 'Especifica el motivo de retiro.';
    if (targetStep === 3 && String(values.deliveringTeacherName).trim().length < 2) return 'Escribe el nombre del docente que entrega al alumno.';
    if (targetStep === 3 && !finalHandoverPhoto) return 'Toma la foto final de la persona que retira junto con el alumno.';
    if (targetStep === 3 && !pickupSignature) return 'Solicita la firma de la persona que retira al alumno.';
    if (targetStep === 4 && recoveryFileIssues.length) return `Vuelve a capturar los archivos que no pudieron recuperarse: ${recoveryFileIssues.map((key) => EARLY_FILE_LABELS[key]).join(', ')}.`;
    if (targetStep === 4 && values.confirmed !== true) return 'Marca la confirmación obligatoria para finalizar.';
    return null;
  };
  const next = () => { const error = validationError(); if (error) return toast({ variant: 'destructive', title: 'Completa este paso', description: error }); setStep((current) => Math.min(current + 1, 4)); };
  const chooseStudent = (selected: any) => { const canonical = initialData.students.find((item: any) => item.id === selected.id) || selected; setStudent(canonical); setValue('studentQuery', canonical.full_name); setStudentResults([]); };
  const replaceFile = (key: EarlyFileKey, file: File | null) => {
    delete preservedUnrestoredFiles.current[key];
    setRecoveryFileIssues((current) => current.filter((item) => item !== key));
    if (key === 'identificationEvidence') setIdentificationEvidence(file);
    if (key === 'pickupPersonPhoto') setPickupPersonPhoto(file);
    if (key === 'finalHandoverPhoto') setFinalHandoverPhoto(file);
    if (key === 'pickupSignature') setPickupSignature(file);
  };
  const addStudent = async () => {
    const result = await addFilterStudents({ groupId: newGroup, names: [newName] });
    if (!result.success) return toast({ variant: 'destructive', title: 'No se agregó el alumno', description: result.error });
    const search = await searchFilterStudents(newName); if (search.success && search.data[0]) chooseStudent(search.data[0]);
    setAddOpen(false); setNewName(''); toast({ title: 'Alumno agregado al padrón' }); router.refresh();
  };

  const formDataFromDraft = async (draft: EarlyDepartureDraft) => {
    const data = new FormData(); data.set('clientRequestId', draft.clientRequestId); data.set('studentId', String((draft.student as any)?.id || ''));
    Object.entries(draft.values).forEach(([key, value]) => data.set(key, String(value)));
    const [identification, pickup, handover, signature] = await Promise.all([restoreFileForUpload(draft.identificationEvidence), restoreFileForUpload(draft.pickupPersonPhoto), restoreFileForUpload(draft.finalHandoverPhoto), restoreFileForUpload(draft.pickupSignature || null)]);
    if (identification) data.set('identificationEvidence', identification); if (pickup) data.set('pickupPersonPhoto', pickup); if (handover) data.set('finalHandoverPhoto', handover); if (signature) data.set('pickupSignature', signature);
    return data;
  };
  const resetState = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current); latestDraftState.current = null; preservedUnrestoredFiles.current = {};
    setRequestId(crypto.randomUUID()); setStep(0); setDraftStatus('draft');
    setValues({ ...EMPTY_VALUES, reporterName: initialData.isGeneral ? '' : initialData.actorName }); setStudent(null);
    setIdentificationEvidence(null); setPickupPersonPhoto(null); setFinalHandoverPhoto(null); setPickupSignature(null); setRecoveryFileIssues([]); setResetProgress(0); setResetOpen(false);
  }, [initialData.actorName, initialData.isGeneral]);
  const resetForm = useCallback(async () => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    try { await clearEarlyDepartureDraft(draftScope); resetState(); }
    catch { setStorageSafe(false); toast({ variant: 'destructive', title: 'No se pudo reiniciar', description: 'La copia local no se eliminó. Revisa el almacenamiento del navegador y vuelve a intentarlo.' }); }
  }, [draftScope, resetState, toast]);
  const sendDraft = useCallback(async (draft: EarlyDepartureDraft, wasLocallyCommitted: boolean) => {
    const preserveForRetry = async () => {
      const queued = { ...draft, status: 'queued' as const, updatedAt: new Date().toISOString() };
      setDraftStatus('queued');
      try { await saveEarlyDepartureDraft(draftScope, queued); setStorageSafe(true); return true; }
      catch { setStorageSafe(false); return wasLocallyCommitted; }
    };
    try {
      const result = await createEarlyDeparture(await formDataFromDraft(draft));
      if (!result.success) {
        const protectedLocally = await preserveForRetry();
        toast({ variant: 'destructive', title: 'No se pudo guardar todavía', description: protectedLocally ? `${result.error} La copia local confirmada permanece disponible; corrige lo indicado y pulsa Guardar.` : `${result.error} Los datos siguen en pantalla, pero el navegador no confirmó una copia local: no cierres esta pestaña.` });
        return;
      }
      latestDraftState.current = null;
      if (persistTimer.current) clearTimeout(persistTimer.current);
      const localCopyRemoved = await clearEarlyDepartureDraft(draftScope).then(() => true).catch(() => false);
      resetState();
      toast({ title: result.duplicate ? 'La salida ya estaba registrada' : 'Salida anticipada guardada y auditada', description: localCopyRemoved ? 'La base de datos confirmó el registro y se retiró la copia temporal.' : 'La base de datos confirmó el registro. El navegador no pudo retirar la copia temporal, pero no se volverá a enviar automáticamente.' });
      router.refresh();
    } catch (error) {
      const protectedLocally = await preserveForRetry();
      toast({ variant: 'destructive', title: 'Sin conexión con el servidor', description: protectedLocally ? `${error instanceof Error ? error.message : 'La conexión se interrumpió.'} La copia local confirmada permanece disponible; pulsa Guardar para reintentar.` : 'La conexión falló y el navegador no confirmó el almacenamiento local. Los datos siguen en pantalla; no cierres esta pestaña.' });
    } finally { syncRunning.current = false; setSaving(false); }
  }, [draftScope, resetState, router, toast]);
  const save = async () => {
    if (syncRunning.current) return;
    const error = validationError(4); if (error) return toast({ variant: 'destructive', title: 'No se puede finalizar', description: error });
    const draft = makeDraft(online ? 'draft' : 'queued');
    syncRunning.current = true; setSaving(true);
    if (persistTimer.current) clearTimeout(persistTimer.current);
    let locallyCommitted = false;
    try { await saveEarlyDepartureDraft(draftScope, draft); locallyCommitted = true; setStorageSafe(true); setSavedAt(new Date().toISOString()); }
    catch { setStorageSafe(false); }
    if (!online) {
      setDraftStatus('queued');
      syncRunning.current = false; setSaving(false);
      return toast(locallyCommitted
        ? { title: 'Borrador protegido sin conexión', description: 'No se enviará automáticamente. Pulsa Guardar cuando el dispositivo recupere internet.' }
        : { variant: 'destructive', title: 'No se pudo proteger el borrador', description: 'El navegador no confirmó el guardado local. Los datos siguen en pantalla: no cierres esta pestaña.' });
    }
    await sendDraft(draft, locallyCommitted);
  };
  const openEvidence = async (path: string) => { const result = await getFilterEvidenceUrl(path); if (result.success && result.url) window.open(result.url, '_blank', 'noopener,noreferrer'); else toast({ variant: 'destructive', title: 'No se pudo abrir', description: result.error }); };

  if (!hydrated) return <Card><CardContent className="flex min-h-64 items-center justify-center">Recuperando el proceso guardado en este dispositivo…</CardContent></Card>;
  if (draftReadFailed) return <Card className="mx-auto max-w-2xl"><CardHeader><CardTitle>No fue posible leer la copia local</CardTitle><CardDescription>Por seguridad no se inició ni sobrescribió ningún proceso. Tus datos anteriores permanecen intactos en este dispositivo.</CardDescription></CardHeader><CardContent className="space-y-4"><Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Recuperación detenida</AlertTitle><AlertDescription>Verifica que el navegador permita almacenamiento para este sitio. En Safari evita la navegación privada y vuelve a intentarlo.</AlertDescription></Alert><Button onClick={() => { setStorageSafe(true); setDraftReadAttempt((current) => current + 1); }}>Reintentar recuperación</Button></CardContent></Card>;

  return <div className={`space-y-6 ${saving ? 'pointer-events-none' : ''}`} aria-busy={saving}>
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-primary sm:text-3xl"><DoorOpen />Bitácora de salidas anticipadas</h1><p className="text-muted-foreground">Entrega segura, guiada y auditable dentro de esta institución.</p></div><Button variant="outline" disabled={saving} onClick={() => setResetOpen(true)}><RefreshCcw className="mr-2 h-4 w-4" />Reiniciar proceso</Button></div>
    <Alert variant={!storageSafe || recoveryFileIssues.length ? 'destructive' : 'default'}>{online ? <Signal className="h-4 w-4" /> : <SignalZero className="h-4 w-4" />}<AlertTitle>{recoveryFileIssues.length ? 'Revisa los archivos recuperados' : !storageSafe ? 'El almacenamiento local no está disponible' : draftStatus === 'queued' ? 'Guardado pendiente y protegido' : online ? 'Borrador protegido' : 'Modo sin conexión'}</AlertTitle><AlertDescription>{recoveryFileIssues.length ? `Los demás datos sí se recuperaron. Vuelve a capturar: ${recoveryFileIssues.map((key) => EARLY_FILE_LABELS[key]).join(', ')}.` : !storageSafe ? 'No cierres ni recargues esta página hasta guardar. Revisa que el navegador permita almacenamiento del sitio.' : draftStatus === 'queued' ? 'Se recuperaron los datos y las fotos. Nada se enviará hasta que pulses Guardar.' : `Textos y fotos se conservan en este dispositivo${savedAt ? ` · última copia ${new Date(savedAt).toLocaleTimeString('es-MX')}` : ''}.`}</AlertDescription></Alert>
    <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Paso {step + 1} de {STEPS.length}: {STEPS[step]}</CardTitle><CardDescription>Completa los datos señalados para habilitar el siguiente paso.</CardDescription></div><Badge variant="outline">{Math.round(((step + 1) / STEPS.length) * 100)}%</Badge></div><Progress value={((step + 1) / STEPS.length) * 100} /><div className="hidden grid-cols-5 gap-2 pt-2 md:grid">{STEPS.map((title, index) => <div key={title} className={`text-center text-xs ${index <= step ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{index + 1}. {title}</div>)}</div></CardHeader>
      <CardContent className="space-y-6">
        <Alert className="border-primary/30 bg-primary/5"><BadgeCheck className="h-4 w-4" /><AlertTitle>Guía activa</AlertTitle><AlertDescription>{[
          'Busca y selecciona al alumno. Verifica que el nivel, grado y grupo sean correctos; estos datos no se pueden editar aquí.',
          'Registra a la persona autorizada y conserva evidencia legible de su identidad y rostro.',
          'Documenta a quién y cómo se avisó, además del motivo de la salida.',
          'Captura quién entrega y una fotografía conjunta antes de permitir la salida.',
          'Revisa el resumen y confirma el protocolo. La hora automática se fijará exactamente al pulsar Guardar.',
        ][step]}</AlertDescription></Alert>

        {step === 0 && <StepStudent values={values} setValue={setValue} student={student} studentResults={studentResults} chooseStudent={chooseStudent} setStudent={setStudent} setAddOpen={setAddOpen} group={selectedGroup} level={selectedLevel} clock={clock} initialClock={initialClock} />}
        {step === 1 && <div className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><div><Label>Nombre completo de la persona que retira *</Label><Input value={String(values.pickupPersonName)} onChange={(e) => setValue('pickupPersonName', e.target.value)} autoComplete="name" /></div><div><Label>Parentesco *</Label><Select value={String(values.relationship)} onValueChange={(value) => setValue('relationship', value)}><SelectTrigger><SelectValue placeholder="Selecciona parentesco" /></SelectTrigger><SelectContent>{RELATIONSHIPS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>{values.relationship === 'otro' && <div><Label>Especifica el parentesco *</Label><Input value={String(values.relationshipOther)} onChange={(e) => setValue('relationshipOther', e.target.value)} /></div>}<FilterEvidenceCapture label="Identificación presentada" help="Fotografía legible o PDF de la identificación. La cámara trasera se abre por defecto." file={identificationEvidence} onChange={(file) => replaceFile('identificationEvidence', file)} allowPdf /><FilterEvidenceCapture label="Foto de la persona que retira" help="Centra el rostro y cuerpo dentro de la silueta; puedes cambiar a cámara frontal." file={pickupPersonPhoto} onChange={(file) => replaceFile('pickupPersonPhoto', file)} guide="adult" /></div>}
        {step === 2 && <div className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><div><Label>¿Quién notificó? *</Label><Select value={String(values.notifiedParty)} onValueChange={(value) => setValue('notifiedParty', value)}><SelectTrigger><SelectValue placeholder="Selecciona una persona" /></SelectTrigger><SelectContent><SelectItem value="madre">Madre</SelectItem><SelectItem value="padre">Padre</SelectItem><SelectItem value="tutor">Tutor(a)</SelectItem><SelectItem value="familiar_autorizado">Familiar autorizado</SelectItem></SelectContent></Select></div><div><Label>Nombre del personal notificado *</Label><Input value={String(values.notifiedStaffName)} onChange={(e) => setValue('notifiedStaffName', e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Profesor de grupo o personal del plantel al que se avisó del retiro.</p></div></div><div><Label>Medio de notificación *</Label><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">{METHODS.map((method) => <button type="button" key={method.value} onClick={() => setValue('notificationMethod', method.value)} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-sm transition ${values.notificationMethod === method.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}><method.icon className="h-5 w-5" />{method.label}</button>)}</div></div>{values.notificationMethod === 'otro' && <div><Label>Especifica el medio *</Label><Input value={String(values.notificationMethodOther)} onChange={(e) => setValue('notificationMethodOther', e.target.value)} /></div>}<div><Label>Motivo de retiro o salida *</Label><Select value={String(values.departureReason)} onValueChange={(value) => setValue('departureReason', value)}><SelectTrigger><SelectValue placeholder="Selecciona el motivo" /></SelectTrigger><SelectContent>{REASONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>{values.departureReason === 'otro' && <div><Label>Especifica el motivo *</Label><Input value={String(values.departureReasonOther)} onChange={(e) => setValue('departureReasonOther', e.target.value)} /></div>}<div><Label>Descripción y observaciones</Label><Textarea rows={5} value={String(values.description)} onChange={(e) => setValue('description', e.target.value)} placeholder="Agrega detalles útiles sobre la autorización, condición del alumno o entrega." /></div></div>}
        {step === 3 && <div className="space-y-5"><div><Label>Nombre del docente que entrega al alumno *</Label><Input value={String(values.deliveringTeacherName)} onChange={(e) => setValue('deliveringTeacherName', e.target.value)} /></div><div className="rounded-xl border bg-muted/30 p-4"><p className="text-sm font-semibold">Hora de salida</p><p className="mt-1 flex items-center gap-2 text-sm"><Clock3 className="h-4 w-4 text-primary" />{values.automaticTime ? `Se fijará al pulsar Guardar · ${new Intl.DateTimeFormat('es-MX', { timeZone: initialClock.timezone, dateStyle: 'medium', timeStyle: 'medium' }).format(clock)}` : String(values.departedAt)}</p></div><FilterEvidenceCapture label="Foto final: persona que retira y alumno juntos" help="Ambos deben quedar visibles dentro de las siluetas. Esta evidencia es obligatoria para confirmar la entrega." file={finalHandoverPhoto} onChange={(file) => replaceFile('finalHandoverPhoto', file)} guide="adult-child" /><FilterSignaturePad label="Firma de la persona que retira" help="Firma dentro del recuadro con el dedo, lápiz digital o mouse." file={pickupSignature} onChange={(file) => replaceFile('pickupSignature', file)} /></div>}
        {step === 4 && <div className="space-y-5"><div className="rounded-xl border bg-muted/30 p-5"><h3 className="font-semibold">Resumen de entrega</h3><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Summary label="Alumno" value={student?.full_name} /><Summary label="Ubicación" value={`${selectedLevel?.name || ''} · ${selectedGroup?.grade_name || ''} · Grupo ${selectedGroup?.group_name || ''}`} /><Summary label="Persona que retira" value={String(values.pickupPersonName)} /><Summary label="Docente que entrega" value={String(values.deliveringTeacherName)} /><Summary label="Evidencias" value="Identificación, retrato, entrega conjunta y firma listas" /></dl></div><label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-5"><Checkbox checked={values.confirmed === true} onCheckedChange={(checked) => setValue('confirmed', checked === true)} className="mt-1" /><span><span className="font-semibold">Confirmación obligatoria</span><span className="mt-1 block text-sm text-muted-foreground">Confirmo que se verificó la identidad de la persona que retira al alumno y que se realizó la notificación correspondiente al padre, madre, tutor o familiar autorizado, conforme al procedimiento del plantel.</span></span></label>{draftStatus === 'queued' && <Alert><AlertCircle className="h-4 w-4" /><AlertTitle>Este registro ya está en cola</AlertTitle><AlertDescription>Puedes volver a pulsar Guardar para reintentar sin crear un duplicado.</AlertDescription></Alert>}</div>}

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
