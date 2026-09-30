'use client';

import { useMemo, useState } from 'react';
import { Download, FileText, Search } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { getFilterReportPackets } from '@/lib/actions/filter-control';
import { normalizeFilterName } from '@/lib/filter-control';
import { FilterReportEvent, FilterReportRow, groupFilterReportRows } from '@/lib/filter-report-events';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Selection = { type: 'early' | 'extraordinary'; id: string };
type ReportEvent = FilterReportEvent<FilterReportRow>;
type Institution = Record<string, string | null | undefined>;
type PdfColor = [number, number, number];

export function FilterReports({ initialData }: { initialData: any }) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const allEvents = useMemo(() => groupFilterReportRows([
    ...initialData.early.map((row: FilterReportRow) => ({ ...row, _type: 'early' as const })),
    ...initialData.extraordinary.map((row: FilterReportRow) => ({ ...row, _type: 'extraordinary' as const })),
  ]), [initialData]);
  const rows = useMemo(() => {
    const needle = normalizeFilterName(query);
    return allEvents.filter((event) =>
      (type === 'all' || event.type === type)
      && (!needle || event.students.some((student) => normalizeFilterName(student.student_name).includes(needle)))
    );
  }, [allEvents, query, type]);
  const selectedEvents = allEvents.filter((event) => selected.includes(event.key));
  const allVisibleSelected = rows.length > 0 && rows.every((event) => selected.includes(event.key));

  const exportPdf = async (explicit?: ReportEvent[]) => {
    if (busy) return;
    const chosen = explicit || selectedEvents;
    if (!chosen.length) return;
    const targets: Selection[] = chosen.map((event) => ({ type: event.type, id: event.id }));
    setBusy(true);
    try {
      for (let offset = 0; offset < targets.length; offset += 40) {
        const result = await getFilterReportPackets(targets.slice(offset, offset + 40));
        if (!result.success) throw new Error(result.error);
        const packetEvents = groupFilterReportRows([
          ...(result.early || []).map((row: FilterReportRow) => ({ ...row, _type: 'early' as const })),
          ...(result.extraordinary || []).map((row: FilterReportRow) => ({ ...row, _type: 'extraordinary' as const })),
        ]);
        if (!packetEvents.length) throw new Error('El expediente seleccionado no está disponible.');
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        for (let index = 0; index < packetEvents.length; index++) {
          if (index) doc.addPage();
          await drawEvent(doc, packetEvents[index], result.institution || {}, result.urls || {});
        }
        doc.save(`bitacoras-filtro${targets.length > 40 ? `-parte-${offset / 40 + 1}` : ''}.pdf`);
      }
      toast({ title: 'PDF generado', description: `${chosen.length} expediente(s) exportados.` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo generar el PDF', description: error instanceof Error ? error.message : 'Error inesperado' });
    } finally {
      setBusy(false);
    }
  };

  return <div className="space-y-6">
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold text-primary"><FileText />Reportes de entregas</h1>
      <p className="text-muted-foreground">Consulta, selecciona e imprime salidas anticipadas y entregas extraordinarias con sus evidencias.</p>
    </div>
    <Card>
      <CardHeader>
        <CardTitle>Expedientes</CardTitle>
        <CardDescription>Un trámite grupal aparece como un expediente. Cada exportación queda registrada en auditoría; los lotes grandes se separan automáticamente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cualquier alumno" />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ambas bitácoras</SelectItem>
              <SelectItem value="early">Salidas anticipadas</SelectItem>
              <SelectItem value="extraordinary">Entregas extraordinarias</SelectItem>
            </SelectContent>
          </Select>
          <Button disabled={busy || !selectedEvents.length} onClick={() => void exportPdf()}>
            <Download className="mr-2 h-4 w-4" />{busy ? 'Preparando…' : `Descargar ${selectedEvents.length} expediente(s)`}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={allVisibleSelected} onCheckedChange={(checked) => setSelected((current) => {
            const visible = new Set(rows.map((event) => event.key));
            return checked ? [...new Set([...current, ...visible])] : current.filter((key) => !visible.has(key));
          })} />
          Seleccionar todos los resultados visibles
        </label>
        <div className="space-y-2">
          {rows.map((event) => <div key={event.key} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/40">
            <Checkbox
              className="mt-1"
              aria-label={`Seleccionar expediente de ${event.students.map((student) => student.student_name).join(', ')}`}
              checked={selected.includes(event.key)}
              onCheckedChange={(checked) => setSelected((current) => checked
                ? [...new Set([...current, event.key])]
                : current.filter((key) => key !== event.key))}
            />
            <div className="min-w-0 flex-1">
              <b className="break-words">{event.students.length === 1 ? event.students[0].student_name : `${event.students.length} alumnos: ${event.students.map((student) => student.student_name).join(', ')}`}</b>
              <span className="block text-xs text-muted-foreground">
                {event.type === 'early' ? 'Salida anticipada' : 'Entrega extraordinaria'} · {new Date(event.registeredAt).toLocaleString('es-MX')} · {String(event.students[0].reporter_name || '—')}
              </span>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void exportPdf([event])}>PDF</Button>
          </div>)}
        </div>
      </CardContent>
    </Card>
  </div>;
}

async function dataUrl(url?: string) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const source = URL.createObjectURL(blob);
    return await new Promise<string>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) { URL.revokeObjectURL(source); return reject(new Error('canvas')); }
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(source);
        resolve(canvas.toDataURL('image/jpeg', .82));
      };
      image.onerror = () => { URL.revokeObjectURL(source); reject(new Error('image')); };
      image.src = source;
    });
  } catch { return null; }
}

function addContainedImage(doc: jsPDF, image: string, x: number, y: number, width: number, height: number) {
  try {
    const properties = doc.getImageProperties(image);
    const scale = Math.min(width / properties.width, height / properties.height);
    const w = properties.width * scale;
    const h = properties.height * scale;
    doc.addImage(image, 'JPEG', x + (width - w) / 2, y + (height - h) / 2, w, h, undefined, 'FAST');
    return true;
  } catch { return false; }
}

function enumLabel(value: unknown) {
  const labels: Record<string, string> = {
    madre: 'Madre', padre: 'Padre', tutor: 'Tutor(a)', abuelo: 'Abuelo(a)', hermano: 'Hermano(a)', familiar_autorizado: 'Familiar autorizado', otro: 'Otro',
    whatsapp: 'WhatsApp', llamada: 'Llamada telefónica', sms: 'Mensaje de texto', presencial: 'Comunicación presencial',
    cita_medica: 'Cita médica', malestar: 'Enfermedad o malestar', asunto_familiar: 'Asunto familiar', salida_autorizada: 'Salida anticipada autorizada', cambio_transporte: 'Cambio de transporte',
    entregado: 'Entregado', rechazado: 'Rechazado', cancelado: 'Cancelado', familiar: 'Familiar', persona_confianza: 'Persona de confianza', transportista: 'Transportista', personal_medico: 'Personal médico', autoridad: 'Autoridad',
    videollamada: 'Videollamada', correo: 'Correo registrado', documento: 'Documento firmado', verified: 'Verificada', pending: 'Pendiente', approved: 'Aprobado',
  };
  const key = String(value || '');
  return labels[key] || key || '—';
}

function textLines(doc: jsPDF, value: unknown, width: number, size: number, weight: 'normal' | 'bold' = 'normal'): string[] {
  doc.setFont('helvetica', weight);
  doc.setFontSize(size);
  return doc.splitTextToSize(String(value ?? '').trim() || '—', width) as string[];
}

function drawCell(doc: jsPDF, label: string, lines: string[], x: number, y: number, width: number, height: number, color: PdfColor, alternate: boolean) {
  doc.setFillColor(...(alternate ? [247, 249, 252] as PdfColor : [255, 255, 255] as PdfColor));
  doc.setDrawColor(220, 226, 234);
  doc.roundedRect(x, y, width, height, 1.2, 1.2, 'FD');
  doc.setTextColor(...color);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text(label.toUpperCase(), x + 3, y + 3.7);
  doc.setTextColor(31, 41, 55);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(lines, x + 3, y + 7.8, { lineHeightFactor: 1.15 });
}

function drawHeader(doc: jsPDF, event: ReportEvent, institution: Institution, logo: string | null, continued: boolean, color: PdfColor) {
  const name = institution.nombre_completo || institution.nombre_corto || 'Institución';
  doc.setFillColor(...color);
  doc.rect(0, 0, 210, 28, 'F');
  if (logo) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, 4, 20, 20, 2, 2, 'F');
    addContainedImage(doc, logo, 14, 6, 16, 16);
  } else {
    doc.setFillColor(255, 255, 255);
    doc.circle(22, 14, 9, 'F');
    doc.setTextColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(String(name).slice(0, 2).toUpperCase(), 22, 17, { align: 'center' });
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  const nameLines = textLines(doc, name, 158, 12, 'bold');
  doc.text(nameLines.slice(0, 2), 38, 10, { lineHeightFactor: 1 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('EXPEDIENTE CONFIDENCIAL · CONTROL DE FILTRO', 38, 21);
  const contact = [institution.telefono_contacto, institution.correo_contacto].filter(Boolean).join(' · ');
  if (contact) {
    doc.setFontSize(6);
    doc.text(textLines(doc, contact, 158, 6)[0], 38, 25);
  }
  doc.setTextColor(20, 30, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(event.type === 'early' ? 'Bitácora de salida anticipada' : 'Entrega a persona extraordinaria', 12, 37);
  doc.setTextColor(90, 100, 115);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`FOLIO ${(event.groupEventId || event.id).toUpperCase()}${continued ? ' · CONTINUACIÓN' : ''}`, 12, 44);
}

function reportFields(row: FilterReportRow): Array<[string, unknown]> {
  if (row._type === 'early') return [
    ['Fecha y hora', fmt(row.departed_at)], ['Persona que retira', row.pickup_person_name],
    ['Parentesco', `${enumLabel(row.relationship)}${row.relationship_other ? ` · ${row.relationship_other}` : ''}`], ['¿Quién notificó?', enumLabel(row.notified_party)],
    ['Medio de notificación', enumLabel(row.notification_method)], ['Personal notificado', row.notified_staff_name],
    ['Motivo', `${enumLabel(row.departure_reason)}${row.departure_reason_other ? ` · ${row.departure_reason_other}` : ''}`], ['Docente que entrega', row.delivering_teacher_name],
  ];
  const fields: Array<[string, unknown]> = [
    ['Fecha y hora', fmt(row.departed_at || row.registered_at)], ['Persona que retira', row.pickup_person_name],
    ['Relación', enumLabel(row.pickup_relationship)], ['Autorización', `${enumLabel(row.authorization_method)} · ${row.authorizer_name || '—'}`],
    ['Consentimiento', enumLabel(row.consent_status)], ['Resolución', enumLabel(row.status)],
    ['Docente que entrega', row.delivering_teacher_name], ['Personal que registra', row.reporter_name],
  ];
  if (row.status !== 'entregado' && row.resolution_reason) fields.push(['Motivo de resolución', row.resolution_reason]);
  return fields;
}

type Evidence = { label: string; path: string | null };
function evidenceItems(event: ReportEvent): Evidence[] {
  const items: Evidence[] = [];
  for (const [field, label] of [
    ['pickup_person_photo_path', 'Persona que retira'],
    ['final_handover_photo_path', 'Entrega final'],
  ] as const) {
    if (field === 'final_handover_photo_path' && event.type === 'extraordinary' && event.students[0].status !== 'entregado') continue;
    const byPath = new Map<string, number[]>();
    event.students.forEach((student, index) => {
      const path = String(student[field] || '');
      if (path) byPath.set(path, [...(byPath.get(path) || []), index + 1]);
    });
    if (!byPath.size) items.push({ label, path: null });
    else for (const [path, numbers] of byPath) items.push({
      label: byPath.size === 1 ? label : `${label} · alumno(s) ${numbers.join(', ')}`,
      path,
    });
  }
  return items;
}

export async function drawEvent(doc: jsPDF, event: ReportEvent, institution: Institution, urls: Record<string, string>) {
  const color = hex(institution.color_primario || '#0f766e');
  const pale = mixWithWhite(color, .9);
  const logo = await dataUrl(institution.logo_url || undefined);
  const startPage = doc.getNumberOfPages();
  drawHeader(doc, event, institution, logo, false, color);
  let y = 48;
  const nextPage = () => {
    doc.addPage();
    drawHeader(doc, event, institution, logo, true, color);
    y = 48;
  };
  const ensureSpace = (height: number) => { if (y + height > 276) nextPage(); };

  const rosterHeader = () => {
    ensureSpace(12);
    doc.setFillColor(...pale);
    doc.setDrawColor(...color);
    doc.roundedRect(12, y, 186, 8, 1.5, 1.5, 'FD');
    doc.setTextColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`ALUMNOS (${event.students.length})`, 16, y + 5.3);
    y += 9;
  };
  rosterHeader();
  for (const student of event.students) {
    const nameLines = textLines(doc, student.student_name, 116, 9, 'bold');
    const groupLines = textLines(doc, `${student.level_name || '—'} · ${student.grade_name || '—'} · ${student.group_name || '—'}`, 53, 8);
    const height = Math.max(11, 4.2 * Math.max(nameLines.length, groupLines.length) + 5);
    if (y + height > 276) { nextPage(); rosterHeader(); }
    doc.setFillColor(250, 251, 253);
    doc.setDrawColor(220, 226, 234);
    doc.roundedRect(12, y, 186, height, 1.3, 1.3, 'FD');
    doc.setTextColor(20, 30, 45);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(nameLines, 16, y + 5, { lineHeightFactor: 1.1 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(groupLines, 141, y + 5, { lineHeightFactor: 1.1 });
    y += height + 1.5;
  }

  y += 2;
  ensureSpace(10);
  doc.setTextColor(20, 30, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Datos del trámite', 12, y + 5);
  y += 9;
  const fields = reportFields(event.students[0]);
  for (let index = 0; index < fields.length; index += 2) {
    const left = textLines(doc, fields[index][1], 85, 8);
    const right = fields[index + 1] ? textLines(doc, fields[index + 1][1], 85, 8) : [];
    const height = Math.max(11, Math.max(left.length, right.length) * 3.7 + 7);
    ensureSpace(height + 1.5);
    drawCell(doc, fields[index][0], left, 12, y, 91, height, color, (index / 2) % 2 === 1);
    if (fields[index + 1]) drawCell(doc, fields[index + 1][0], right, 107, y, 91, height, color, (index / 2) % 2 === 1);
    y += height + 1.5;
  }

  const observations = event.type === 'early' ? event.students[0].description : event.students[0].final_observations;
  const observationLines = textLines(doc, observations || 'Sin observaciones.', 178, 7.8);
  let lineIndex = 0;
  while (lineIndex < observationLines.length) {
    ensureSpace(16);
    const availableLines = Math.max(1, Math.floor((276 - y - 10) / 3.8));
    const lines = observationLines.slice(lineIndex, lineIndex + availableLines);
    const height = 9 + lines.length * 3.8;
    doc.setFillColor(250, 251, 253);
    doc.setDrawColor(220, 226, 234);
    doc.roundedRect(12, y, 186, height, 1.5, 1.5, 'FD');
    doc.setTextColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(lineIndex ? 'DESCRIPCIÓN Y OBSERVACIONES (CONTINUACIÓN)' : 'DESCRIPCIÓN Y OBSERVACIONES', 16, y + 4.5);
    doc.setTextColor(40, 48, 62);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.text(lines, 16, y + 9, { lineHeightFactor: 1.05 });
    y += height + 2;
    lineIndex += lines.length;
  }

  const photos = evidenceItems(event);
  const isUndelivered = event.type === 'extraordinary' && event.students[0].status !== 'entregado';
  const signaturePaths = isUndelivered ? [] : [...new Set(event.students.map((student) => String(student.pickup_signature_path || '')).filter(Boolean))];
  const minimumEvidenceHeight = 8 + Math.ceil(photos.length / 2) * 59 + (isUndelivered ? 19 : signaturePaths.length ? 59 : 19);
  if (event.students.length > 1 || y + minimumEvidenceHeight > 276) nextPage();

  ensureSpace(8);
  doc.setTextColor(20, 30, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Evidencias fotográficas', 12, y + 5);
  y += 8;
  for (let index = 0; index < photos.length; index += 2) {
    ensureSpace(59);
    for (let i = 0; i < 2; i++) {
      const photo = photos[index + i];
      if (!photo) continue;
      const x=i===0?12:107;
      doc.setFillColor(247, 249, 252);
      doc.setDrawColor(220, 226, 234);
      doc.roundedRect(x, y, 91, 58, 2, 2, 'FD');
      doc.setTextColor(60, 70, 85);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(photo.label, x + 4, y + 6);
      const image = photo.path && urls[photo.path] ? await dataUrl(urls[photo.path]) : null;
      if (image) addContainedImage(doc, image, x + 4, y + 9, 83, 45);
      else {
        doc.setTextColor(150, 158, 170);
        doc.setFont('helvetica', 'normal');
        doc.text('Sin imagen disponible', x + 45.5, y + 34, { align: 'center' });
      }
    }
    y += 59;
  }

  if (isUndelivered) {
    ensureSpace(19);
    doc.setFillColor(...pale);
    doc.setDrawColor(...color);
    doc.roundedRect(12, y + 3, 186, 15, 2, 2, 'FD');
    doc.setTextColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Trámite ${enumLabel(event.students[0].status).toLowerCase()}: no se realizó la entrega ni se registró firma de recepción.`, 17, y + 12);
    y += 19;
  } else if (!signaturePaths.length) {
    ensureSpace(19);
    doc.setTextColor(95, 105, 118);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('No se registró firma de recepción en este expediente.', 12, y + 10);
    y += 19;
  } else {
    for (const signaturePath of signaturePaths) {
      const signerLines = textLines(doc, event.students[0].pickup_person_name || 'Persona que recibe', 108, 7);
      const height = Math.max(59, 53 + signerLines.length * 3.5);
      ensureSpace(height);
      doc.setFillColor(...pale);
      doc.setDrawColor(...color);
      doc.roundedRect(12, y + 3, 186, height - 3, 2, 2, 'FD');
      doc.setTextColor(...color);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Firma de la persona que recibe al alumno', 18, y + 12);
      doc.setTextColor(95, 105, 118);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('La firma forma parte del expediente digital verificado.', 18, y + 18);
      const signature = urls[signaturePath] ? await dataUrl(urls[signaturePath]) : null;
      if (signature) addContainedImage(doc, signature, 55, y + 20, 100, 27);
      else doc.text('Imagen de la firma no disponible', 105, y + 38, { align: 'center' });
      doc.setDrawColor(120, 130, 145);
      doc.line(50, y + 48, 160, y + 48);
      doc.text(signerLines, 105, y + 53, { align: 'center', lineHeightFactor: 1.1 });
      y += height;
    }
  }

  const endPage = doc.getNumberOfPages();
  for (let page = startPage; page <= endPage; page++) {
    doc.setPage(page);
    doc.setDrawColor(...color);
    doc.line(12, 280, 198, 280);
    doc.setTextColor(95, 105, 118);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(`Documento generado ${new Date().toLocaleString('es-MX')} · Registro protegido por la institución`, 12, 285);
    doc.text(`Página ${page - startPage + 1} de ${endPage - startPage + 1}`, 198, 285, { align: 'right' });
  }
  doc.setPage(endPage);
}

function fmt(value: unknown) { return value ? new Date(String(value)).toLocaleString('es-MX') : '—'; }
function hex(value: string): PdfColor {
  const clean = value.replace('#', '');
  return /^[0-9a-f]{6}$/i.test(clean)
    ? [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)]
    : [15, 118, 110];
}
function mixWithWhite(color: PdfColor, ratio: number): PdfColor {
  return color.map((channel) => Math.round(channel + (255 - channel) * ratio)) as PdfColor;
}
