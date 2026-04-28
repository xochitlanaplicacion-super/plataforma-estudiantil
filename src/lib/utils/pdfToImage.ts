/**
 * Convierte cada página de un PDF a una imagen PNG usando pdfjs-dist.
 * Se ejecuta 100% en el navegador del admin (client-side).
 * Devuelve un array de File[] (una imagen por cada página del PDF).
 */

export async function convertirPDFaImagenes(pdfFile: File): Promise<File[]> {
  // Importación dinámica para evitar problemas con SSR/Turbopack
  const pdfjsLib = await import('pdfjs-dist');
  
  // Configurar el worker desde unpkg (más confiable para archivos .mjs de NPM)
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const imagenes: File[] = [];
  const baseName = pdfFile.name.replace(/\.pdf$/i, '');

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    
    // Renderizar a 2x de resolución para mejor calidad de OCR
    const scale = 2.0;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convertir canvas a Blob PNG
    const blob: Blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png', 0.95);
    });

    // Crear un File con nombre descriptivo
    const fileName = pdf.numPages > 1
      ? `${baseName}_pagina${pageNum}.png`
      : `${baseName}.png`;

    const file = new File([blob], fileName, { type: 'image/png' });
    imagenes.push(file);

    // Limpiar memoria
    canvas.width = 0;
    canvas.height = 0;
  }

  return imagenes;
}
