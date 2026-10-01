import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TeacherActivityAuditReport } from '@/lib/actions/teacher-activity-audit';

export type TeacherActivityPdfInput = {
  report: TeacherActivityAuditReport;
  institution: {
    name: string;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    logoUrl?: string | null;
  };
  teacherId?: string;
};

const WIDTH = 297;
const HEIGHT = 210;
const INK: [number, number, number] = [26, 42, 55];
const MUTED: [number, number, number] = [85, 98, 109];
const PALE: [number, number, number] = [241, 246, 247];
const BORDER: [number, number, number] = [214, 224, 228];
const GREEN: [number, number, number] = [22, 119, 83];
const AMBER: [number, number, number] = [150, 96, 19];

function color(hex: string | null | undefined, fallback: [number, number, number]): [number, number, number] {
  const match = /^#?([\da-f]{6})$/i.exec(hex ?? '');
  if (!match) return fallback;
  const code = match[1];
  return [parseInt(code.slice(0, 2), 16), parseInt(code.slice(2, 4), 16), parseInt(code.slice(4, 6), 16)];
}

function headerColor(value: [number, number, number]): [number, number, number] {
  const brightness = (value[0] * 299 + value[1] * 587 + value[2] * 114) / 1000;
  return brightness > 155 ? value.map(channel => Math.round(channel * 0.5)) as [number, number, number] : value;
}

function clean(value: string | null | undefined) {
  return (value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}

function dateLabel(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

function timestampLabel(value: string, timezone: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: timezone,
  }).format(date);
}

function shortDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'short', timeZone: 'UTC',
  }).format(date);
}

function text(doc: jsPDF, value: string, x: number, y: number, width: number, size = 8, ink: [number, number, number] = INK, weight: 'normal' | 'bold' = 'normal', limit?: number) {
  doc.setFont('helvetica', weight);
  doc.setFontSize(size);
  doc.setTextColor(...ink);
  const lines = doc.splitTextToSize(clean(value), width) as string[];
  const visible = limit ? lines.slice(0, limit) : lines;
  if (limit && lines.length > limit && visible.length) {
    let last = visible[visible.length - 1];
    while (last.length && doc.getTextWidth(`${last}…`) > width) last = last.slice(0, -1);
    visible[visible.length - 1] = `${last}…`;
  }
  if (visible.length) doc.text(visible, x, y);
  return visible.length * size * 0.43;
}

async function logoData(url: string | null | undefined): Promise<string | null> {
  if (!url || typeof fetch === 'undefined') return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) return null;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function header(doc: jsPDF, input: TeacherActivityPdfInput, title: string, subtitle: string, logo: string | null, primary: [number, number, number]) {
  doc.setFillColor(...primary);
  doc.rect(0, 0, WIDTH, 36, 'F');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(13, 8, 21, 21, 2, 2, 'F');
  let imageAdded = false;
  if (logo) {
    try {
      const format = logo.startsWith('data:image/jpeg') ? 'JPEG' : logo.startsWith('data:image/webp') ? 'WEBP' : 'PNG';
      doc.addImage(logo, format, 14.5, 9.5, 18, 18);
      imageAdded = true;
    } catch { /* Monogram below keeps the brand block printable. */ }
  }
  if (!imageAdded) text(doc, (input.institution.name || 'IN').slice(0, 2).toUpperCase(), 18, 21.5, 13, 11, primary, 'bold', 1);
  text(doc, input.institution.name || input.report.scope.tenantName || 'Institución', 40, 14, 243, 10, [255, 255, 255], 'bold', 1);
  text(doc, title, 40, 24, 243, 16, [255, 255, 255], 'bold', 1);
  text(doc, subtitle, 40, 31, 243, 7.5, [233, 243, 245], 'normal', 1);
}

function metric(doc: jsPDF, x: number, y: number, width: number, label: string, value: string, accent: [number, number, number]) {
  doc.setFillColor(...PALE);
  doc.roundedRect(x, y, width, 28, 3, 3, 'F');
  doc.setFillColor(...accent);
  doc.rect(x, y, 2.5, 28, 'F');
  text(doc, label.toUpperCase(), x + 7, y + 8, width - 11, 7.3, MUTED, 'bold', 1);
  text(doc, value, x + 7, y + 22, width - 11, value.length > 12 ? 11 : 18, INK, 'bold', 1);
}

function trend(doc: jsPDF, starts: string[], values: number[], states: string[], x: number, y: number, width: number, height: number, accent: [number, number, number]) {
  text(doc, 'PUBLICACIONES REGISTRADAS · 8 SEMANAS', x, y, width, 9, INK, 'bold', 1);
  const top = y + 9;
  const bottom = y + height - 10;
  const max = Math.max(3, ...values.filter((_, index) => !['historical', 'rollout'].includes(states[index])));
  doc.setDrawColor(...BORDER);
  doc.line(x, bottom, x + width, bottom);
  const slot = width / Math.max(1, starts.length);
  starts.forEach((start, index) => {
    const state = states[index];
    const unmeasured = state === 'historical' || state === 'rollout';
    const count = values[index] ?? 0;
    const barHeight = count ? Math.max(2, (bottom - top) * count / max) : 0;
    const barX = x + slot * index + slot * 0.24;
    if (unmeasured) {
      doc.setFillColor(...PALE);
      doc.roundedRect(x + slot * index + 1, top, slot - 2, bottom - top, 2, 2, 'F');
    } else if (barHeight) {
      doc.setFillColor(...accent);
      doc.roundedRect(barX, bottom - barHeight, slot * 0.52, barHeight, 1.5, 1.5, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text(unmeasured ? 's/m' : `${count}${state === 'in_progress' || state === 'partial_range' ? '*' : ''}`, barX + slot * 0.26, unmeasured ? bottom - 5 : bottom - barHeight - 1.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(shortDate(start), x + slot * (index + 0.5), bottom + 5, { align: 'center' });
  });
}

function weeklyStatus(status: string, eligibility: string, nonApplicableReason?: string | null) {
  if (status === 'excused') return 'Justificada';
  if (nonApplicableReason === 'inactive') return 'No aplica · inactivo';
  if (nonApplicableReason === 'no_assignment') return 'No aplica · sin materias';
  if (nonApplicableReason === 'before_registration') return 'Anterior al alta';
  if (nonApplicableReason === 'registration_week') return 'Semana de alta';
  if (eligibility === 'historical') return 'Histórica · informativa';
  if (eligibility === 'rollout') return 'Inicio de seguimiento';
  if (eligibility === 'partial_range') return 'Rango parcial';
  if (eligibility === 'in_progress' || status === 'in_progress') return 'En curso';
  return status === 'met' ? 'Meta alcanzada' : status === 'below_goal' ? 'Bajo meta' : 'Informativa';
}

function pilotStatus(status: string) {
  if (status === 'visible_now') return 'Con vínculo hoy';
  if (status === 'published_then_hidden') return 'Publicó; sin vínculo hoy';
  if (status === 'created_not_visible') return 'Creó; sin vínculo hoy';
  if (status === 'copy_review') return 'Posible copia; revisar origen';
  if (status === 'joined_during_pilot') return 'Ingreso reciente; revisar';
  if (status === 'exception_review') return 'Excepción registrada; revisar';
  if (status === 'not_applicable') return 'No aplica actualmente';
  return 'Sin actividad localizable';
}

function currentWeek(teacher: TeacherActivityAuditReport['teachers'][number], report: TeacherActivityAuditReport) {
  return teacher.weeks.find(week => week.weekStart === report.currentWeek.start);
}

function subjectGroupBreakdown(teacher: TeacherActivityAuditReport['teachers'][number]) {
  const counts = new Map<string, { subject: string; group: string; count: number }>();
  for (const week of teacher.weeks) {
    for (const activity of week.evidence) {
      const subject = clean(activity.subjectName) || 'Materia sin dato histórico';
      const groups = Math.max(activity.groupIds.length, activity.groupNames.length, 1);
      for (let index = 0; index < groups; index++) {
        const group = clean(activity.groupNames[index]) || 'Grupo sin dato histórico';
        const key = `${subject}\u0000${activity.groupIds[index] ?? group}`;
        const current = counts.get(key) ?? { subject, group, count: 0 };
        current.count++;
        counts.set(key, current);
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count ||
    a.subject.localeCompare(b.subject, 'es') || a.group.localeCompare(b.group, 'es'));
}

function teacherPage(doc: jsPDF, input: TeacherActivityPdfInput, teacher: TeacherActivityAuditReport['teachers'][number], logo: string | null, primary: [number, number, number], secondary: [number, number, number]) {
  const report = input.report;
  const week = currentWeek(teacher, report);
  const published = week?.published ?? 0;
  doc.addPage();
  header(doc, input, 'ACTIVIDAD DEL PROFESOR', `${dateLabel(report.currentWeek.start)} al ${dateLabel(report.currentWeek.end)} · Meta docente: 3 publicaciones en la semana`, logo, primary);
  text(doc, teacher.name, 14, 47, 268, 12.5, INK, 'bold', 2);
  text(doc, teacher.email, 14, 59, 268, 8, MUTED, 'normal', 1);
  const currentEligibility = report.weeks.find(row => row.start === report.currentWeek.start)?.eligibility ?? 'tracked';
  const currentInformational = Boolean(week?.nonApplicableReason) || ['historical', 'rollout', 'partial_range'].includes(currentEligibility);
  metric(doc, 14, 65, 64, 'Esta semana', currentInformational ? `${published} observadas` : `${published} / 3`, primary);
  metric(doc, 82, 65, 64, 'Rango consultado', String(teacher.totalPublished), secondary);
  metric(doc, 150, 65, 64, 'Semanas evaluables', `${teacher.weeksMet} / ${teacher.trackedWeeks}`, GREEN);
  metric(doc, 218, 65, 65, 'Semanas justificadas', String(teacher.weeks.filter(row => row.exception).length), AMBER);

  doc.setFillColor(...PALE);
  doc.roundedRect(14, 102, 269, 14, 2, 2, 'F');
  text(doc, currentInformational ? 'Registro parcial' : 'Progreso semanal', 18, 111, 42, 8, INK, 'bold');
  doc.setFillColor(222, 233, 235);
  doc.roundedRect(66, 106, 157, 5, 2, 2, 'F');
  if (published > 0 && !currentInformational) {
    doc.setFillColor(...(published >= 3 ? GREEN : secondary));
    doc.roundedRect(66, 106, 157 * Math.min(published / 3, 1), 5, 2, 2, 'F');
  }
  text(doc, week ? weeklyStatus(week.status, report.weeks.find(row => row.start === week.weekStart)?.eligibility ?? 'tracked', week.nonApplicableReason) : 'Sin datos', 228, 111, 49, 7.5, published >= 3 && !currentInformational ? GREEN : MUTED, 'bold', 1);

  trend(doc, report.weeks.map(row => row.start), report.weeks.map(row => teacher.weeks.find(item => item.weekStart === row.start)?.published ?? 0), report.weeks.map(row => row.eligibility), 14, 130, 168, 53, secondary);
  text(doc, 'PUBLICADAS → ENTREGADAS → CALIFICADAS', 191, 130, 92, 8.3, INK, 'bold', 1);
  const stages = [
    ['Publicadas', String(published)],
    ['Entregas', week?.studentSubmissions === null || week?.studentSubmissions === undefined ? 'Sin seguimiento' : String(week.studentSubmissions)],
    ['Calificadas', week?.teacherReviews === null || week?.teacherReviews === undefined ? 'Sin seguimiento' : String(week.teacherReviews)],
  ];
  stages.forEach(([label, value], index) => {
    const x = 191 + index * 31;
    doc.setFillColor(...PALE);
    doc.roundedRect(x, 135, 29, 30, 2, 2, 'F');
    text(doc, label, x + 2, 143, 25, 7, MUTED, 'bold', 1);
    text(doc, value, x + 2, 155, 25, value.length > 7 ? 7 : 13, INK, 'bold', 2);
  });
  text(doc, `Pendientes por revisar hoy: ${teacher.pendingReviews}. Los conteos no son una tasa de conversión.`, 191, 174, 92, 7, MUTED, 'normal', 2);
  const bySubject = subjectGroupBreakdown(teacher);
  text(doc, bySubject.length
    ? `Materias/grupos: ${bySubject.slice(0, 2).map(row => `${row.subject} · ${row.group}: ${row.count}`).join('  |  ')}${bySubject.length > 2 ? '  · Ver anexo completo' : ''}`
    : 'Materias/grupos: sin publicaciones registradas en este rango.', 14, 191, 269, 7.5, MUTED, 'normal', 1);
}

function tableConfig(doc: jsPDF, input: TeacherActivityPdfInput, title: string, subtitle: string, logo: string | null, primary: [number, number, number]) {
  return {
    theme: 'striped' as const,
    margin: { top: 49, right: 14, bottom: 17, left: 14 },
    startY: 49,
    styles: { font: 'helvetica' as const, fontSize: 8, cellPadding: 2.1, textColor: INK, lineColor: BORDER, overflow: 'linebreak' as const },
    headStyles: { fillColor: primary, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: PALE },
    rowPageBreak: 'avoid' as const,
    didDrawPage: () => header(doc, input, title, subtitle, logo, primary),
  };
}

export async function buildTeacherActivityPdf(input: TeacherActivityPdfInput) {
  const report = input.report;
  const teachers = (input.teacherId ? report.teachers.filter(row => row.id === input.teacherId) : report.teachers)
    .slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (input.teacherId && teachers.length === 0) throw new Error('Profesor fuera del reporte');
  const primary = headerColor(color(input.institution.primaryColor, [27, 70, 78]));
  const secondary = headerColor(color(input.institution.secondaryColor, [40, 132, 139]));
  const logo = await logoData(input.institution.logoUrl);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const currentEligibility = report.weeks.find(week => week.start === report.currentWeek.start)?.eligibility;
  const applicableTeachers = teachers.filter(teacher => {
    const week = currentWeek(teacher, report);
    return week && !week.nonApplicableReason && !week.exception &&
      currentEligibility !== 'historical' && currentEligibility !== 'rollout' && currentEligibility !== 'partial_range';
  }).length;
  const publishedInRange = teachers.reduce((sum, teacher) => sum + teacher.totalPublished, 0);
  const weeksMet = teachers.reduce((sum, teacher) => sum + teacher.weeksMet, 0);
  const evaluableWeeks = teachers.reduce((sum, teacher) => sum + teacher.trackedWeeks, 0);
  const submissions = teachers.reduce((sum, teacher) => sum + teacher.weeks.reduce((total, week) => total + (week.studentSubmissions ?? 0), 0), 0);
  const reviews = teachers.reduce((sum, teacher) => sum + teacher.weeks.reduce((total, week) => total + (week.teacherReviews ?? 0), 0), 0);
  const pendingReviews = teachers.reduce((sum, teacher) => sum + teacher.pendingReviews, 0);
  header(doc, input, 'RESUMEN EJECUTIVO', `Actividad docente · ${dateLabel(report.scope.from)} al ${dateLabel(report.scope.to)}`, logo, primary);
  text(doc, 'Seguimiento de publicaciones semanales', 14, 51, 269, 17, INK, 'bold', 1);
  text(doc, `Generado: ${timestampLabel(report.generatedAt, report.scope.timezone)} · Zona horaria: ${report.scope.timezone} · Meta: 3 publicaciones por profesor y semana`, 14, 60, 269, 8.5, MUTED);
  metric(doc, 14, 67, 86, 'Docentes con meta esta semana', `${applicableTeachers} de ${teachers.length}`, primary);
  metric(doc, 105, 67, 86, 'Semanas con meta', `${weeksMet} de ${evaluableWeeks}`, secondary);
  metric(doc, 196, 67, 87, 'Publicaciones del rango', String(publishedInRange), GREEN);
  metric(doc, 14, 99, 86, 'Entregas observadas', String(submissions), secondary);
  metric(doc, 105, 99, 86, 'Pendientes de revisión hoy', String(pendingReviews), AMBER);
  metric(doc, 196, 99, 87, 'Revisiones observadas', String(reviews), GREEN);
  trend(doc, report.weeks.map(week => week.start), report.weeks.map(week => teachers.reduce((sum, teacher) => sum + (teacher.weeks.find(item => item.weekStart === week.start)?.published ?? 0), 0)), report.weeks.map(week => week.eligibility), 14, 136, 269, 42, secondary);
  doc.setFillColor(...PALE);
  doc.roundedRect(14, 181, 269, 18, 2, 2, 'F');
  text(doc, 's/m = sin medición antes de una captura completa; * = semana en curso o rango parcial. Estos periodos son informativos y la meta no se aplica retroactivamente.', 18, 188, 261, 7.5, MUTED, 'normal', 2);

  if (report.pilot) {
    const pilot = report.pilot;
    const pilotTeachers = input.teacherId
      ? pilot.teachers.filter((teacher) => teacher.teacherId === input.teacherId)
      : pilot.teachers;
    const pilotSubtitle = `${dateLabel(pilot.from)} al ${dateLabel(pilot.through)} · estado al ${timestampLabel(pilot.asOf, pilot.timezone)}`;
    doc.addPage();
    const pilotHeader = () => {
      header(doc, input, 'CORTE PRELIMINAR · DESDE 27 SEP', pilotSubtitle, logo, primary);
      text(doc, pilot.caveat, 14, 46, 269, 7.5, MUTED, 'normal', 3);
      text(doc, 'Creadas = originales localizables. Posibles copias = origen por revisar. Con vínculo hoy = acceso directo actual. Verificadas = eventos inmutables.', 14, 65, 269, 7.5, INK, 'bold', 1);
    };
    const priority: Record<string, number> = {
      no_current_evidence: 0, created_not_visible: 1,
      copy_review: 2, published_then_hidden: 3, visible_now: 4,
      joined_during_pilot: 5, exception_review: 6, not_applicable: 7,
    };
    autoTable(doc, {
      ...tableConfig(doc, input, 'CORTE PRELIMINAR · DESDE 27 SEP', pilotSubtitle, logo, primary),
      startY: 72,
      margin: { top: 72, right: 14, bottom: 17, left: 14 },
      didDrawPage: pilotHeader,
      head: [['Profesor', 'Creadas', 'Con vínculo hoy', 'Verificadas', 'Lectura']],
      body: pilotTeachers.slice().sort((a, b) => priority[a.status] - priority[b.status] || a.name.localeCompare(b.name, 'es')).map((teacher) => [
        clean(teacher.name), String(teacher.createdExisting), String(teacher.visibleNow),
        String(teacher.verifiedPublications), `${pilotStatus(teacher.status)}${teacher.status !== 'copy_review' && teacher.evidence.some((activity) => activity.possibleCopy) ? '; origen de copia por revisar' : ''}`,
      ]),
      columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 30 }, 2: { cellWidth: 37 }, 3: { cellWidth: 36 }, 4: { cellWidth: 76 } },
    });
    if (!pilotTeachers.length) text(doc, 'No hay docentes en este corte.', 18, 80, 260, 9, MUTED);

    const pilotEvidence = pilotTeachers.flatMap((teacher) => teacher.evidence.map((activity) => [
      clean(teacher.name), timestampLabel(activity.createdAt, pilot.timezone),
      clean(activity.title), activity.visibleNow ? 'Sí' : 'No',
      activity.possibleCopy
        ? 'Posible copia; origen por revisar'
        : activity.mixedCurrentAuthors ? 'Autoría de copias distinta; revisar' : 'Autor actual de la fila',
    ]));
    if (!input.teacherId) {
      pilotEvidence.push(...pilot.unattributed.map((activity) => [
        'Sin docente actual identificable', timestampLabel(activity.createdAt, pilot.timezone),
        clean(activity.title), activity.visibleNow ? 'Sí' : 'No',
        'Autoría por revisar',
      ]));
    }
    doc.addPage();
    autoTable(doc, {
      ...tableConfig(doc, input, 'ANEXO · CORTE PRELIMINAR', 'Fecha de creación y acceso por vínculo actual; no es historial certificado de publicaciones', logo, primary),
      head: [['Profesor actual', 'Creada', 'Actividad', 'Con vínculo hoy', 'Atribución']],
      body: pilotEvidence,
      columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 39 }, 2: { cellWidth: 95 }, 3: { cellWidth: 30 }, 4: { cellWidth: 50 } },
    });
    if (!pilotEvidence.length) text(doc, 'No hay actividades creadas y todavía existentes en este corte.', 18, 58, 260, 9, MUTED);
  }

  teachers.forEach(teacher => teacherPage(doc, input, teacher, logo, primary, secondary));

  const subtitle = `${teachers.length} profesor(es) · ${dateLabel(report.scope.from)} al ${dateLabel(report.scope.to)}`;
  doc.addPage();
  const weekRows = teachers.flatMap(teacher => teacher.weeks.map(week => [
    clean(teacher.name), shortDate(week.weekStart), ['historical', 'rollout'].includes(report.weeks.find(row => row.start === week.weekStart)?.eligibility ?? '') ? 'Sin medición' : String(week.published),
    week.studentSubmissions === null ? 'Sin seguimiento' : String(week.studentSubmissions),
    week.teacherReviews === null ? 'Sin seguimiento' : String(week.teacherReviews),
    weeklyStatus(week.status, report.weeks.find(row => row.start === week.weekStart)?.eligibility ?? 'tracked', week.nonApplicableReason),
  ]));
  autoTable(doc, {
    ...tableConfig(doc, input, 'ANEXO · SEMANAS', subtitle, logo, primary),
    head: [['Profesor', 'Semana', 'Publicadas', 'Entregas', 'Revisiones', 'Estado']],
    body: weekRows,
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 32 }, 2: { cellWidth: 30 }, 3: { cellWidth: 40 }, 4: { cellWidth: 40 }, 5: { cellWidth: 56 } },
  });
  if (!weekRows.length) text(doc, 'No hay semanas registradas en el alcance.', 18, 58, 260, 9, MUTED);

  doc.addPage();
  const subjectGroupRows = teachers.flatMap(teacher => subjectGroupBreakdown(teacher).map(row => [
    clean(teacher.name), row.subject, row.group, String(row.count),
  ]));
  autoTable(doc, {
    ...tableConfig(doc, input, 'ANEXO · MATERIAS Y GRUPOS', 'Una publicación en varios grupos aparece en cada grupo; la meta la cuenta una sola vez', logo, primary),
    head: [['Profesor', 'Materia', 'Grupo', 'Actividades']],
    body: subjectGroupRows,
    columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 83 }, 2: { cellWidth: 88 }, 3: { cellWidth: 33 } },
  });
  if (!subjectGroupRows.length) text(doc, 'No hay publicaciones registradas por materia y grupo en este rango.', 18, 58, 260, 9, MUTED);

  doc.addPage();
  const evidence = teachers.flatMap(teacher => teacher.weeks.flatMap(week => week.evidence.map(item => [
    clean(teacher.name), timestampLabel(item.publishedAt, report.scope.timezone),
    `${clean(item.title)}${item.activityType ? `\nTipo: ${clean(item.activityType)}` : ''}`,
    `${clean(item.subjectName) || 'Materia sin dato histórico'}\n${item.groupNames.length ? item.groupNames.map(clean).join(', ') : item.groupIds.length ? item.groupIds.join(', ') : 'Sin grupo registrado'}${item.dueAt ? `\nVence: ${timestampLabel(item.dueAt, report.scope.timezone)}` : '\nSin fecha límite'}`,
    weeklyStatus(week.status, report.weeks.find(row => row.start === week.weekStart)?.eligibility ?? 'tracked', week.nonApplicableReason),
    `Actividad: ${clean(item.logicalActivityId)}\nEjercicio: ${clean(item.exerciseId)}`,
  ])));
  autoTable(doc, {
    ...tableConfig(doc, input, 'ANEXO · EVIDENCIAS', `${evidence.length} primera(s) publicación(es) · sin datos de alumnos`, logo, primary),
    head: [['Profesor', 'Publicada', 'Título · tipo', 'Materia · grupos · límite', 'Estado semanal', 'Referencias']],
    body: evidence,
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 31 }, 2: { cellWidth: 77 }, 3: { cellWidth: 56 }, 4: { cellWidth: 34 }, 5: { cellWidth: 30 } },
  });
  if (!evidence.length) text(doc, 'No hay publicaciones registradas en el alcance.', 18, 58, 260, 9, MUTED);

  doc.addPage();
  const exceptions = teachers.flatMap(teacher => [
    ...teacher.weeks.filter(week => week.exception).map(week => [
      clean(teacher.name), shortDate(week.weekStart), 'Justificación autorizada',
      `${week.exception!.kind.replaceAll('_', ' ')}${week.exception!.teacherStartedOn ? ` · ingreso ${dateLabel(week.exception!.teacherStartedOn)}` : ''} · ${clean(week.exception!.note)} · registrada ${dateLabel(week.exception!.authorizedAt)}`,
    ]),
    ...teacher.exceptions.map(item => [clean(teacher.name), '—', 'Observación de datos', clean(item)]),
  ]);
  autoTable(doc, {
    ...tableConfig(doc, input, 'ANEXO · EXCEPCIONES', `${exceptions.length} justificación(es) u observación(es) · sin clasificar ausencias como incumplimiento`, logo, primary),
    head: [['Profesor', 'Semana', 'Tipo', 'Detalle']],
    body: exceptions,
    columnStyles: { 0: { cellWidth: 54 }, 1: { cellWidth: 31 }, 2: { cellWidth: 59 }, 3: { cellWidth: 124 } },
  });
  if (!exceptions.length) text(doc, 'No hay excepciones registradas en el alcance.', 18, 58, 260, 9, MUTED);
  const notes = `${report.metricNotes.studentSubmissions} ${report.metricNotes.teacherReviews} ${report.metricNotes.pendingReviews}`;
  const noteLines = doc.splitTextToSize(clean(notes), 261) as string[];
  if (noteLines.length) {
    doc.addPage();
    header(doc, input, 'NOTAS DE MEDICIÓN', subtitle, logo, primary);
    text(doc, 'Alcance de los conteos', 18, 55, 260, 13, INK, 'bold');
    text(doc, 'Las publicaciones, entregas y revisiones cuentan eventos diferentes. No constituyen una tasa de conversión.', 18, 68, 260, 9, MUTED);
    text(doc, 'La cobertura por tema (5 ejercicios/tema) del panel es otra medición.', 18, 79, 260, 8, MUTED);
    text(doc, 's/m = sin medición; * = semana en curso o rango parcial. Semanas históricas y de inicio no se evalúan.', 18, 84, 260, 7.5, MUTED);
    text(doc, 'Una actividad original vinculada a varios grupos aparece en cada grupo, pero cuenta una sola vez para la meta.', 18, 89, 260, 7.5, MUTED);
    text(doc, report.metricNotes.studentSubmissions, 18, 101, 260, 9, INK);
    text(doc, report.metricNotes.teacherReviews, 18, 132, 260, 9, INK);
    text(doc, report.metricNotes.pendingReviews, 18, 163, 260, 9, INK);
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setDrawColor(...BORDER);
    doc.line(14, HEIGHT - 12, WIDTH - 14, HEIGHT - 12);
    text(doc, 'Auditoría de actividad docente · uso administrativo', 14, HEIGHT - 7, 205, 7, MUTED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`${page} / ${pageCount}`, WIDTH - 14, HEIGHT - 7, { align: 'right' });
  }
  return doc;
}

export function teacherActivityPdfFilename(report: TeacherActivityAuditReport, teacherName?: string) {
  const suffix = teacherName ? teacherName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_') : 'General';
  return `Actividad_Profesores_${suffix}_${report.currentWeek.start}.pdf`;
}
