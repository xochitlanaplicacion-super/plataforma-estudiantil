import jsPDF from 'jspdf';
import 'jspdf-autotable';

export const generarDictamenPDF = (datosAcreditacion: any) => {
  // Inicializar documento en tamaño Carta (Letter)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  // Configuración de colores corporativos
  const colorPrimario = [22, 53, 40]; // Verde oscuro Emiliano Zapata
  const colorSecundario = [160, 120, 80]; // Dorado/Ocre

  // --- ENCABEZADO ---
  doc.setFontSize(18);
  doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
  doc.setFont("helvetica", "bold");
  doc.text("INSTITUTO EDUCATIVO EMILIANO ZAPATA", 105, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.setFont("helvetica", "normal");
  doc.text("Resultados Globales de Acreditación", 105, 28, { align: 'center' });

  // Fecha y Folio
  doc.setFontSize(10);
  doc.text(`Fecha de Expedición: ${datosAcreditacion.fecha_expedicion || new Date().toLocaleDateString()}`, 20, 45);
  doc.text(`Folio de Identificación: ${datosAcreditacion.folio_identificacion || 'N/A'}`, 140, 45);

  // --- DATOS DEL ALUMNO ---
  doc.setDrawColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
  doc.setLineWidth(0.5);
  doc.line(20, 50, 195, 50);

  doc.setFont("helvetica", "bold");
  doc.text("DATOS DEL EVALUADO", 20, 58);

  doc.setFont("helvetica", "normal");
  doc.text(`Nombre(s): ${datosAcreditacion.nombres || ''}`, 20, 68);
  doc.text(`Primer Apellido: ${datosAcreditacion.primer_apellido || ''}`, 20, 75);
  doc.text(`Segundo Apellido: ${datosAcreditacion.segundo_apellido || ''}`, 20, 82);
  doc.text(`CURP: ${datosAcreditacion.curp || ''}`, 120, 68);
  doc.text(`Nivel: ${datosAcreditacion.nivel || 'Licenciatura'}`, 120, 75);
  doc.text(`Perfil: ${datosAcreditacion.perfil || ''}`, 120, 82);

  // --- TABLA DE RESULTADOS ---
  const etapasData = Array.isArray(datosAcreditacion.etapas_evaluacion) 
    ? datosAcreditacion.etapas_evaluacion.map((etapa: any) => [
        etapa.area || '', 
        etapa.fecha || '', 
        etapa.puntaje?.toString() || '0'
      ])
    : [];

  // @ts-ignore (jspdf-autotable se adhiere al prototipo de jspdf)
  doc.autoTable({
    startY: 95,
    head: [['Etapas de Evaluación (Área de Conocimiento)', 'Fecha', 'Puntaje']],
    body: etapasData,
    theme: 'grid',
    headStyles: { fillColor: colorPrimario, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 4 },
    alternateRowStyles: { fillColor: [245, 245, 245] }
  });

  // --- TOTALES ---
  // @ts-ignore
  const finalY = doc.lastAutoTable.finalY || 150;
  
  doc.setFont("helvetica", "bold");
  doc.text(`Puntaje Total:`, 140, finalY + 15);
  doc.setFont("helvetica", "normal");
  doc.text(`${datosAcreditacion.puntaje_total || 0}`, 180, finalY + 15);

  doc.setFont("helvetica", "bold");
  doc.text(`Calificación Numérica:`, 140, finalY + 22);
  doc.setFont("helvetica", "normal");
  doc.text(`${datosAcreditacion.calificacion_numerica || 0}`, 180, finalY + 22);

  doc.setFillColor(colorSecundario[0], colorSecundario[1], colorSecundario[2]);
  doc.rect(20, finalY + 35, 175, 12, 'F');
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.text(`RESULTADO FINAL: ${datosAcreditacion.resultado_final || datosAcreditacion.estatus}`, 105, finalY + 43, { align: 'center' });

  // --- FIRMA / FOOTER ---
  doc.setTextColor(150);
  doc.setFontSize(8);
  doc.text("Este documento es de carácter informativo y válido en la Plataforma Zapata.", 105, 260, { align: 'center' });

  // Guardar archivo
  doc.save(`Dictamen_Acreditacion_${datosAcreditacion.curp || 'Documento'}.pdf`);
};
