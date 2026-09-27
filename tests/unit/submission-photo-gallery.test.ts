import { describe, expect, it } from 'vitest';
import { isSubmissionPhotoFile, readSubmissionPhotos } from '@/lib/storage/photo-gallery';

describe('private submission gallery', () => {
  it('routes photos from the general file picker to the gallery, but not documents', () => {
    expect(isSubmissionPhotoFile({ name: 'evidence.jpg', type: 'image/jpeg', size: 2000 })).toBe(true);
    expect(isSubmissionPhotoFile({ name: 'evidence.heic', type: '', size: 2000 })).toBe(true);
    expect(isSubmissionPhotoFile({ name: 'evidence.pdf', type: 'application/pdf', size: 2000 })).toBe(false);
    expect(isSubmissionPhotoFile({ name: 'fake.jpg', type: 'application/pdf', size: 2000 })).toBe(false);
  });
  it('accepts a legacy empty gallery and a bounded ordered photo list', () => {
    expect(readSubmissionPhotos(null)).toEqual([]);
    expect(readSubmissionPhotos([{ path: 'one', name: 'one.jpg' }, { path: 'two', name: 'two.jpg' }]))
      .toEqual([{ path: 'one', name: 'one.jpg' }, { path: 'two', name: 'two.jpg' }]);
  });
  it('rejects galleries beyond 15 entries', () => {
    expect(readSubmissionPhotos(Array.from({ length: 16 }, (_, index) => ({ path: `${index}`, name: 'photo' })))).toEqual([]);
  });
});
