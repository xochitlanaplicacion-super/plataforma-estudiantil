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
  'Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.',
  'Jul.', 'Ago.', 'Sep.', 'Oct.', 'Nov.', 'Dic.'
];

// Helper para cargar imagen de forma asíncrona y poder inyectarla en jsPDF
const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });
};

export async function generarReciboPDF(data: ReciboData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  
  // Constantes de diseño
  const width = doc.internal.pageSize.getWidth(); // 215.9 mm
  const colorGuinda = [139, 35, 50] as const; // #8B2332
  const colorOro = [212, 175, 55] as const;   // #D4AF37
  const colorFondoLetras = [240, 240, 240] as const;
  
  const dateObj = new Date(data.fecha + 'T00:00:00'); 
  const dia = dateObj.getDate().toString().padStart(2, '0');
  const mes = meses[dateObj.getMonth()];
  const anio = dateObj.getFullYear().toString();

  // Intentamos pre-cargar el logo institucional
  let imgLogo: HTMLImageElement | null = null;
  try {
    imgLogo = await loadImage('/images/logo_zapata.png');
  } catch (err) {
    console.warn("No se pudo cargar el logotipo de Zapata:", err);
  }

  // --- DIBUJADO DE CADA RECIBO (1/4 DE PÁGINA) ---
  const drawRecibo = (yOffset: number) => {
    const h = 65; // Alto total de la caja del recibo
    // 1. Caja externa con estilo creativo
    doc.setDrawColor(colorOro[0], colorOro[1], colorOro[2]); // Borde dorado
    doc.setLineWidth(0.7);
    doc.roundedRect(10, yOffset + 5, width - 20, h, 2, 2);
    
    // Franja Superior Guinda (Detalle corporativo)
    doc.setFillColor(colorGuinda[0], colorGuinda[1], colorGuinda[2]);
    doc.setDrawColor(colorGuinda[0], colorGuinda[1], colorGuinda[2]);
    doc.roundedRect(10, yOffset + 5, width - 20, 3, 2, 2, 'F');
    // Para que la franja inferior de este detalle sea recta y no redonda:
    doc.rect(10, yOffset + 7, width - 20, 1, 'F');

    // 2. Logotipo Institucional y Oferta
    if (imgLogo) {
      // Ajustamos el tamaño asumiendo q es proporcional. Lo ponemos aprox 20x22 mm
      doc.addImage(imgLogo, 'PNG', 12, yOffset + 10, 22, 22);
    } else {
      doc.setDrawColor(200);
      doc.setLineWidth(0.2);
      doc.rect(12, yOffset + 10, 22, 22);
    }
    
    // Nombre del programa o carrera (algoritmo dinámico para no cortar palabras)
    let fontSize = 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    
    // Obtenemos la palabra más larga del string y reducimos la fuente hasta que quepa sin romperse
    const textoCarrera = data.ofertaEducativa.toUpperCase();
    const maxWord = textoCarrera.split(' ').reduce((a,b) => doc.getTextWidth(a) > doc.getTextWidth(b) ? a : b, "");
    
    while (doc.getTextWidth(maxWord) > 34 && fontSize > 3.5) {
      fontSize -= 0.5;
      doc.setFontSize(fontSize);
    }
    
    const ofertaText = doc.splitTextToSize(textoCarrera, 35);
    doc.setTextColor(colorGuinda[0], colorGuinda[1], colorGuinda[2]);
    // El texto se dibuja un poco más abajo calculando las líneas
    doc.text(ofertaText, 23, yOffset + 35, { align: "center" });
    
    // 3. Título RECIBO
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(colorGuinda[0], colorGuinda[1], colorGuinda[2]);
    doc.text("RECIBO OFICIAL", width / 2 + 10, yOffset + 16, { align: "center", charSpace: 1 });

    // 4. Folio destacado (Alineado a la derecha dinámico)
    doc.setFontSize(12);
    doc.setTextColor(220, 38, 38); // Rojo
    doc.setFont("helvetica", "bold");
    doc.text(data.folio, width - 15, yOffset + 16, { align: "right" });
    
    // El ancho estricto del texto del folio
    const folioWidth = doc.getTextWidth(data.folio);
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Nº FOLIO:`, width - 15 - folioWidth - 3, yOffset + 16, { align: "right" });
    
    // 5. Lugar y Fecha
    doc.setTextColor(50);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("En Yautepec, Morelos.", width/2 + 10, yOffset + 22, { align: "center" });
    doc.text(`A  ${dia}  de  ${mes}  del ${anio}.`, width/2 + 10, yOffset + 27, { align: "center" });

    // Líneas separadoras generales
    doc.setLineWidth(0.1);
    doc.setDrawColor(220);
    
    // 6. Datos del Estudiante
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text("Estudiante:", 45, yOffset + 38);
    doc.setFont("helvetica", "bold");
    doc.text(data.estudiante, 68, yOffset + 38);
    doc.line(65, yOffset + 39, width - 15, yOffset + 39);

    // 7. Concepto y Monto (Misma línea para ahorrar espacio)
    doc.setFont("helvetica", "normal");
    doc.text("Concepto:", 45, yOffset + 46);
    doc.setFont("helvetica", "bold");
    
    // Cortamos formato de texto por si es muy largo
    const txtConcepto = data.concepto.length > 35 ? data.concepto.substring(0, 32) + '...' : data.concepto;
    doc.text(txtConcepto, 65, yOffset + 46);
    doc.line(62, yOffset + 47, width - 60, yOffset + 47);

    doc.setFont("helvetica", "normal");
    const montoFormateado = Number(data.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 });
    doc.text("Total: $", width - 52, yOffset + 46);
    doc.setFont("helvetica", "bold");
    doc.text(montoFormateado, width - 38, yOffset + 46);
    doc.line(width - 40, yOffset + 47, width - 15, yOffset + 47);

    // 8. Cantidad con Letra
    doc.setFillColor(colorFondoLetras[0], colorFondoLetras[1], colorFondoLetras[2]);
    doc.roundedRect(45, yOffset + 51, width - 90, 8, 1.5, 1.5, 'F');
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.setFont("helvetica", "normal");
    doc.text("Cantidad con Letra", 47, yOffset + 54);
    
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text(numeroALetras(data.monto), 47, yOffset + 58);

    // 9. Recuadro "Autoriza" simplificado y sin el cuadro tan tosco
    doc.setFontSize(7);
    doc.setTextColor(50);
    doc.setFont("helvetica", "normal");
    doc.text("Sello / Firma de Autorización", width - 30, yOffset + 68, { align: "center" });
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(width - 45, yOffset + 65, width - 15, yOffset + 65);
  };

  // Dibujar recibo 1 (Mitad de arriba, cuarto 1)
  drawRecibo(5);
  // Dibujar recibo 2 (Mitad de arriba, cuarto 2) -> Espaciado de ~75mm
  drawRecibo(80);

  doc.save(`Recibo_${data.folio}_${data.estudiante.replace(/\s+/g, '_')}.pdf`);
}
