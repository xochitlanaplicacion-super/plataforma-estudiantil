'use client';

import { useEffect, useState } from 'react';
import { Download, Link2, QrCode, Save, Smartphone } from 'lucide-react';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

import {
  loadTeacherQrBatchAction,
  linkTeacherProvisionalStudentAction,
  loadTeacherProvisionalLinksAction,
  loadTeacherMobileCaptureSettingsAction,
  saveTeacherMobileCaptureSettingAction,
  type TeacherProvisionalLinksDto,
  type TeacherMobileCaptureSettingDto,
} from '@/lib/actions/calificaciones';
import type { AcademicAssignmentOptionDto, AcademicCriterionConfigurationDto } from '@/lib/academic/configuration-dto';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

async function imageUrlToPng(url: string | null) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const objectUrl = URL.createObjectURL(await response.blob());
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('No se pudo leer el logotipo.'));
    });
    image.src = objectUrl;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, image.naturalWidth);
    canvas.height = Math.max(1, image.naturalHeight);
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    URL.revokeObjectURL(objectUrl);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function rgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}

function safeFileName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

const defaults = (criterionId: string): TeacherMobileCaptureSettingDto => ({
  criterionId,
  minimumGrade: 5,
  increment: 1,
  qrReader: false,
  confirmBeforeSave: false,
});

export function TeacherMobileCaptureSettings({
  criteria,
  assignmentId,
  qrAssignments,
}: {
  criteria: AcademicCriterionConfigurationDto[];
  assignmentId: string;
  qrAssignments: AcademicAssignmentOptionDto[];
}) {
  const eligible = criteria.filter((criterion) => criterion.active && criterion.type !== 'actividades');
  const [settings, setSettings] = useState<Record<string, TeacherMobileCaptureSettingDto>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [exportingQr, setExportingQr] = useState(false);
  const [qrAssignmentId, setQrAssignmentId] = useState(assignmentId);
  const [qrStudentType, setQrStudentType] = useState<'registered' | 'provisional'>('registered');
  const [provisionalLinks, setProvisionalLinks] = useState<TeacherProvisionalLinksDto>({ provisionals: [], candidates: [] });
  const [provisionalSelection, setProvisionalSelection] = useState<Record<string, string>>({});
  const [confirmingLink, setConfirmingLink] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadTeacherMobileCaptureSettingsAction().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setSettings(Object.fromEntries(result.data.map((setting) => [setting.criterionId, setting])));
    });
    return () => { active = false; };
  }, []);

  async function reloadProvisionals() {
    const result = await loadTeacherProvisionalLinksAction(assignmentId);
    if (result.ok) setProvisionalLinks(result.data);
    else setMessage(result.error.message);
  }

  useEffect(() => {
    void reloadProvisionals();
    // La asignación identifica el grupo; los criterios no cambian esta lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  useEffect(() => setQrAssignmentId(assignmentId), [assignmentId]);

  function update(criterionId: string, changes: Partial<TeacherMobileCaptureSettingDto>) {
    setSettings((current) => ({
      ...current,
      [criterionId]: { ...(current[criterionId] ?? defaults(criterionId)), ...changes },
    }));
  }

  async function save(criterionId: string) {
    setSaving(criterionId);
    setMessage('');
    const result = await saveTeacherMobileCaptureSettingAction(settings[criterionId] ?? defaults(criterionId));
    if (result.ok) {
      setSettings((current) => ({ ...current, [criterionId]: result.data }));
      setMessage('Ajustes móviles guardados. La aplicación los recibirá al actualizar.');
    } else {
      setMessage(result.error.message);
    }
    setSaving(null);
  }

  async function exportQrBatch() {
    setExportingQr(true);
    setMessage('Preparando las credenciales QR del grupo…');
    try {
      const result = await loadTeacherQrBatchAction({ assignmentId: qrAssignmentId, studentType: qrStudentType });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      if (result.data.students.length === 0) {
        setMessage(qrStudentType === 'provisional'
          ? 'Este grupo no tiene alumnos provisionales pendientes.'
          : 'El grupo activo todavía no tiene alumnos registrados para generar credenciales.');
        return;
      }
      const [logo, qrImages] = await Promise.all([
        imageUrlToPng(result.data.institution.logoUrl),
        Promise.all(result.data.students.map((student) => QRCode.toDataURL(`xch:v1:${student.token}`, { width: 512, margin: 1, errorCorrectionLevel: 'M' }))),
      ]);
      const documentPdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const color = rgb(result.data.institution.primaryColor);
      const perPage = 8;
      result.data.students.forEach((student, index) => {
        const pageIndex = index % perPage;
        if (index > 0 && pageIndex === 0) documentPdf.addPage();
        if (pageIndex === 0) {
          documentPdf.setFillColor(...color);
          documentPdf.rect(0, 0, 210, 28, 'F');
          if (logo) documentPdf.addImage(logo, 'PNG', 12, 5, 18, 18, undefined, 'FAST');
          documentPdf.setTextColor(255, 255, 255);
          documentPdf.setFont('helvetica', 'bold');
          documentPdf.setFontSize(14);
          documentPdf.text(result.data.institution.name, logo ? 34 : 12, 12);
          documentPdf.setFont('helvetica', 'normal');
          documentPdf.setFontSize(9);
          documentPdf.text(`${result.data.assignment.subjectName} · ${result.data.assignment.groupName} · ${result.data.cycleName} · ${result.data.periodName}`, logo ? 34 : 12, 18);
        }
        const column = pageIndex % 2;
        const row = Math.floor(pageIndex / 2);
        const x = 12 + column * 95.5;
        const y = 33 + row * 63;
        documentPdf.setDrawColor(210, 218, 229);
        documentPdf.setFillColor(255, 255, 255);
        documentPdf.roundedRect(x, y, 90.5, 58, 2.5, 2.5, 'FD');
        if (logo) documentPdf.addImage(logo, 'PNG', x + 5, y + 3, 9, 9, undefined, 'FAST');
        documentPdf.addImage(qrImages[index], 'PNG', x + 5, y + 15, 34, 34, undefined, 'FAST');
        documentPdf.setTextColor(...color);
        documentPdf.setFont('helvetica', 'bold');
        documentPdf.setFontSize(7);
        documentPdf.text(result.data.institution.name.toUpperCase().slice(0, 35), x + (logo ? 17 : 5), y + 8);
        documentPdf.setTextColor(20, 32, 52);
        documentPdf.setFontSize(11);
        const nameLines = documentPdf.splitTextToSize(student.name, 42) as string[];
        documentPdf.text(nameLines.slice(0, 3), x + 45, y + 19);
        documentPdf.setTextColor(80, 93, 115);
        documentPdf.setFont('helvetica', 'normal');
        documentPdf.setFontSize(8);
        documentPdf.text(result.data.assignment.groupName, x + 45, y + 38);
        documentPdf.text(student.studentType === 'provisional'
          ? 'ALUMNO PROVISIONAL · PENDIENTE'
          : student.enrollmentCode ? `Matrícula: ${student.enrollmentCode}` : 'Alumno registrado', x + 45, y + 44);
        documentPdf.setFontSize(6.5);
        documentPdf.text('Uso interno. Presentar al profesor.', x + 45, y + 51);
      });
      documentPdf.save(`credenciales-qr-${qrStudentType === 'provisional' ? 'provisionales' : 'registrados'}-${safeFileName(result.data.assignment.subjectName)}-${safeFileName(result.data.assignment.groupName)}.pdf`);
      setMessage(`${result.data.students.length} credenciales de alumnos ${qrStudentType === 'provisional' ? 'provisionales' : 'registrados'} generadas con el ciclo y periodo activos.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo generar el archivo de credenciales.');
    } finally {
      setExportingQr(false);
    }
  }

  async function linkProvisional(provisionalId: string) {
    const enrollmentId = provisionalSelection[provisionalId];
    if (!enrollmentId) {
      setMessage('Selecciona primero la cuenta oficial del alumno.');
      return;
    }
    setLinking(provisionalId);
    setMessage('Vinculando y migrando las capturas…');
    const result = await linkTeacherProvisionalStudentAction({ provisionalId, enrollmentId });
    if (result.ok) {
      setMessage(`Vinculación completa: ${result.data.migratedCaptures} captura(s) migradas a la libreta oficial.`);
      setConfirmingLink(null);
      await reloadProvisionals();
    } else {
      setMessage(result.error.message);
    }
    setLinking(null);
  }

  if (eligible.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Smartphone aria-hidden="true" />Captura rápida en la aplicación</CardTitle>
        <CardDescription>
          Ajusta los botones que verá la aplicación para este profesor. El ciclo y el periodo se toman automáticamente de la configuración activa de la institución.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">{message}</p> : null}
        {eligible.map((criterion) => {
          const value = settings[criterion.id] ?? defaults(criterion.id);
          return (
            <section key={criterion.id} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 xl:grid-cols-12 xl:items-end">
              <div className="min-w-0 xl:col-span-2">
                <p className="font-semibold">{criterion.name}</p>
                <p className="text-sm text-muted-foreground">Ajustes propios de este criterio</p>
              </div>
              <div className="min-w-0 space-y-2 xl:col-span-2">
                <Label htmlFor={`mobile-minimum-${criterion.id}`}>Mínima visible</Label>
                <select id={`mobile-minimum-${criterion.id}`} className="h-10 w-full rounded-md border bg-background px-3" value={value.minimumGrade} onChange={(event) => update(criterion.id, { minimumGrade: Number(event.target.value) })}>
                  {Array.from({ length: 11 }, (_, number) => <option key={number} value={number}>{number}</option>)}
                </select>
              </div>
              <div className="min-w-0 space-y-2 xl:col-span-2">
                <Label htmlFor={`mobile-increment-${criterion.id}`}>Incremento</Label>
                <select id={`mobile-increment-${criterion.id}`} className="h-10 w-full rounded-md border bg-background px-3" value={value.increment} onChange={(event) => update(criterion.id, { increment: Number(event.target.value) as 0.1 | 0.5 | 1 })}>
                  <option value={1}>1 punto</option><option value={0.5}>0.5</option><option value={0.1}>0.1</option>
                </select>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border p-3 xl:col-span-2">
                <Label htmlFor={`mobile-qr-${criterion.id}`} className="flex items-center gap-2"><QrCode className="size-4" aria-hidden="true" />Lector QR</Label>
                <Switch id={`mobile-qr-${criterion.id}`} checked={value.qrReader} onCheckedChange={(checked) => update(criterion.id, { qrReader: checked })} />
              </div>
              <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border p-3 xl:col-span-2">
                <Label htmlFor={`mobile-confirm-${criterion.id}`}>Confirmar cada captura</Label>
                <Switch id={`mobile-confirm-${criterion.id}`} checked={value.confirmBeforeSave} onCheckedChange={(checked) => update(criterion.id, { confirmBeforeSave: checked })} />
              </div>
              <Button type="button" className="w-full xl:col-span-2" disabled={saving === criterion.id} onClick={() => void save(criterion.id)}><Save />{saving === criterion.id ? 'Guardando…' : 'Guardar'}</Button>
            </section>
          );
        })}
        <section className="grid gap-4 rounded-lg border border-dashed p-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(18rem,1.3fr)_minmax(13rem,.8fr)_auto] lg:items-end">
          <div>
            <p className="flex items-center gap-2 font-semibold"><QrCode className="size-5" aria-hidden="true" />Credenciales QR del grupo</p>
            <p className="text-xs text-muted-foreground">La credencial provisional conserva el mismo QR cuando el alumno se vincula con su inscripción oficial.</p>
            <p className="text-sm text-muted-foreground">Elige claramente el nivel, grado, grupo y materia que aparecerán en el PDF.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="teacher-qr-assignment">Nivel, grado, grupo y materia</Label>
            <select id="teacher-qr-assignment" className="h-10 w-full rounded-md border bg-background px-3" value={qrAssignmentId} onChange={(event) => setQrAssignmentId(event.target.value)}>
              {qrAssignments.map((row) => <option key={row.id} value={row.id}>Nivel: {row.levelName} · Grado: {row.gradeName} · Grupo: {row.groupName} · Materia: {row.subjectName}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="teacher-qr-student-type">Tipo de alumno</Label>
            <select id="teacher-qr-student-type" className="h-10 w-full rounded-md border bg-background px-3" value={qrStudentType} onChange={(event) => setQrStudentType(event.target.value as 'registered' | 'provisional')}>
              <option value="registered">Alumnos registrados</option>
              <option value="provisional">Alumnos provisionales pendientes</option>
            </select>
          </div>
          <Button type="button" variant="outline" disabled={exportingQr || !qrAssignmentId} onClick={() => void exportQrBatch()}><Download />{exportingQr ? 'Generando…' : 'Descargar PDF de este grupo'}</Button>
        </section>
        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <p className="flex items-center gap-2 font-semibold"><Link2 className="size-5" aria-hidden="true" />Alumnos provisionales pendientes</p>
            <p className="text-sm text-muted-foreground">Elige manualmente la inscripción oficial correcta. Al confirmar, todas sus capturas pasan juntas a la libreta y la operación queda auditada.</p>
          </div>
          {provisionalLinks.provisionals.length === 0 ? <p className="rounded-md bg-muted/40 p-3 text-sm">No hay altas provisionales pendientes en este grupo.</p> : provisionalLinks.provisionals.map((provisional) => (
            <div key={provisional.id} className="grid gap-3 rounded-md border bg-muted/20 p-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.5fr)_auto] lg:items-end">
              <div><p className="font-medium">{provisional.name}</p><p className="text-xs text-muted-foreground">{provisional.captureCount} captura(s) protegidas</p></div>
              <div className="space-y-1"><Label htmlFor={`official-student-${provisional.id}`}>Cuenta oficial de destino</Label><select id={`official-student-${provisional.id}`} className="h-10 w-full rounded-md border bg-background px-3" value={provisionalSelection[provisional.id] ?? ''} onChange={(event) => { setProvisionalSelection((current) => ({ ...current, [provisional.id]: event.target.value })); setConfirmingLink(null); }}><option value="">Selecciona alumno oficial</option>{provisionalLinks.candidates.map((candidate) => <option key={candidate.enrollmentId} value={candidate.enrollmentId}>{candidate.name}{candidate.enrollmentCode ? ` · ${candidate.enrollmentCode}` : ''}</option>)}</select></div>
              <div className="flex gap-2">{confirmingLink === provisional.id ? <><Button type="button" variant="outline" onClick={() => setConfirmingLink(null)}>Cancelar</Button><Button type="button" disabled={linking === provisional.id} onClick={() => void linkProvisional(provisional.id)}>{linking === provisional.id ? 'Migrando…' : 'Confirmar migración'}</Button></> : <Button type="button" variant="outline" disabled={!provisionalSelection[provisional.id]} onClick={() => setConfirmingLink(provisional.id)}><Link2 />Vincular</Button>}</div>
            </div>
          ))}
        </section>
      </CardContent>
    </Card>
  );
}
