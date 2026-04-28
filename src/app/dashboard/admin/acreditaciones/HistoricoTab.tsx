'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit2, Save, X, History, Search, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import { getHistoricoAcreditaciones, updateAcreditacion } from '@/lib/actions/acreditaciones';

export function HistoricoTab() {
  const { toast } = useToast();
  const [registros, setRegistros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    cargarHistorico();
  }, []);

  const cargarHistorico = async () => {
    setLoading(true);
    const res = await getHistoricoAcreditaciones();
    if (res.success && res.data) {
      setRegistros(res.data);
    } else {
      toast({ title: 'Error', description: 'No se pudo cargar el histórico.', variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleEditClick = (record: any) => {
    setEditingId(record.id);
    setEditFormData({
      curp: record.curp,
      nombres: record.nombres,
      primer_apellido: record.primer_apellido,
      segundo_apellido: record.segundo_apellido,
      fecha_expedicion: record.fecha_expedicion,
      estatus: record.estatus,
      nivel: record.nivel,
      perfil: record.perfil,
      folio_identificacion: record.folio_identificacion,
      puntaje_total: record.puntaje_total,
      calificacion_numerica: record.calificacion_numerica,
      resultado_final: record.resultado_final,
      // Clonar el array de etapas para editar sin mutar el original
      etapas_evaluacion: Array.isArray(record.etapas_evaluacion) 
        ? JSON.parse(JSON.stringify(record.etapas_evaluacion)) 
        : []
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditFormData({});
  };

  const handleSaveEdit = async (id: string) => {
    setIsSaving(true);
    const res = await updateAcreditacion(id, editFormData);
    if (res.success) {
      toast({ title: 'Actualizado', description: 'El registro se actualizó correctamente.' });
      setEditingId(null);
      cargarHistorico(); // Recargar para ver los cambios aplicados
    } else {
      toast({ title: 'Error', description: res.error || 'Fallo al actualizar', variant: 'destructive' });
    }
    setIsSaving(false);
  };

  // ---- GENERADOR DE PDF DEL DICTAMEN (fiel al original) ----
  const generarPDF = async (r: any) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const w = doc.internal.pageSize.getWidth();   // ~215.9 mm
    const h = doc.internal.pageSize.getHeight();  // ~279.4 mm
    const mL = 18;  // margen izquierdo
    const mR = 18;  // margen derecho

    // ── CARGAR LOGO DESDE /public/images ──────────────────────────────────────
    let logoBase64: string | null = null;
    try {
      const resp = await fetch('/images/logo_zapata.png');
      const blob = await resp.blob();
      logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch { /* si falla la carga, continuar sin logo */ }

    // ── ENCABEZADO: logos + título ────────────────────────────────────────────
    let y = 14;
    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', mL, 6, 28, 28);  // solo logo izquierdo
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text('DICTAMEN GLOBAL DE RESULTADOS', w / 2, y + 8, { align: 'center' });
    // Subrayado del título
    const titleWidth = doc.getTextWidth('DICTAMEN GLOBAL DE RESULTADOS');
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(w / 2 - titleWidth / 2, y + 10, w / 2 + titleWidth / 2, y + 10);

    y = 42;

    // ── FECHA DE EXPEDICIÓN ───────────────────────────────────────────────────
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Fecha de Expedición: ${r.fecha_expedicion || '—'}.`, w / 2, y, { align: 'center' });
    y += 10;

    // ── DATOS DEL SOLICITANTE ─────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Datos del solicitante:', mL, y);
    y += 10;

    // Fila 1: Nombre completo | CURP  (con subrayados y etiquetas)
    const nombreCompleto = [r.nombres, r.primer_apellido, r.segundo_apellido]
      .filter(Boolean).join('   ');
    const colCURP = w / 2 + 10;
    const fieldW1 = colCURP - mL - 6;
    const fieldW2 = w - mR - colCURP;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    // Nombre centrado en su columna
    doc.text(nombreCompleto, mL + fieldW1 / 2, y, { align: 'center' });
    doc.setFontSize(10);
    doc.text(r.curp || '—', colCURP + fieldW2 / 2, y, { align: 'center' });

    // Líneas bajo los campos
    doc.setLineWidth(0.4);
    doc.setDrawColor(0, 0, 0);
    doc.line(mL, y + 2, mL + fieldW1, y + 2);
    doc.line(colCURP, y + 2, colCURP + fieldW2, y + 2);

    // Etiquetas (texto pequeño debajo de la línea)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text('Nombre(s)  Primer Apellido  Segundo Apellido', mL + fieldW1 / 2, y + 7, { align: 'center' });
    doc.text('CURP', colCURP + fieldW2 / 2, y + 7, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 16;

    // Fila 2: Nivel | Perfil | Folio de identificación
    const col3 = (w - mL - mR) / 3;
    const vals = [
      { val: r.nivel || '—',                label: 'Nivel' },
      { val: r.perfil || '—',               label: 'Perfil' },
      { val: r.folio_identificacion || '—', label: 'Folio de identificación' },
    ];
    vals.forEach((item, i) => {
      const x = mL + col3 * i;
      const cx = x + col3 / 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(item.val, cx, y, { align: 'center' });
      doc.setLineWidth(0.4);
      doc.line(x + 2, y + 2, x + col3 - 4, y + 2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text(item.label, cx, y + 7, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    });
    y += 18;

    // ── TABLA DE ETAPAS DE EVALUACIÓN ────────────────────────────────────────
    const tLeft  = mL;
    const tRight = w - mR;
    const tW     = tRight - tLeft;
    // Columnas: área (60%), fecha (25%), puntaje (15%)
    const cArea  = tW * 0.60;
    const cFecha = tW * 0.25;
    const cPts   = tW * 0.15;

    // Cabecera principal (teal oscuro)
    doc.setFillColor(55, 95, 100);
    doc.rect(tLeft, y, tW, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text('Etapas de la Evaluación', tLeft + tW / 2, y + 6, { align: 'center' });
    y += 9;

    // Subencabezado
    doc.setFillColor(75, 115, 120);
    doc.rect(tLeft, y, tW, 7, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Aspectos / Áreas de conocimiento', tLeft + 3, y + 5);
    doc.text('Fecha', tLeft + cArea + cFecha / 2, y + 5, { align: 'center' });
    doc.text('Puntaje', tLeft + cArea + cFecha + cPts / 2, y + 5, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 7;

    // Filas de etapas
    const etapas: any[] = r.etapas_evaluacion || [];
    // Buscar la fecha común (la más repetida o la de la primera etapa)
    const fechaComun = etapas.length > 0 ? (etapas[Math.floor(etapas.length / 2)]?.fecha || etapas[0]?.fecha || '') : '';
    const rowH = 8;

    etapas.forEach((etapa: any, idx: number) => {
      const bg = idx % 2 === 0 ? [255, 255, 255] : [242, 248, 248];
      doc.setFillColor(bg[0], bg[1], bg[2]);
      doc.rect(tLeft, y, tW, rowH, 'F');

      // Bordes de celdas
      doc.setDrawColor(180, 200, 200);
      doc.setLineWidth(0.2);
      doc.rect(tLeft, y, cArea, rowH);
      doc.rect(tLeft + cArea, y, cFecha, rowH);
      doc.rect(tLeft + cArea + cFecha, y, cPts, rowH);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text(String(etapa.area || '—').substring(0, 40), tLeft + 3, y + 5.5);

      // Fecha: solo en la fila del medio
      if (idx === Math.floor(etapas.length / 2)) {
        doc.text(fechaComun, tLeft + cArea + cFecha / 2, y + 5.5, { align: 'center' });
      }

      doc.setFont('helvetica', 'bold');
      doc.text(String(etapa.puntaje ?? '—'), tLeft + cArea + cFecha + cPts / 2, y + 5.5, { align: 'center' });
      y += rowH;
    });

    if (etapas.length === 0) {
      doc.setFillColor(255, 255, 255);
      doc.rect(tLeft, y, tW, rowH, 'F');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('No se registraron etapas de evaluación.', tLeft + tW / 2, y + 5.5, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      y += rowH;
    }

    // Filas de totales (dentro de la misma tabla, alineadas a la derecha)
    const totals = [
      { label: 'Puntaje total:',          val: String(r.puntaje_total ?? '—') },
      { label: 'Calificación numérica:',  val: String(r.calificacion_numerica ?? '—') },
      { label: 'Resultado final:',        val: r.resultado_final || '—' },
    ];
    totals.forEach((t, i) => {
      doc.setFillColor(240, 248, 248);
      doc.rect(tLeft, y, tW, rowH, 'F');
      doc.setDrawColor(180, 200, 200);
      doc.setLineWidth(0.2);
      doc.rect(tLeft, y, tW, rowH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      // Etiqueta alineada a la derecha de la zona área+fecha
      doc.text(t.label, tLeft + cArea + cFecha - 3, y + 5.5, { align: 'right' });
      // Valor en columna puntaje
      if (i === 2) { // Resultado final — color
        const rc = t.val === 'Acreditado' ? [0, 110, 0] : [170, 0, 0];
        doc.setTextColor(rc[0], rc[1], rc[2]);
      }
      doc.text(t.val, tLeft + cArea + cFecha + cPts / 2, y + 5.5, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      y += rowH;
    });

    y += 12;

    // ── ESCALA DE RESULTADOS ──────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('ESCALA DE RESULTADOS DE EVALUACIÓN', w / 2, y, { align: 'center' });
    const escW = doc.getTextWidth('ESCALA DE RESULTADOS DE EVALUACIÓN');
    doc.setLineWidth(0.4);
    doc.line(w / 2 - escW / 2, y + 1.5, w / 2 + escW / 2, y + 1.5);
    y += 7;

    // Tabla escala (4 columnas)
    const esc = { x: mL + 10, w: w - mR - mL - 20, rowH: 7 };
    const ecW = esc.w / 4;
    const escHeaders = ['Puntaje mínimo:', 'Puntaje máximo:', 'Calificación', 'Resultado'];
    doc.setFillColor(55, 95, 100);
    doc.rect(esc.x, y, esc.w, esc.rowH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    escHeaders.forEach((h, i) => {
      doc.text(h, esc.x + ecW * i + ecW / 2, y + 4.5, { align: 'center' });
    });
    y += esc.rowH;

    const escRows = [
      ['0', '209', 'De 0 a 6.9', 'NO ACREDITADO'],
      ['210', '300', 'De 7.0 a 10', 'ACREDITADO'],
    ];
    escRows.forEach((row, ri) => {
      doc.setFillColor(ri % 2 === 0 ? 255 : 245, ri % 2 === 0 ? 255 : 250, ri % 2 === 0 ? 255 : 250);
      doc.rect(esc.x, y, esc.w, esc.rowH, 'F');
      doc.setDrawColor(180, 200, 200);
      doc.setLineWidth(0.2);
      doc.rect(esc.x, y, esc.w, esc.rowH);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      row.forEach((cell, ci) => {
        doc.text(cell, esc.x + ecW * ci + ecW / 2, y + 4.5, { align: 'center' });
      });
      y += esc.rowH;
    });

    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    const nota = 'El sustentante debe acreditar las 5 áreas de conocimiento con un mínimo de 42 puntos por campo para ser considerado Acreditado.';
    const notaLines = doc.splitTextToSize(nota, esc.w);
    doc.text(notaLines, w / 2, y, { align: 'center' });
    y += notaLines.length * 5 + 6;

    // ── PIE: Logo México + texto oficial ────────────────────────────────────
    const pieY = h - 20;
    // Cargar y colocar el logo mexico(1).png
    try {
      const respMex = await fetch('/images/mexico(1).png');
      const blobMex = await respMex.blob();
      const mexicoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blobMex);
      });
      doc.addImage(mexicoBase64, 'PNG', mL, pieY - 8, 38, 14);
    } catch { /* continuar sin logo si falla */ }
    // Texto legal a la derecha
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.text('ESTE DOCUMENTO CONSTITUYE LA VERSIÓN DIGITAL OFICIAL CON FINES INFORMATIVOS', w - mR, pieY, { align: 'right' });

    const nombreArchivo = `Dictamen_${r.curp || r.folio_identificacion || 'alumno'}.pdf`;
    doc.save(nombreArchivo);
  };

  const handleEtapaChange = (index: number, field: string, value: any) => {
    const newEtapas = [...(editFormData.etapas_evaluacion || [])];
    newEtapas[index] = { ...newEtapas[index], [field]: value };
    setEditFormData({ ...editFormData, etapas_evaluacion: newEtapas });
  };

  // Función para determinar el color de fondo basado en el lote (cercanía de created_at)
  const getBatchColorClasses = () => {
    const classes: string[] = [];
    let currentBatchIndex = 0;
    let lastDate: Date | null = null;

    registros.forEach((r, i) => {
      const currentDate = new Date(r.created_at);
      if (lastDate) {
        const diffSeconds = Math.abs(currentDate.getTime() - lastDate.getTime()) / 1000;
        if (diffSeconds > 60) {
          currentBatchIndex++;
        }
      }
      lastDate = currentDate;
      // Alternar colores: blanco y beige claro (amber-50)
      classes.push(currentBatchIndex % 2 === 0 ? 'bg-white' : 'bg-amber-50/50');
    });
    return classes;
  };

  const batchColors = getBatchColorClasses();

  // Filtrado por buscador
  const filteredRegistros = registros.filter((r, i) => {
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    return (
      (r.curp && r.curp.toLowerCase().includes(term)) ||
      (r.nombres && r.nombres.toLowerCase().includes(term)) ||
      (r.primer_apellido && r.primer_apellido.toLowerCase().includes(term)) ||
      (r.folio_identificacion && r.folio_identificacion.toLowerCase().includes(term))
    );
  });

  return (
    <Card className="border shadow-sm">
      <CardHeader className="bg-slate-50 border-b pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><History size={20} /> Histórico y Edición Avanzada</CardTitle>
          <CardDescription>Audita todas las columnas extraídas por la IA. Usa la barra para buscar alumnos.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar CURP, nombre, folio..." 
              className="pl-8 w-[250px] bg-white h-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={cargarHistorico} disabled={loading} className="h-9">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Actualizar Tabla'}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 px-0">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto relative">
          {loading ? (
            <div className="flex justify-center items-center p-12 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredRegistros.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No se encontraron registros que coincidan con la búsqueda.</div>
          ) : (
            <table className="w-max text-sm min-w-full">
              <thead className="sticky top-0 bg-slate-800 text-white z-20 shadow-md">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap sticky left-0 z-30 bg-slate-900 border-r border-slate-700">Acciones</th>
                  <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap">Fecha Carga</th>
                  <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap">Estatus</th>
                  <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wider min-w-[160px]">CURP</th>
                  <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wider min-w-[150px]">Nombres</th>
                  <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wider min-w-[120px]">Apellido 1</th>
                  <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wider min-w-[120px]">Apellido 2</th>
                  <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wider min-w-[150px]">Fecha Doc.</th>
                  <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wider min-w-[120px]">Folio</th>
                  <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wider min-w-[120px]">Nivel</th>
                  <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wider min-w-[120px]">Perfil</th>
                  <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wider min-w-[340px]">Etapas de Evaluación (Áreas / Fecha / Puntos)</th>
                  <th className="px-3 py-3 text-center font-semibold text-[11px] uppercase tracking-wider min-w-[80px]">Pts Totales</th>
                  <th className="px-3 py-3 text-center font-semibold text-[11px] uppercase tracking-wider min-w-[80px]">Calif. Num.</th>
                  <th className="px-3 py-3 text-center font-semibold text-[11px] uppercase tracking-wider min-w-[120px]">Res. Final</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistros.map((r, i) => {
                  const originalIndex = registros.findIndex(orig => orig.id === r.id);
                  const rowColor = batchColors[originalIndex];
                  const isEditing = editingId === r.id;

                  return (
                    <tr key={r.id} className={`border-b border-slate-200 transition-colors hover:brightness-95 ${rowColor}`}>
                      
                      {/* Acciones (Fijadas a la izquierda para que siempre se vean al hacer scroll horizontal) */}
                      <td className="px-3 py-2 text-center sticky left-0 z-10 border-r border-slate-200 bg-inherit shadow-[4px_0_6px_-1px_rgba(0,0,0,0.05)]">
                        {isEditing ? (
                          <div className="flex gap-1 justify-center bg-inherit">
                            <Button size="sm" onClick={() => handleSaveEdit(r.id)} disabled={isSaving} className="h-7 px-2 bg-green-600 hover:bg-green-700" title="Guardar">
                              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            </Button>
                            <Button size="sm" variant="destructive" onClick={handleCancelEdit} disabled={isSaving} className="h-7 px-2" title="Cancelar">
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => generarPDF(r)}
                              className="h-7 px-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                              title="Descargar dictamen en PDF"
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleEditClick(r)} className="h-7 px-2 text-blue-600 border-blue-200 hover:bg-blue-50">
                              <Edit2 className="h-3 w-3 mr-1" /> Editar
                            </Button>
                          </div>
                        )}
                      </td>

                      {/* Fecha Carga */}
                      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString('es-MX')}
                      </td>
                      
                      {/* Estatus */}
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select 
                            className="border rounded px-2 py-1.5 text-xs bg-white w-full"
                            value={editFormData.estatus}
                            onChange={(e) => setEditFormData({...editFormData, estatus: e.target.value})}
                          >
                            <option value="Aprobado">Aprobado</option>
                            <option value="No Aprobado">No Aprobado</option>
                          </select>
                        ) : (
                          <span className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${r.estatus === 'Aprobado' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {r.estatus}
                          </span>
                        )}
                      </td>

                      {/* CURP */}
                      <td className="px-3 py-2 font-mono text-xs">
                        {isEditing ? (
                          <Input value={editFormData.curp || ''} onChange={e => setEditFormData({...editFormData, curp: e.target.value.toUpperCase()})} className="h-7 text-xs min-w-[160px] uppercase" maxLength={18} />
                        ) : r.curp}
                      </td>

                      {/* Nombres */}
                      <td className="px-3 py-2 text-slate-700 font-medium text-xs">
                        {isEditing ? (
                          <Input value={editFormData.nombres || ''} onChange={e => setEditFormData({...editFormData, nombres: e.target.value.toUpperCase()})} className="h-7 text-xs min-w-[120px]" />
                        ) : r.nombres}
                      </td>

                      {/* Primer Apellido */}
                      <td className="px-3 py-2 text-slate-700 text-xs">
                        {isEditing ? (
                          <Input value={editFormData.primer_apellido || ''} onChange={e => setEditFormData({...editFormData, primer_apellido: e.target.value.toUpperCase()})} className="h-7 text-xs min-w-[100px]" />
                        ) : r.primer_apellido}
                      </td>

                      {/* Segundo Apellido */}
                      <td className="px-3 py-2 text-slate-700 text-xs">
                        {isEditing ? (
                          <Input value={editFormData.segundo_apellido || ''} onChange={e => setEditFormData({...editFormData, segundo_apellido: e.target.value.toUpperCase()})} className="h-7 text-xs min-w-[100px]" />
                        ) : r.segundo_apellido}
                      </td>

                      {/* Fecha Doc */}
                      <td className="px-3 py-2 text-slate-600 text-xs">
                        {isEditing ? (
                          <Input value={editFormData.fecha_expedicion || ''} onChange={e => setEditFormData({...editFormData, fecha_expedicion: e.target.value})} className="h-7 text-xs min-w-[120px]" />
                        ) : r.fecha_expedicion}
                      </td>

                      {/* Folio */}
                      <td className="px-3 py-2 text-slate-700 text-xs font-mono">
                        {isEditing ? (
                          <Input value={editFormData.folio_identificacion || ''} onChange={e => setEditFormData({...editFormData, folio_identificacion: e.target.value})} className="h-7 text-xs min-w-[110px]" />
                        ) : r.folio_identificacion}
                      </td>

                      {/* Nivel */}
                      <td className="px-3 py-2 text-slate-700 text-xs">
                        {isEditing ? (
                          <Input value={editFormData.nivel || ''} onChange={e => setEditFormData({...editFormData, nivel: e.target.value})} className="h-7 text-xs min-w-[100px]" />
                        ) : r.nivel}
                      </td>

                      {/* Perfil */}
                      <td className="px-3 py-2 text-slate-700 text-xs">
                        {isEditing ? (
                          <Input value={editFormData.perfil || ''} onChange={e => setEditFormData({...editFormData, perfil: e.target.value})} className="h-7 text-xs min-w-[100px]" />
                        ) : r.perfil}
                      </td>

                      {/* Etapas de Evaluación (JSONB) */}
                      <td className="px-3 py-2 min-w-[340px]">
                        {isEditing ? (
                          <div className="space-y-1.5 p-2 bg-white/50 rounded border border-slate-200">
                            {editFormData.etapas_evaluacion?.map((etapa: any, idx: number) => (
                              <div key={idx} className="flex gap-1.5 items-center bg-white p-1 rounded shadow-sm border border-slate-100">
                                <Input value={etapa.area || ''} onChange={e => handleEtapaChange(idx, 'area', e.target.value)} className="w-[140px] h-6 text-[10px] px-1.5" placeholder="Área" />
                                <Input value={etapa.fecha || ''} onChange={e => handleEtapaChange(idx, 'fecha', e.target.value)} className="w-[80px] h-6 text-[10px] px-1.5" placeholder="Fecha" />
                                <Input type="number" value={etapa.puntaje || ''} onChange={e => handleEtapaChange(idx, 'puntaje', Number(e.target.value))} className="w-[50px] h-6 text-[10px] px-1.5 font-mono" placeholder="Pts" />
                              </div>
                            ))}
                            {(!editFormData.etapas_evaluacion || editFormData.etapas_evaluacion.length === 0) && (
                              <p className="text-xs text-slate-400 italic text-center">No hay áreas de evaluación registradas.</p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {r.etapas_evaluacion?.map((etapa: any, idx: number) => (
                              <div key={idx} className="flex items-center text-[10px] bg-slate-50/80 px-2 py-0.5 rounded border border-slate-100">
                                <span className="font-medium text-slate-700 w-[140px] truncate" title={etapa.area}>{etapa.area}</span>
                                <span className="text-slate-500 w-[80px]">{etapa.fecha}</span>
                                <span className="font-mono text-blue-600 font-bold ml-auto">{etapa.puntaje}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Puntaje Total */}
                      <td className="px-3 py-2 text-center text-xs font-mono font-medium text-slate-700">
                        {isEditing ? (
                          <Input type="number" value={editFormData.puntaje_total || ''} onChange={e => setEditFormData({...editFormData, puntaje_total: Number(e.target.value)})} className="h-7 text-xs w-[60px] mx-auto text-center" />
                        ) : r.puntaje_total}
                      </td>

                      {/* Calificación Numérica */}
                      <td className="px-3 py-2 text-center text-xs font-mono font-bold text-slate-800">
                        {isEditing ? (
                          <Input type="number" step="0.1" value={editFormData.calificacion_numerica || ''} onChange={e => setEditFormData({...editFormData, calificacion_numerica: Number(e.target.value)})} className="h-7 text-xs w-[60px] mx-auto text-center" />
                        ) : r.calificacion_numerica}
                      </td>

                      {/* Resultado Final */}
                      <td className="px-3 py-2 text-center text-xs font-semibold">
                        {isEditing ? (
                          <select 
                            className="border rounded px-2 py-1.5 text-xs bg-white w-full"
                            value={editFormData.resultado_final || ''}
                            onChange={(e) => setEditFormData({...editFormData, resultado_final: e.target.value})}
                          >
                            <option value="Acreditado">Acreditado</option>
                            <option value="No Acreditado">No Acreditado</option>
                          </select>
                        ) : (
                          <span className={r.resultado_final === 'Acreditado' ? 'text-green-600' : 'text-red-600'}>
                            {r.resultado_final}
                          </span>
                        )}
                      </td>
                      
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
