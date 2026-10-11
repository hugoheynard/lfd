import type { LibraryMediaView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import type { ImageDescription } from './image-description';
import {
  blankImage,
  candidateImage,
  depositedDescribed,
  imageLabel,
  isDescribed,
  takenOver,
} from './replace-rules';

const A = 'https://media.test/products/a.png';
const B = 'https://media.test/products/b.png';

const OLD: ImageDescription = {
  url: A,
  name: 'Croissant au beurre',
  alt: { fr: 'Un croissant doré' },
  focal: { x: 0.3, y: 0.6 },
  tags: ['croissant', 'viennoiserie'],
  series: { id: 'ser_1', title: 'Shooting d’automne', shotOn: '2026-09-01' },
};

describe('isDescribed / takenOver', () => {
  it('ne prend pas le repli sur l’adresse pour une description', () => {
    const bare: ImageDescription = { ...OLD, name: '', tags: [], focal: null, alt: { fr: A } };
    expect(isDescribed(bare)).toBe(false);
    expect(isDescribed({ ...bare, focal: { x: 0.5, y: 0.5 } })).toBe(true);
    expect(isDescribed({ ...bare, alt: { fr: 'Une phrase' } })).toBe(true);
  });

  it('omet une alternative qui n’en est pas une', () => {
    expect('alt' in takenOver({ ...OLD, alt: { fr: A } }, B)).toBe(false);
    expect('alt' in takenOver({ ...OLD, alt: { fr: '  ' } }, B)).toBe(false);
  });

  it('reprend tout sur la nouvelle, sauf la série', () => {
    expect(takenOver(OLD, B)).toEqual({
      url: B,
      name: OLD.name,
      tags: OLD.tags,
      alt: OLD.alt,
      focal: OLD.focal,
    });
  });
});

describe('ce qu’on sait d’une image désignée', () => {
  it('nomme une image par son étiquette, sinon par son fichier', () => {
    expect(imageLabel(OLD)).toBe('Croissant au beurre');
    expect(imageLabel({ name: '', url: A })).toBe('a.png');
  });

  it('dit qu’un fichier neuf n’a rien, et qu’on ne sait pas hors du fil', () => {
    expect(depositedDescribed(false, null)).toBe(false);
    expect(depositedDescribed(true, null)).toBeNull();
    expect(depositedDescribed(true, OLD)).toBe(true);
    expect(depositedDescribed(true, blankImage(B))).toBe(false);
  });

  it('lit une image du fonds sans ses informations', () => {
    const item: LibraryMediaView = {
      url: B,
      name: 'B',
      tags: ['pain'],
      alt: { fr: B },
      focal: null,
      uses: 2,
      depositedAt: '2026-10-01T08:00:00.000Z',
      series: null,
      palette: null,
      width: 10,
      height: 10,
      bytes: 10,
      contentType: 'image/png',
    };
    expect(candidateImage(item)).toEqual({
      url: B,
      name: 'B',
      alt: { fr: B },
      focal: null,
      tags: ['pain'],
      series: null,
    });
  });
});
