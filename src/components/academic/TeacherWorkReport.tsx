'use client';

import { useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadTeacherWorkReportAction, type TeacherWorkReport as WorkData } from '@/lib/actions/reportes-academicos';
import { summarizeStudentPlatformWork } from '@/lib/academic/teacher-work-summary';
import { Button } from '@/components/ui/button';

export function TeacherWorkReport({ assignmentId, assignmentLabel }: {
  assignmentId: string | null; assignmentLabel: string;
}) {
  const [data, setData] = useState<WorkData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => { setData(null); setError(''); }, [assignmentId]);
  const rows = useMemo(() => (data?.rows ?? []).filter((row) => {
    const date = row.completedAt?.slice(0, 10) ?? '';
    return (!from || date >= from) && (!to || date <= to);
  }), [data, from, to]);
  const studentSummary = useMemo(() => summarizeStudentPlatformWork(rows), [rows]);
  const table = rows.map((row) => [row.studentName, row.exerciseTitle,
    row.exerciseType === 'actividad_descriptiva' ? 'Tarea descriptiva' : 'Ejercicio automático',
    row.completedAt ? new Date(row.completedAt).toLocaleString('es-MX') : '—',
    row.state ?? '—', row.grade ?? '—', row.hits ?? '—', row.totalQuestions ?? '—',
    row.attempts ?? '—', row.weighted ? 'Sí' : 'No', row.photoCount]);
  const headings = ['Alumno', 'Actividad', 'Tipo', 'Fecha', 'Estado', 'Nota / 10', 'Aciertos', 'Preguntas', 'Intentos', 'Cuenta en promedio', 'Fotos'];
  async function load() {
    if (!assignmentId) return;
    setBusy(true); setError('');
    const result = await loadTeacherWorkReportAction(assignmentId);
    if (result.ok) setData(result.data); else setError(result.message);
    setBusy(false);
  }
  async function excel() {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Trabajos entregados');
    sheet.addRow([assignmentLabel]); sheet.addRow([`Fechas: ${from || 'inicio'} a ${to || 'hoy'}`]);
    sheet.addRow(headings); table.forEach((row) => sheet.addRow(row));
    sheet.columns.forEach((column) => { column.width = 22; });
    const bytes = await book.xlsx.writeBuffer();
    saveAs(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'trabajos-entregados.xlsx');
  }
  function pdf() {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(15); doc.text('Trabajos entregados', 14, 16);
    doc.setFontSize(9); doc.text(assignmentLabel.slice(0, 110), 14, 23);
    autoTable(doc, { startY: 28, head: [headings], body: table.map((row) => row.map(String)),
      styles: { fontSize: 6 }, headStyles: { fillColor: [25, 42, 61] } });
    doc.addPage();
    doc.setFontSize(15); doc.text('Promedio informativo de trabajos de plataforma', 14, 16);
    doc.setFontSize(9);
    doc.text(assignmentLabel.slice(0, 110), 14, 23);
    doc.text(`Fechas: ${from || 'inicio'} a ${to || 'hoy'}. Solo actividades calificadas; incluye las que no tienen peso.`, 14, 29);
    doc.text('No es el promedio oficial del periodo. Las entregas pendientes no cuentan como cero en este resumen.', 14, 35);
    autoTable(doc, {
      startY: 40,
      head: [['Alumno', 'Resultados registrados', 'Calificados', 'Promedio simple / 10']],
      body: studentSummary.map((student) => [
        student.studentName,
        String(student.resultCount),
        String(student.gradedCount),
        student.averageGrade === null ? '—' : student.averageGrade.toFixed(2),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [25, 42, 61] },
    });
    doc.save('trabajos-entregados.pdf');
  }
  return <section className="space-y-4 rounded-2xl border bg-card p-5" aria-label="Reporte de trabajos entregados">
    <div>
      <h2 className="text-xl font-black">Trabajos entregados</h2>
      <p className="text-sm text-muted-foreground">Resultados de ejercicios automáticos y tareas descriptivas, incluso sin peso en el promedio.</p>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <Button type="button" disabled={!assignmentId || busy} onClick={() => void load()}>{busy ? 'Consultando…' : 'Consultar trabajos'}</Button>
      <label className="text-sm">Desde <input className="block rounded border p-2" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="text-sm">Hasta <input className="block rounded border p-2" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <Button type="button" variant="outline" disabled={!data || !rows.length || Boolean(from && to && from > to)} onClick={() => void excel()}>Descargar Excel</Button>
      <Button type="button" variant="outline" disabled={!data || !rows.length || Boolean(from && to && from > to)} onClick={pdf}>Descargar PDF</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {data && <p className="text-sm font-semibold">{rows.length} resultados en el rango elegido. Las notas sin peso se muestran, pero no modifican el promedio.</p>}
    {data && <div className="space-y-2">
      <h3 className="text-base font-bold">Promedio informativo de trabajos de plataforma por alumno</h3>
      <p className="text-xs text-muted-foreground">Promedio simple de actividades calificadas en el rango elegido, incluidas las que no tienen peso. No es la calificación oficial del periodo; las entregas aún sin calificar no se cuentan como cero aquí.</p>
      <div className="max-h-80 overflow-auto rounded-lg border"><table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-slate-100"><tr><th className="p-2">Alumno</th><th className="p-2">Resultados</th><th className="p-2">Calificados</th><th className="p-2">Promedio / 10</th></tr></thead>
        <tbody>{studentSummary.map((student) => <tr className="border-t" key={student.enrollmentId}>
          <td className="p-2">{student.studentName}</td>
          <td className="p-2">{student.resultCount}</td>
          <td className="p-2">{student.gradedCount}</td>
          <td className="p-2">{student.averageGrade === null ? '—' : student.averageGrade.toFixed(2)}</td>
        </tr>)}</tbody>
      </table></div>
    </div>}
    {data && <div className="max-h-80 overflow-auto rounded-lg border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{headings.slice(0, 6).map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead>
      <tbody>{table.slice(0, 100).map((row, index) => <tr className="border-t" key={index}>{row.slice(0, 6).map((value, cell) => <td className="p-2" key={cell}>{String(value)}</td>)}</tr>)}</tbody></table></div>}
  </section>;
}
