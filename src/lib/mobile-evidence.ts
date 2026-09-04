'use client';

const MAX_IMAGE_BYTES = 750_000;
const MAX_PDF_BYTES = 1_500_000;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('El navegador no pudo leer esta fotografía. Tómala desde la cámara de la plataforma o cambia el formato a JPG.')); };
    image.src = url;
  });
}

/** Normaliza fotos grandes/HEIC que Safari puede decodificar a un JPEG pequeño y portable. */
export async function normalizeEvidenceFile(file: File, allowPdf = false): Promise<File> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const isPdf = file.type === 'application/pdf' || extension === 'pdf';
  if (isPdf) {
    if (!allowPdf) throw new Error('Este campo sólo admite fotografías.');
    if (file.size > MAX_PDF_BYTES) throw new Error('El PDF supera 1.5 MB. Comprímelo o toma una fotografía desde la plataforma.');
    return file.type === 'application/pdf' ? file : new File([file], file.name, { type: 'application/pdf', lastModified: file.lastModified });
  }
  const looksLikeImage = file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension);
  if (!looksLikeImage) throw new Error(allowPdf ? 'Selecciona una fotografía o un PDF.' : 'Selecciona una fotografía.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('La fotografía original supera 25 MB. Reduce su resolución e inténtalo nuevamente.');

  const image = await loadImage(file);
  let scale = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight));
  let quality = 0.82;
  let blob: Blob | null = null;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('El navegador no pudo preparar la fotografía.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    blob = await canvasBlob(canvas, quality);
    if (blob && blob.size <= MAX_IMAGE_BYTES) break;
    quality = Math.max(0.56, quality - 0.07);
    scale *= 0.86;
  }
  if (!blob || blob.size > MAX_IMAGE_BYTES) throw new Error('No se pudo optimizar la fotografía para enviarla con seguridad.');
  const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'fotografia';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

export function filePreviewDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('No se pudo mostrar la fotografía.'));
    reader.readAsDataURL(file);
  });
}
