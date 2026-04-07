import jsPDF from 'jspdf';
import { numeroALetras } from '../utils/numeroALetras';

interface ReciboData {
  estudiante: string;
  ofertaEducativa: string;
  concepto: string;
  monto: number;
  folio: string;
  fecha: string; // ISO date YYYY-MM-DD
}

const meses = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export async function generarReciboPDF(data: ReciboData) {
  // Inicializamos jsPDF en orientación Portait, unidades en milímetros, tamaño Letter
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const halfHeight = height / 2;

  // Procesamos fecha
  const dateObj = new Date(data.fecha + 'T00:00:00'); // Evitar desfase de zona horaria
  const dia = dateObj.getDate().toString().padStart(2, '0');
  const mes = meses[dateObj.getMonth()];
  const anio = dateObj.getFullYear().toString();

  // Función interna para dibujar un recibo individual en una posición Y base (yOffset)
  const drawRecibo = (yOffset: number) => {
    // 1. Diseño Base: Recuadro externo del recibo con bordes redondeados
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.roundedRect(10, yOffset + 10, width - 20, 115, 3, 3); // Caja exterior

    // 2. Escudo Genérico y Oferta Educativa (Izquierda)
    doc.setDrawColor(50);
    doc.setLineWidth(0.3);
    doc.roundedRect(15, yOffset + 15, 30, 30, 2, 2); // Escudo mock
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("ESCUDO/LOGO", 30, yOffset + 30, { align: "center" });
    
    // Oferta Educativa destacada bajo el escudo
    const ofertaText = doc.splitTextToSize(data.ofertaEducativa.toUpperCase(), 35);
    doc.setFontSize(9);
    doc.setTextColor(20, 100, 150);
    doc.text(ofertaText, 30, yOffset + 50, { align: "center" });
    doc.setTextColor(0);

    // Escudo derecho para replicar estilo (Opcional según diseño)
    doc.roundedRect(width - 45, yOffset + 15, 30, 30, 2, 2);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("LOGOTIPO 2", width - 30, yOffset + 30, { align: "center" });

    // 3. Título Centrado "RECIBO"
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("RECIBO", width / 2, yOffset + 25, { align: "center" });

    // 4. Lugar y fecha
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Lugar y fecha de expedición:", width / 2, yOffset + 35, { align: "center" });
    doc.text(`En Yautepec, Morelos, a  ${dia}  de  ${mes}  del ${anio}.`, width / 2, yOffset + 43, { align: "center" });
    doc.line((width/2)-20, yOffset+44, (width/2)-10, yOffset+44); // Línea dia
    doc.line((width/2)-2, yOffset+44, (width/2)+20, yOffset+44); // Línea mes

    // 5. Datos Estudiante
    doc.text("Estudiante: ", 15, yOffset + 65);
    doc.setFont("helvetica", "bold");
    doc.text(data.estudiante, 38, yOffset + 64);
    doc.setFont("helvetica", "normal");
    doc.line(36, yOffset + 65, width - 45, yOffset + 65);

    // 6. Cantidad con número
    const montoFormateado = Number(data.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 });
    doc.text("cantidad $ ", width / 2 - 40, yOffset + 75);
    doc.setFont("helvetica", "bold");
    doc.text(montoFormateado, width / 2 - 20, yOffset + 74);
    doc.setFont("helvetica", "normal");
    doc.text(" pesos.", width / 2 + 10, yOffset + 75);
    doc.line((width/2)-22, yOffset+75, (width/2)+8, yOffset+75);

    // 7. Cantidad con Letra (Fondo Gris)
    doc.setFillColor(230, 230, 230);
    doc.roundedRect(15, yOffset + 82, width - 60, 10, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("Cantidad con letra", 17, yOffset + 85);
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(numeroALetras(data.monto), 17, yOffset + 90);
    doc.setFont("helvetica", "normal");

    // 8. Concepto
    doc.setFontSize(11);
    doc.text("concepto: ", 15, yOffset + 105);
    doc.setFont("helvetica", "bold");
    doc.text(data.concepto, 35, yOffset + 104);
    doc.setFont("helvetica", "normal");
    doc.line(33, yOffset + 105, width - 45, yOffset + 105);

    // 9. Folio (Inferior Izquierda)
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Nº ${data.folio}`, 15, yOffset + 120);

    // 10. Recuadro "Autoriza" (Inferior Derecha)
    doc.setLineWidth(0.3);
    doc.roundedRect(width - 40, yOffset + 85, 25, 30, 2, 2);
    doc.setFontSize(9);
    doc.text("Autoriza", width - 27.5, yOffset + 112, { align: "center" });
    doc.line(width - 38, yOffset + 108, width - 17, yOffset + 108); // Línea firma
  };

  // Dibujar los dos recibos (Copia 1 en la mitad superior, Copia 2 en la inferior)
  drawRecibo(0);
  drawRecibo(halfHeight);

  // Invocar la descarga automática
  doc.save(`Recibo_${data.folio}_${data.estudiante.replace(/\s+/g, '_')}.pdf`);
}
