import { describe, expect, it, vi } from 'vitest';
import {
  ACADEMIC_UPLOAD_MAX_BYTES,
  academicUploadValidationMessage,
  buildTenantAcademicStoragePath,
  normalizeAcademicUpload,
} from '@/lib/storage/academic-uploads';

describe('academic upload limits and paths', () => {
  it('accepts exactly 20 MiB and rejects one additional byte', () => {
    expect(normalizeAcademicUpload({
      name: 'actividad.pdf',
      type: 'application/pdf',
      size: ACADEMIC_UPLOAD_MAX_BYTES,
    }, { allowImages: false })).toEqual({ extension: 'pdf', mime: 'application/pdf' });

    expect(academicUploadValidationMessage({
      name: 'actividad.pdf',
      type: 'application/pdf',
      size: ACADEMIC_UPLOAD_MAX_BYTES + 1,
    }, { allowImages: false })).toContain('20 MB');
  });

  it('allows student photos but not teacher resource images', () => {
    const photo = { name: 'evidencia.jpg', type: 'image/jpeg', size: 1024 };
    expect(normalizeAcademicUpload(photo, { allowImages: true })).toEqual({ extension: 'jpg', mime: 'image/jpeg' });
    expect(normalizeAcademicUpload(photo, { allowImages: false })).toBeNull();
  });

  it('builds a tenant-first object path with a non-user-controlled filename', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });
    expect(buildTenantAcademicStoragePath(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'recursos',
      'Mi archivo final.PDF',
      'tema-1'
    )).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/recursos/tema-1/11111111-1111-4111-8111-111111111111.pdf');
    vi.unstubAllGlobals();
  });

  it('rejects an extension whose declared MIME does not match', () => {
    expect(normalizeAcademicUpload({
      name: 'archivo.pdf',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 2048,
    }, { allowImages: false })).toBeNull();
  });

  it('normalizes the CSV MIME used by Excel on Windows', () => {
    expect(normalizeAcademicUpload({
      name: 'lista.csv',
      type: 'application/vnd.ms-excel',
      size: 2048,
    }, { allowImages: false })).toEqual({ extension: 'csv', mime: 'text/csv' });
  });
});
