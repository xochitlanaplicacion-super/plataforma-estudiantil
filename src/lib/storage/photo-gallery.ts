import { normalizeAcademicUpload, type AcademicUploadDescriptor } from './academic-uploads';

export const MAX_SUBMISSION_PHOTOS = 15;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_GALLERY_BYTES = 20 * 1024 * 1024;

export type SubmissionPhoto = { path: string; name: string };

export function isSubmissionPhotoFile(file: AcademicUploadDescriptor): boolean {
  return normalizeAcademicUpload(file, { allowImages: true })?.mime.startsWith('image/') ?? false;
}

export function readSubmissionPhotos(value: unknown): SubmissionPhoto[] {
  if (!Array.isArray(value) || value.length > MAX_SUBMISSION_PHOTOS) return [];
  return value.filter((entry): entry is SubmissionPhoto =>
    !!entry && typeof entry === 'object'
      && typeof entry.path === 'string'
      && typeof entry.name === 'string');
}

/** Browser-only JPEG processing; preserve enough detail for legible homework. */
export async function prepareSubmissionPhoto(file: File): Promise<File> {
  if (!isSubmissionPhotoFile(file)) throw new Error('Selecciona una imagen válida.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo procesar la foto.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.78, 0.68, 0.58]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw new Error('No se pudo comprimir la foto.');
      if (blob.size <= MAX_PHOTO_BYTES) {
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
      }
    }
    throw new Error('La foto sigue siendo demasiado grande. Prueba con otra resolución.');
  } finally {
    bitmap.close();
  }
}
