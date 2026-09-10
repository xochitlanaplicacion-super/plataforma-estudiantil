'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertCircle, CalendarCheck2, CalendarRange, CheckCircle2, Download, FileSpreadsheet, FileText, Loader2, RefreshCw } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadAcademicReportAction, type AcademicReport, type AcademicReportData } from '@/lib/actions/reportes-academicos';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type View = 'attendance' | 'evidence';
const dateLabel = (value: string) =>
  new Date(value + 'T12:00:00').toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
  });
const safeName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_');
const criterionLabel = (row: AcademicReport['criteria'][number]) => (row.subcriterionName ? `${row.criterionName} · ${row.subcriterionName}` : row.criterionName);
const resultLabel = (row: AcademicReport['students'][number], key: string, type: string) => {
  const value = row.results[key];
  if (!value) return '—';
  if (type === 'participacion') return `${value.participationPoints.toFixed(1)} pts`;
  if (value.expectedCount > 0 && !value.complete) {
    const partial = value.grade === null ? '' : ` · promedio parcial ${value.grade.toFixed(1)}`;
    return `Pendiente · ${value.gradedCount}/${value.expectedCount}${partial}`;
  }
  if (value.grade === null) return value.state === 'pendiente' ? 'Pendiente' : '—';
  return value.expectedCount > 0
    ? `${value.grade.toFixed(1)} · ${value.gradedCount}/${value.expectedCount}`
    : value.grade.toFixed(1);
};
const conceptGradeLabel = (
  student: AcademicReport['students'][number],
  concept: AcademicReport['concepts'][number],
) => {
  const grade = student.conceptGrades[concept.id];
  if (grade) return { value: grade.grade, state: grade.grade === 0 ? 'No entregó · cero explícito' : 'Calificado' };
  const attendance = concept.attendance[student.enrollmentId];
  if (attendance === 'ausente') return { value: '', state: `Ausente el ${dateLabel(concept.activityDate)} · pendiente de recuperar` };
  if (attendance === 'presente') return { value: '', state: `Asistió el ${dateLabel(concept.activityDate)} · falta calificar` };
  return { value: '', state: `Sin pase de lista del ${dateLabel(concept.activityDate)} · revisar` };
};
const subtractDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - days);
  return value.toISOString().slice(0, 10);
};

async function imageData(url: string | null) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
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

export function AcademicReportsDashboard({ initialData }: { initialData: AcademicReportData }) {
  const [data, setData] = useState(initialData),
    [view, setView] = useState<View>('attendance'),
    [message, setMessage] = useState(''),
    [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null),
    [range, setRange] = useState(() => ({
      from: initialData.report?.range.from ?? '',
      to: initialData.report?.range.to ?? '',
    }));
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const report = data.report;
  const attendanceSummary = useMemo(
    () =>
      report?.students.map((student) => {
        const values = report.attendanceDates.map((date) => student.attendance[date]?.status);
        const present = values.filter((value) => value === 'presente').length,
          absent = values.filter((value) => value === 'ausente').length,
          total = present + absent;
        return {
          student,
          present,
          absent,
          percent: total ? (present / total) * 100 : 0,
        };
      }) ?? [],
    [report],
  );
  const reload = (assignmentId: string, requestedRange?: { from: string; to: string }) =>
    startTransition(async () => {
      setMessage('');
      const result = await loadAcademicReportAction({
        assignmentId,
        ...(requestedRange?.from ? { from: requestedRange.from } : {}),
        ...(requestedRange?.to ? { to: requestedRange.to } : {}),
      });
      if (result.ok) {
        setData(result.data);
        if (result.data.report) {
          setRange({ from: result.data.report.range.from, to: result.data.report.range.to });
        }
      }
      else setMessage(result.message);
    });

  const applyPreset = (days: number | null) => {
    if (!report || !data.selectedAssignmentId) return;
    if (days === null) {
      reload(data.selectedAssignmentId, {
        from: report.period.startDate,
        to: report.period.endDate,
      });
      return;
    }
    const today = report.range.today;
    const to = today < report.period.endDate ? today : report.period.endDate;
    const calculatedFrom = subtractDays(to, days - 1);
    reload(data.selectedAssignmentId, {
      from: calculatedFrom > report.period.startDate ? calculatedFrom : report.period.startDate,
      to,
    });
  };

  async function exportExcel() {
    if (!report) return;
    setExporting('excel');
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = report.tenant.name;
      workbook.created = new Date();
      const attendance = workbook.addWorksheet('Asistencia', {
        views: [{ state: 'frozen', xSplit: 3, ySplit: 5 }],
      });
      attendance.mergeCells(1, 1, 1, Math.max(6, report.attendanceDates.length + 6));
      attendance.getCell('A1').value = report.tenant.name;
      attendance.getCell('A1').font = {
        bold: true,
        size: 18,
        color: { argb: 'FFFFFFFF' },
      };
      attendance.getCell('A1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: report.tenant.primaryColor.replace('#', 'FF') },
      };
      attendance.mergeCells(2, 1, 2, Math.max(6, report.attendanceDates.length + 6));
      attendance.getCell('A2').value = `ASISTENCIA · ${report.assignment.levelName} · ${report.assignment.gradeName} · ${report.assignment.groupName} · ${report.period.name}`;
      attendance.getCell('A2').font = { bold: true };
      attendance.addRow([`Docente: ${report.teacher.name}`]);
      attendance.addRow([]);
      const attendanceHeader = attendance.addRow(['N°', 'Matrícula', 'Alumno', ...report.attendanceDates.map(dateLabel), 'Presentes', 'Ausentes', 'Asistencia %']);
      attendanceHeader.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E293B' },
        };
        cell.alignment = { horizontal: 'center' };
      });
      attendanceSummary.forEach((item, index) => attendance.addRow([index + 1, item.student.enrollmentCode ?? '', item.student.name, ...report.attendanceDates.map((date) => (item.student.attendance[date]?.status === 'presente' ? 'P' : item.student.attendance[date]?.status === 'ausente' ? 'A' : '')), item.present, item.absent, item.percent / 100]));
      attendance.getColumn(1).width = 6;
      attendance.getColumn(2).width = 19;
      attendance.getColumn(3).width = 38;
      for (let column = 4; column < 4 + report.attendanceDates.length; column++) attendance.getColumn(column).width = 11;
      attendance.getColumn(6 + report.attendanceDates.length).numFmt = '0.0%';

      const criteria = workbook.addWorksheet('Criterios', {
        views: [{ state: 'frozen', xSplit: 3, ySplit: 5 }],
      });
      criteria.mergeCells(1, 1, 1, Math.max(5, report.criteria.length + 3));
      criteria.getCell('A1').value = report.tenant.name;
      criteria.getCell('A1').font = {
        bold: true,
        size: 18,
        color: { argb: 'FFFFFFFF' },
      };
      criteria.getCell('A1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: report.tenant.primaryColor.replace('#', 'FF') },
      };
      criteria.mergeCells(2, 1, 2, Math.max(5, report.criteria.length + 3));
      criteria.getCell('A2').value = `EVIDENCIA POR CRITERIOS · ${report.assignment.subjectName} · ${report.period.name}`;
      criteria.addRow([`Nivel: ${report.assignment.levelName} · Grado: ${report.assignment.gradeName} · Grupo: ${report.assignment.groupName}`]);
      criteria.addRow([]);
      const criteriaHeader = criteria.addRow(['N°', 'Matrícula', 'Alumno', ...report.criteria.map(criterionLabel)]);
      criteriaHeader.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E293B' },
        };
        cell.alignment = { horizontal: 'center', wrapText: true };
      });
      report.students.forEach((student, index) => criteria.addRow([index + 1, student.enrollmentCode ?? '', student.name, ...report.criteria.map((criterion) => resultLabel(student, criterion.key, criterion.type))]));
      criteria.getColumn(1).width = 6;
      criteria.getColumn(2).width = 19;
      criteria.getColumn(3).width = 38;
      for (let column = 4; column <= report.criteria.length + 3; column++) criteria.getColumn(column).width = 21;

      const detail = workbook.addWorksheet('Evidencias detalladas', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      detail.addRow(['Matrícula', 'Alumno', 'Criterio', 'Evidencia', 'Tipo', 'Calificación', 'Estado', 'Observación', 'Última actualización']);
      detail.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E293B' },
        };
      });
      for (const student of report.students)
        for (const concept of report.concepts) {
          const grade = student.conceptGrades[concept.id];
          const detailGrade = conceptGradeLabel(student, concept);
          detail.addRow([student.enrollmentCode ?? '', student.name, report.criteria.find((row) => row.key === concept.criterionKey) ? criterionLabel(report.criteria.find((row) => row.key === concept.criterionKey)!) : '', concept.name, concept.type, detailGrade.value, detailGrade.state, grade?.observation ?? '', grade?.updatedAt ? new Date(grade.updatedAt).toLocaleString('es-MX') : '']);
        }
      detail.columns.forEach((column, index) => {
        column.width = index === 1 ? 34 : index === 6 ? 42 : 20;
      });
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `Reporte_academico_${safeName(report.assignment.gradeName)}_${safeName(report.assignment.groupName)}_${report.range.from}_${report.range.to}.xlsx`,
      );
      toast({
        title: 'Excel generado',
        description: 'Incluye asistencia, criterios y evidencias detalladas.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'No se pudo generar el Excel',
        description: 'Inténtalo nuevamente.',
      });
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    if (!report) return;
    setExporting('pdf');
    try {
      const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4',
        }),
        logo = await imageData(report.tenant.logoUrl);
      let first = true;
      const header = (title: string, subtitle: string) => {
        if (!first) pdf.addPage();
        first = false;
        if (logo)
          try {
            pdf.addImage(logo, 'PNG', 12, 9, 22, 22);
          } catch {}
        pdf.setFillColor(report.tenant.primaryColor);
        pdf.rect(0, 0, 297, 35, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(17);
        pdf.text(report.tenant.name.toUpperCase(), logo ? 39 : 14, 16);
        pdf.setFontSize(11);
        pdf.text(title, logo ? 39 : 14, 24);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.text(subtitle, logo ? 39 : 14, 30);
        pdf.setTextColor(20, 30, 45);
      };
      const subtitle = `${report.assignment.levelName} · ${report.assignment.gradeName} · ${report.assignment.groupName} · ${report.assignment.subjectName} · ${report.period.name} · ${report.range.from} a ${report.range.to}`;
      const dateChunks = report.attendanceDates.length ? Array.from({ length: Math.ceil(report.attendanceDates.length / 12) }, (_, index) => report.attendanceDates.slice(index * 12, index * 12 + 12)) : [[]];
      for (const dates of dateChunks) {
        header('HISTORIAL DE ASISTENCIA', subtitle);
        autoTable(pdf, {
          startY: 42,
          theme: 'grid',
          head: [['N°', 'Matrícula', 'Alumno', ...dates.map(dateLabel), 'P', 'A', '%']],
          body: attendanceSummary.map((item, index) => [index + 1, item.student.enrollmentCode ?? '', item.student.name, ...dates.map((date) => (item.student.attendance[date]?.status === 'presente' ? 'P' : item.student.attendance[date]?.status === 'ausente' ? 'A' : '—')), item.present, item.absent, item.percent.toFixed(1)]),
          headStyles: { fillColor: '#1e293b', fontSize: 7 },
          styles: { fontSize: 7, cellPadding: 1.5 },
          columnStyles: { 2: { cellWidth: 50 } },
        });
      }
      const criterionChunks = report.criteria.length ? Array.from({ length: Math.ceil(report.criteria.length / 6) }, (_, index) => report.criteria.slice(index * 6, index * 6 + 6)) : [[]];
      for (const criteria of criterionChunks) {
        header('EVIDENCIA POR CRITERIOS', subtitle);
        autoTable(pdf, {
          startY: 42,
          theme: 'grid',
          head: [['N°', 'Matrícula', 'Alumno', ...criteria.map(criterionLabel)]],
          body: report.students.map((student, index) => [index + 1, student.enrollmentCode ?? '', student.name, ...criteria.map((criterion) => resultLabel(student, criterion.key, criterion.type))]),
          headStyles: { fillColor: '#1e293b', fontSize: 7 },
          styles: { fontSize: 7, cellPadding: 1.7 },
          columnStyles: { 2: { cellWidth: 55 } },
        });
      }
      if (report.concepts.length) {
        header('EVIDENCIAS DETALLADAS', subtitle);
        const detailRows = report.students.flatMap((student) =>
          report.concepts.map((concept) => {
            const grade = student.conceptGrades[concept.id];
            const detailGrade = conceptGradeLabel(student, concept);
            return [student.enrollmentCode ?? '', student.name, concept.name, concept.type, detailGrade.value === '' ? '—' : detailGrade.value, detailGrade.state, grade?.observation ?? ''];
          }),
        );
        autoTable(pdf, {
          startY: 42,
          theme: 'striped',
          head: [['Matrícula', 'Alumno', 'Evidencia', 'Tipo', 'Calificación', 'Estado', 'Observación']],
          body: detailRows,
          headStyles: { fillColor: '#1e293b' },
          styles: { fontSize: 7 },
          columnStyles: {
            1: { cellWidth: 48 },
            2: { cellWidth: 48 },
            5: { cellWidth: 35 },
            6: { cellWidth: 55 },
          },
        });
      }
      pdf.save(`Reporte_academico_${safeName(report.assignment.gradeName)}_${safeName(report.assignment.groupName)}_${report.range.from}_${report.range.to}.pdf`);
      toast({
        title: 'PDF generado',
        description: 'Incluye asistencia y todos los criterios del esquema activo.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'No se pudo generar el PDF',
        description: 'Inténtalo nuevamente.',
      });
    } finally {
      setExporting(null);
    }
  }

  return (
    <main className="mx-auto max-w-[1500px] space-y-5 pb-16">
      <header className="flex flex-col gap-4 rounded-3xl border bg-card p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <FileSpreadsheet className="size-7" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-primary">Evidencia exportable</p>
            <h1 className="text-3xl font-black">Reportes académicos</h1>
            <p className="text-sm text-muted-foreground">Asistencia y criterios reales del periodo activo, sin categorías prefijadas.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!report || Boolean(exporting)} onClick={() => void exportPdf()}>
            {exporting === 'pdf' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />}
            PDF
          </Button>
          <Button disabled={!report || Boolean(exporting)} onClick={() => void exportExcel()}>
            {exporting === 'excel' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
            Excel
          </Button>
        </div>
      </header>
      <Card>
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-2 block text-sm font-bold">Nivel, grado, grupo y materia</label>
            <Select value={data.selectedAssignmentId ?? undefined} onValueChange={reload}>
              <SelectTrigger>
                <SelectValue placeholder="Sin asignaciones" />
              </SelectTrigger>
              <SelectContent>
                {data.assignments.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.levelName} · {row.gradeName} · {row.groupName} · {row.subjectName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" disabled={pending || !data.selectedAssignmentId} onClick={() => data.selectedAssignmentId && reload(data.selectedAssignmentId, range)}>
              <RefreshCw className={cn('mr-2 size-4', pending && 'animate-spin')} />
              Actualizar
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <CalendarRange className="mt-0.5 size-5 text-primary" aria-hidden="true" />
            <div>
              <h2 className="font-black">Rango del reporte</h2>
              <p className="text-sm text-muted-foreground">La pantalla, el PDF y el Excel usarán exactamente estas fechas, siempre dentro del periodo activo.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={report?.range.isFullPeriod ? 'default' : 'outline'} disabled={!report || pending} onClick={() => applyPreset(null)}>Todo el periodo</Button>
            <Button type="button" size="sm" variant="outline" disabled={!report || pending} onClick={() => applyPreset(7)}>Últimos 7 días</Button>
            <Button type="button" size="sm" variant="outline" disabled={!report || pending} onClick={() => applyPreset(15)}>Últimos 15 días</Button>
            <Button type="button" size="sm" variant="outline" disabled={!report || pending} onClick={() => applyPreset(30)}>Últimos 30 días</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="space-y-2 text-sm font-bold">
              <span>Desde</span>
              <Input type="date" min={report?.period.startDate} max={range.to || report?.period.endDate} value={range.from} disabled={!report || pending} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} />
            </label>
            <label className="space-y-2 text-sm font-bold">
              <span>Hasta</span>
              <Input type="date" min={range.from || report?.period.startDate} max={report?.period.endDate} value={range.to} disabled={!report || pending} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} />
            </label>
            <Button type="button" disabled={!report || pending || !range.from || !range.to || range.from > range.to || !data.selectedAssignmentId} onClick={() => data.selectedAssignmentId && reload(data.selectedAssignmentId, range)}>
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CalendarRange className="mr-2 size-4" />}
              Aplicar fechas
            </Button>
          </div>
        </CardContent>
      </Card>
      {message ? (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          {message}
        </div>
      ) : null}
      {report ? (
        <>
          <div className="grid gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 md:grid-cols-[auto_1fr]">
            <AlertCircle className="size-5" aria-hidden="true" />
            <div>
              <p className="font-black">Promedios transparentes · {report.range.from} a {report.range.to}</p>
              <p className="text-sm">Los vacíos aparecen como pendientes y no valen cero. Un cero sólo cuenta cuando el profesor lo registra expresamente. Todo promedio incompleto se identifica como parcial y muestra cuántas evidencias faltan.</p>
            </div>
          </div>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Alumnos" value={report.students.length} />
            <Metric label="Listas registradas" value={report.attendanceDates.length} />
            <Metric label="Criterios y subcriterios" value={report.criteria.length} />
            <Metric label="Evidencias detalladas" value={report.concepts.length} />
          </section>
          <div className="flex rounded-2xl border bg-card p-1">
            <button type="button" onClick={() => setView('attendance')} className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-black', view === 'attendance' && 'bg-primary text-primary-foreground')}>
              <CalendarCheck2 className="size-5" />
              Asistencia del periodo
            </button>
            <button type="button" onClick={() => setView('evidence')} className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-black', view === 'evidence' && 'bg-primary text-primary-foreground')}>
              <FileSpreadsheet className="size-5" />
              Evidencia por criterios
            </button>
          </div>
          {pending ? (
            <div className="grid min-h-72 place-items-center rounded-3xl border bg-card">
              <Loader2 className="size-10 animate-spin text-primary" />
            </div>
          ) : view === 'attendance' ? (
            <AttendanceTable report={report} summary={attendanceSummary} />
          ) : (
            <EvidenceTable report={report} />
          )}
        </>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">No hay asignaciones activas para generar reportes.</CardContent>
        </Card>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-3xl font-black">{value}</p>
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
    </div>
  );
}
function StudentStatus({ student }: { student: AcademicReport['students'][number] }) {
  return <span className={cn('ml-2 text-[10px] font-black', student.studentType === 'provisional' ? 'text-amber-700' : 'text-emerald-700')}>{student.studentType === 'provisional' ? 'PROVISIONAL' : 'REGISTRADO'}</span>;
}
function ResultCell({ report, student, criterion }: { report: AcademicReport; student: AcademicReport['students'][number]; criterion: AcademicReport['criteria'][number] }) {
  const result = student.results[criterion.key];
  if (!result) return <span className="text-muted-foreground">—</span>;
  if (criterion.type === 'participacion') return <span>{result.participationPoints.toFixed(1)} pts</span>;
  if (result.expectedCount > 0 && !result.complete) {
    const missingConcepts = report.concepts.filter(
      (concept) => concept.criterionKey === criterion.key
        && result.missingConceptNames.includes(concept.name)
        && !student.conceptGrades[concept.id],
    );
    const absent = missingConcepts.filter((concept) => concept.attendance[student.enrollmentId] === 'ausente').length;
    const present = missingConcepts.filter((concept) => concept.attendance[student.enrollmentId] === 'presente').length;
    const unchecked = Math.max(result.missingCount - absent - present, 0);
    return (
      <div className="min-w-44 space-y-1 text-left" title={result.missingConceptNames.length ? `Faltan: ${result.missingConceptNames.join(', ')}` : undefined}>
        <span className="flex items-center gap-1 font-black text-amber-700"><AlertCircle className="size-4" />Pendiente</span>
        <span className="block text-xs font-bold text-slate-700">{result.gradedCount} de {result.expectedCount} calificadas</span>
        {result.grade !== null ? <span className="block text-[11px] font-normal text-muted-foreground">Promedio parcial: {result.grade.toFixed(1)}</span> : null}
        <span className="block text-[11px] font-normal text-rose-700">Faltan {result.missingCount}</span>
        {absent ? <span className="block text-[11px] font-bold text-amber-700">{absent} por ausencia · recuperables</span> : null}
        {present ? <span className="block text-[11px] font-bold text-rose-700">{present} asistió · falta calificar</span> : null}
        {unchecked ? <span className="block text-[11px] font-normal text-muted-foreground">{unchecked} sin pase de lista · revisar</span> : null}
      </div>
    );
  }
  if (result.grade === null) return <span className="font-bold text-muted-foreground">{result.state === 'pendiente' ? 'Pendiente' : '—'}</span>;
  return (
    <div className="min-w-32 space-y-1">
      <span className="flex items-center justify-center gap-1 font-black text-emerald-700"><CheckCircle2 className="size-4" />{result.grade.toFixed(1)}</span>
      {result.expectedCount > 0 ? <span className="block text-[11px] font-normal text-muted-foreground">{result.gradedCount}/{result.expectedCount} calificadas</span> : null}
    </div>
  );
}
function AttendanceTable({
  report,
  summary,
}: {
  report: AcademicReport;
  summary: {
    student: AcademicReport['students'][number];
    present: number;
    absent: number;
    percent: number;
  }[];
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b p-5">
          <h2 className="text-xl font-black">Historial de asistencia</h2>
          <p className="text-sm text-muted-foreground">Cada columna corresponde a una lista realmente guardada durante {report.period.name}.</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="sticky top-0 bg-slate-900 text-white">
              <tr>
                <th className="px-3 py-3 text-left">Alumno</th>
                {report.attendanceDates.map((date) => (
                  <th key={date} className="px-3 py-3">
                    {dateLabel(date)}
                  </th>
                ))}
                <th className="px-3 py-3">P</th>
                <th className="px-3 py-3">A</th>
                <th className="px-3 py-3">%</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((item) => (
                <tr key={item.student.enrollmentId} className="border-b">
                  <td className="sticky left-0 bg-card px-3 py-3 font-bold">
                    {item.student.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{item.student.enrollmentCode}</span>
                    <StudentStatus student={item.student} />
                  </td>
                  {report.attendanceDates.map((date) => {
                    const entry = item.student.attendance[date];
                    return (
                      <td key={date} title={entry?.observation} className="px-3 py-3 text-center">
                        <span className={cn('inline-grid size-8 place-items-center rounded-full font-black', entry?.status === 'presente' ? 'bg-emerald-100 text-emerald-700' : entry?.status === 'ausente' ? 'bg-rose-100 text-rose-700' : 'bg-muted text-muted-foreground')}>{entry?.status === 'presente' ? 'P' : entry?.status === 'ausente' ? 'A' : '—'}</span>
                      </td>
                    );
                  })}
                  <td className="px-3 text-center font-black text-emerald-700">{item.present}</td>
                  <td className="px-3 text-center font-black text-rose-700">{item.absent}</td>
                  <td className="px-3 text-center font-black">{item.percent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.attendanceDates.length ? <p className="p-8 text-center text-muted-foreground">Todavía no se ha guardado ninguna lista en este periodo.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
function EvidenceTable({ report }: { report: AcademicReport }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b p-5">
          <h2 className="text-xl font-black">Evidencia por criterios</h2>
          <p className="text-sm text-muted-foreground">Los encabezados provienen del esquema creado por el profesor para esta materia.</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="sticky top-0 bg-slate-900 text-white">
              <tr>
                <th className="px-3 py-3 text-left">Alumno</th>
                {report.criteria.map((row) => (
                  <th key={row.key} className="max-w-48 px-3 py-3 text-center">
                    <span className="block">{criterionLabel(row)}</span>
                    <span className="text-[10px] font-normal uppercase opacity-70">{row.type}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.students.map((student) => (
                <tr key={student.enrollmentId} className="border-b">
                  <td className="sticky left-0 bg-card px-3 py-3 font-bold">
                    {student.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{student.enrollmentCode}</span>
                    <StudentStatus student={student} />
                  </td>
                  {report.criteria.map((row) => (
                    <td key={row.key} className="px-3 py-3 text-center font-black">
                      <ResultCell report={report} student={student} criterion={row} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!report.criteria.length ? <p className="p-8 text-center text-muted-foreground">Esta asignación aún no tiene un esquema activo.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
