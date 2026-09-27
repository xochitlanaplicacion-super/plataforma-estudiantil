import { describe, expect, it } from 'vitest';
import { readSubmissionPhotos } from '@/lib/storage/photo-gallery';

describe('private submission gallery', () => {
  it('accepts a legacy empty gallery and a bounded ordered photo list', () => {
    expect(readSubmissionPhotos(null)).toEqual([]);
    expect(readSubmissionPhotos([{ path: 'one', name: 'one.jpg' }, { path: 'two', name: 'two.jpg' }]))
      .toEqual([{ path: 'one', name: 'one.jpg' }, { path: 'two', name: 'two.jpg' }]);
  });
  it('rejects galleries beyond 15 entries', () => {
    expect(readSubmissionPhotos(Array.from({ length: 16 }, (_, index) => ({ path: `${index}`, name: 'photo' })))).toEqual([]);
  });
});
