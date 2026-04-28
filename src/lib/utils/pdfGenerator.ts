import jsPDF from 'jspdf';

export const generarDictamenPDF = async (r: any) => {
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
