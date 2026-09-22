export const ACADEMIC_UPLOAD_MAX_MB = 20;
export const ACADEMIC_UPLOAD_MAX_BYTES = ACADEMIC_UPLOAD_MAX_MB * 1024 * 1024;

export const EDUCATIONAL_RESOURCE_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export const EDUCATIONAL_RESOURCE_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx',
] as const;

export const STUDENT_SUBMISSION_MIME_TYPES = [
  ...EDUCATIONAL_RESOURCE_MIME_TYPES,
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export const STUDENT_SUBMISSION_EXTENSIONS = [
  ...EDUCATIONAL_RESOURCE_EXTENSIONS,
  'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif',
] as const;

export const EDUCATIONAL_RESOURCE_ACCEPT = [
  ...EDUCATIONAL_RESOURCE_MIME_TYPES,
  ...EDUCATIONAL_RESOURCE_EXTENSIONS.map((extension) => `.${extension}`),
].join(',');

export const STUDENT_SUBMISSION_ACCEPT = [
  ...STUDENT_SUBMISSION_MIME_TYPES,
  ...STUDENT_SUBMISSION_EXTENSIONS.map((extension) => `.${extension}`),
].join(',');

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const MIME_ALIASES_BY_EXTENSION: Record<string, readonly string[]> = {
  csv: [
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'text/comma-separated-values',
  ],
};

export interface AcademicUploadDescriptor {
  name: string;
  type?: string | null;
  size: number;
}

export interface NormalizedAcademicUpload {
  extension: string;
  mime: string;
}

function normalizeMime(type?: string | null) {
  const normalized = (type || '').trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

export function getUploadExtension(name: string) {
  return name.trim().split('.').pop()?.toLowerCase() || '';
}

export function normalizeAcademicUpload(
  file: AcademicUploadDescriptor,
  options: { allowImages: boolean }
): NormalizedAcademicUpload | null {
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > ACADEMIC_UPLOAD_MAX_BYTES) {
    return null;
  }

  const extension = getUploadExtension(file.name);
  const allowedExtensions = options.allowImages
    ? STUDENT_SUBMISSION_EXTENSIONS
    : EDUCATIONAL_RESOURCE_EXTENSIONS;
  if (!(allowedExtensions as readonly string[]).includes(extension)) return null;

  const declaredMime = normalizeMime(file.type);
  const mime = !declaredMime || declaredMime === 'application/octet-stream'
    ? MIME_BY_EXTENSION[extension]
    : declaredMime;
  const allowedMimeTypes = options.allowImages
    ? STUDENT_SUBMISSION_MIME_TYPES
    : EDUCATIONAL_RESOURCE_MIME_TYPES;

  const canonicalMime = MIME_BY_EXTENSION[extension];
  const acceptedForExtension = MIME_ALIASES_BY_EXTENSION[extension] || [canonicalMime];
  if (!mime || !acceptedForExtension.includes(mime)) return null;
  if (!(allowedMimeTypes as readonly string[]).includes(canonicalMime)) return null;
  return { extension, mime: canonicalMime };
}

export function academicUploadValidationMessage(
  file: AcademicUploadDescriptor,
  options: { allowImages: boolean }
) {
  if (!Number.isFinite(file.size) || file.size <= 0) return 'El archivo está vacío.';
  if (file.size > ACADEMIC_UPLOAD_MAX_BYTES) {
    return `El archivo supera el límite de ${ACADEMIC_UPLOAD_MAX_MB} MB.`;
  }
  if (!normalizeAcademicUpload(file, options)) {
    return options.allowImages
      ? 'Tipo no permitido. Usa una foto, PDF, Excel, CSV, Word o PowerPoint.'
      : 'Tipo no permitido. Usa PDF, Word, Excel, CSV o PowerPoint.';
  }
  return null;
}

export function buildTenantAcademicStoragePath(
  tenantId: string,
  category: 'actividades-guia' | 'recursos',
  fileName: string,
  parentId?: string
) {
  const extension = getUploadExtension(fileName);
  if (!tenantId || !extension) throw new Error('No se pudo determinar una ruta segura para el archivo.');
  const segments = [tenantId, category];
  if (parentId) segments.push(parentId);
  segments.push(`${crypto.randomUUID()}.${extension}`);
  return segments.join('/');
}
