import pptxgen from "pptxgenjs";

// Mapeo de colores dominantes por plantilla
const TEMPLATE_BG_COLORS: Record<string, string> = {
  azul:               '0F172A',
  canva_estrellas_1:  'DBEAFE',
  blue_modern:        'EFF6FF',
  acuarela_multicolor:'FAF5FF',
  lluvia_ideas:       'FEF3C7',
  purple_watercolor:  'EDE9FE',
  purple_business:    'F5F3FF',
  blanco:             'FFFFFF',
};

// Convierte un color css/hex o rgba al formato sin # para pptxgenjs
const parseColor = (color: string) => {
  if (!color) return '000000';
  if (color.startsWith('#')) return color.substring(1);
  return color; 
};

export async function exportSlidesToPptx(slides: any[], temaTitulo: string, logoUrl?: string) {
  const pres = new pptxgen();
  
  // Establecer diseño 16:9 (10 x 5.625 inches)
  pres.layout = "LAYOUT_16x9";

  for (const slideData of slides) {
    const slide = pres.addSlide();
    
    // 1. Aplicar color de fondo de la plantilla
    const estilo = slideData.estilo || 'azul';
    slide.background = { fill: TEMPLATE_BG_COLORS[estilo] || 'FFFFFF' };

    // 2. Si hay logo dinámico de la escuela, añadirlo como marca de agua tenue en la esquina superior derecha
    if (logoUrl) {
      slide.addImage({
        path: logoUrl,
        x: 8.5, 
        y: 0.2, 
        w: 1.2, 
        h: 1.2, 
        sizing: { type: 'contain', w: 1.2, h: 1.2 },
        transparency: 50 // 50% transparente para que sea tenue
      });
    }

    try {
      const contenido = JSON.parse(slideData.contenido);
      if (contenido?.elements && Array.isArray(contenido.elements)) {
        for (const el of contenido.elements) {
          // pptxgenjs funciona en inches.
          // width: 100% = 10 inches, height: 100% = 5.625 inches
          const x = (el.x / 100) * 10;
          const y = (el.y / 100) * 5.625;
          const w = (el.width / 100) * 10;
          const h = (el.height / 100) * 5.625;

          if (el.type === 'text') {
            const text = el.content || '';
            const fontSize = parseInt(el.style?.fontSize?.replace('px', '')) || 24;
            const fontColor = parseColor(el.style?.color);
            const fontFamily = el.style?.fontFamily || 'Arial';
            const fontWeight = el.style?.fontWeight === 'bold';
            
            // Reemplazar saltos de línea y viñetas visuales por saltos reales si es necesario
            const cleanText = text.replace(/<br\/>/g, '\n');

            slide.addText(cleanText, {
              x, y, w, h,
              fontSize: fontSize * 0.75, // Ajuste empírico de pixeles de pantalla a puntos (pt)
              color: fontColor,
              fontFace: fontFamily,
              bold: fontWeight,
              valign: 'top',
              align: 'left',
              margin: 0,
            });
          } else if (el.type === 'image' && el.content) {
            slide.addImage({
              path: el.content,
              x, y, w, h,
              sizing: { type: 'contain', w, h }
            });
          }
        }
      }
    } catch (e) {
      console.error("Error parseando contenido de slide para PPTX:", e);
    }
  }

  // Generar y descargar el archivo PPTX usando el título del tema
  const safeTitle = temaTitulo.replace(/[^a-záéíóúñ0-9]/gi, '_').toLowerCase() || 'clase';
  await pres.writeFile({ fileName: `${safeTitle}.pptx` });
}
