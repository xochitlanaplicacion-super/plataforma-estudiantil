import jsPDF from 'jspdf';
import { numeroALetras } from '../utils/numeroALetras';

interface ReciboData {
  estudiante: string;
  matricula?: string;
  nivel: string;           // Ej: "UNIVERSIDAD", "BACHILLERATO", "CAPACITACIONES"
  carrera: string;         // Ej: "INGENIERÍA EN SISTEMAS", "PSICOLOGÍA", "PREPA ADULTOS"
  ofertaEducativa: string; // Fallback combinado (se usa si nivel/carrera vacíos)
  concepto: string;
  monto: number;
  folio: string;
  fecha: string; // ISO date YYYY-MM-DD
  logoUrl?: string; // URL dinámica del logo institucional
}

const meses = [
  'Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.',
  'Jul.', 'Ago.', 'Sep.', 'Oct.', 'Nov.', 'Dic.'
];

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });
};

// Función utilitaria: ajusta la fuente hasta que TODAS las palabras quepan
// en el ancho máximo sin cortarse, y retorna las líneas ya divididas.
function fitText(doc: jsPDF, text: string, maxWidth: number, startSize: number, minSize: number): { lines: string[]; fontSize: number } {
  let fs = startSize;
  doc.setFontSize(fs);
  
  const words = text.split(' ');
  // Reducir fuente hasta que la palabra más larga quepa
  while (fs > minSize) {
    doc.setFontSize(fs);
    const longestWord = words.reduce((a, b) => doc.getTextWidth(a) > doc.getTextWidth(b) ? a : b, '');
    if (doc.getTextWidth(longestWord) <= maxWidth) break;
    fs -= 0.3;
  }
  
  doc.setFontSize(fs);
  const lines = doc.splitTextToSize(text, maxWidth);
  return { lines, fontSize: fs };
}

export async function generarReciboPDF(data: ReciboData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  
  const width = doc.internal.pageSize.getWidth(); // ~215.9 mm
  const colorGuinda = [139, 35, 50] as const;
  const colorOro = [212, 175, 55] as const;
  const colorFondoLetras = [240, 240, 240] as const;
  
  const dateObj = new Date(data.fecha + 'T00:00:00'); 
  const dia = dateObj.getDate().toString().padStart(2, '0');
  const mes = meses[dateObj.getMonth()];
  const anio = dateObj.getFullYear().toString();

  // Cargar logo
  let imgLogo: HTMLImageElement | null = null;
  if (data.logoUrl) {
    try {
      imgLogo = await loadImage(data.logoUrl);
    } catch (err) {
      console.warn('No se pudo cargar el logotipo:', err);
    }
  }

  // Textos del nivel y carrera
  const textoNivel = (data.nivel || '').toUpperCase().trim();
  const textoCarrera = (data.carrera || data.ofertaEducativa || '').toUpperCase().trim();

  // ── Columna izquierda: logo + textos ──
  // El logo va de x=12 a x=34 (22mm de ancho), centrado en x=23
  // El texto debe caber en esos 22mm para NO salirse del marco dorado (x=10)
  const logoX = 12;
  const logoW = 22;
  const logoCenter = logoX + logoW / 2; // 23
  const textMaxW = logoW; // 22mm - texto no puede ser más ancho que el logo

  const drawRecibo = (yOffset: number) => {
    const h = 65;

    // 1. Caja dorada exterior
    doc.setDrawColor(colorOro[0], colorOro[1], colorOro[2]);
    doc.setLineWidth(0.7);
    doc.roundedRect(10, yOffset + 5, width - 20, h, 2, 2);
    
    // Franja guinda superior
    doc.setFillColor(colorGuinda[0], colorGuinda[1], colorGuinda[2]);
    doc.setDrawColor(colorGuinda[0], colorGuinda[1], colorGuinda[2]);
    doc.roundedRect(10, yOffset + 5, width - 20, 3, 2, 2, 'F');
    doc.rect(10, yOffset + 7, width - 20, 1, 'F');

    // 2. Logotipo
    if (imgLogo) {
      doc.addImage(imgLogo, 'PNG', logoX, yOffset + 10, logoW, 20);
    } else {
      doc.setDrawColor(200);
      doc.setLineWidth(0.2);
      doc.rect(logoX, yOffset + 10, logoW, 20);
    }
    
    // 3. Nivel educativo (debajo del logo, centrado, en guinda)
    let cursorY = yOffset + 33;
    if (textoNivel) {
      doc.setFont('helvetica', 'bold');
      const nivelFit = fitText(doc, textoNivel, textMaxW, 6, 4);
      doc.setFontSize(nivelFit.fontSize);
      doc.setTextColor(colorGuinda[0], colorGuinda[1], colorGuinda[2]);
      doc.text(nivelFit.lines, logoCenter, cursorY, { align: 'center' });
      cursorY += nivelFit.lines.length * (nivelFit.fontSize * 0.45);
    }

    // 4. Carrera (debajo del nivel, más pequeña, en gris oscuro)
    if (textoCarrera && textoCarrera !== textoNivel) {
      doc.setFont('helvetica', 'normal');
      const carreraFit = fitText(doc, textoCarrera, textMaxW, 5.5, 3.5);
      doc.setFontSize(carreraFit.fontSize);
      doc.setTextColor(80);
      doc.text(carreraFit.lines, logoCenter, cursorY + 1, { align: 'center' });
    }
    
    // 5. Título RECIBO OFICIAL
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colorGuinda[0], colorGuinda[1], colorGuinda[2]);
    doc.text('RECIBO OFICIAL', width / 2 + 10, yOffset + 15, { align: 'center', charSpace: 0.8 });

    // 6. Folio (alineado a la derecha, sin empalmes)
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.setFont('helvetica', 'normal');
    doc.text('Nº FOLIO:', width - 15, yOffset + 12, { align: 'right' });
    
    doc.setFontSize(11);
    doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.text(data.folio, width - 15, yOffset + 17, { align: 'right' });
    
    // 7. Lugar y Fecha
    doc.setTextColor(60);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Yautepec, Morelos.', width / 2 + 10, yOffset + 22, { align: 'center' });
    doc.text(`${dia} de ${mes} del ${anio}`, width / 2 + 10, yOffset + 26, { align: 'center' });

    // Separador sutil
    doc.setDrawColor(210);
    doc.setLineWidth(0.15);
    doc.line(40, yOffset + 30, width - 15, yOffset + 30);
    
    // 8. Estudiante
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.text('Estudiante:', 42, yOffset + 36);
    doc.setFont('helvetica', 'bold');
    let textoEstudianteMatricula = data.estudiante;
    if (data.matricula) {
      textoEstudianteMatricula += ` - Matrícula: ${data.matricula}`;
    }
    doc.text(textoEstudianteMatricula, 64, yOffset + 36);
    doc.setDrawColor(180);
    doc.line(62, yOffset + 37, width - 15, yOffset + 37);

    // 9. Concepto + Monto
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Concepto:', 42, yOffset + 44);
    doc.setFont('helvetica', 'bold');
    const maxConceptoW = (width - 50) - 64; // espacio entre "Concepto:" y "Total: $"
    const conceptoFit = fitText(doc, data.concepto, maxConceptoW, 9, 5.5);
    doc.setFontSize(conceptoFit.fontSize);
    doc.text(conceptoFit.lines[0], 62, yOffset + 44);
    if (conceptoFit.lines.length > 1) {
      doc.setFontSize(conceptoFit.fontSize - 0.5);
      doc.text(conceptoFit.lines[1], 62, yOffset + 47.5);
    }
    doc.setDrawColor(180);
    doc.line(60, yOffset + 45, width - 60, yOffset + 45);

    const montoFormateado = Number(data.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Total: $', width - 50, yOffset + 44);
    doc.setFont('helvetica', 'bold');
    doc.text(montoFormateado, width - 36, yOffset + 44);
    doc.line(width - 38, yOffset + 45, width - 15, yOffset + 45);

    // 10. Cantidad con Letra
    doc.setFillColor(colorFondoLetras[0], colorFondoLetras[1], colorFondoLetras[2]);
    doc.roundedRect(42, yOffset + 49, width - 85, 8, 1.5, 1.5, 'F');
    doc.setFontSize(6);
    doc.setTextColor(140);
    doc.setFont('helvetica', 'normal');
    doc.text('Cantidad con Letra:', 44, yOffset + 52);
    
    doc.setFontSize(7.5);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text(numeroALetras(data.monto), 44, yOffset + 56);

    // 11. Sello / Firma
    doc.setFontSize(6.5);
    doc.setTextColor(80);
    doc.setFont('helvetica', 'normal');
    doc.text('Sello / Firma de Autorización', width - 30, yOffset + 68, { align: 'center' });
    doc.setDrawColor(100);
    doc.setLineWidth(0.2);
    doc.line(width - 45, yOffset + 65, width - 15, yOffset + 65);
  };

  // Dos recibos en la mitad superior (cada uno ~1/4 de página)
  drawRecibo(5);
  drawRecibo(80);

  doc.save(`Recibo_${data.folio}_${data.estudiante.replace(/\s+/g, '_')}.pdf`);
}
