import type { LibraryMediaView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import {
  type DescriptionFields,
  type ImageDescription,
  describedImage,
  factsOf,
  sameDescription,
} from './image-description';

const FIELDS: DescriptionFields = {
  name: 'Croissant',
  alt: { fr: 'Un croissant' },
  focal: { x: 0.5, y: 0.5 },
  tags: ['croissant', 'beurre'],
  seriesId: null,
};

const ITEM: LibraryMediaView = {
  url: 'https://media.test/a.png',
  name: 'A',
  tags: ['pain'],
  alt: { fr: 'Du pain' },
  focal: null,
  uses: 2,
  depositedAt: '2026-10-04T22:05:00.000Z',
  series: null,
  palette: null,
  width: 1600,
  height: 1200,
  bytes: 2048,
  contentType: 'image/jpeg',
};

function image(url: string): ImageDescription {
  return { url, name: '', alt: { fr: '' }, focal: null, tags: [], series: null };
}

describe('deux descriptions', () => {
  it('sont les mêmes aux blancs de bord près d’une alternative', () => {
    expect(sameDescription(FIELDS, { ...FIELDS, alt: { fr: ' Un croissant ' } })).toBe(true);
  });

  it('diffèrent par l’ordre des mots-clés, le point ou la série', () => {
    expect(sameDescription(FIELDS, { ...FIELDS, tags: ['beurre', 'croissant'] })).toBe(false);
    expect(sameDescription(FIELDS, { ...FIELDS, focal: null })).toBe(false);
    expect(sameDescription(FIELDS, { ...FIELDS, seriesId: 's1' })).toBe(false);
    expect(
      sameDescription(FIELDS, { ...FIELDS, alt: { fr: 'Un croissant', it: 'Cornetto' } }),
    ).toBe(false);
  });
});

describe('une image du fil', () => {
  it('se lit avec ses informations, mises en forme', () => {
    const facts = factsOf(describedImage(ITEM));
    expect(facts).toMatchObject({
      format: 'JPEG',
      dimensions: '1600 × 1200 px',
      fileName: 'a.png',
      uses: 2,
      usesWording: '2 emplois',
    });
    expect(facts?.depositedAt).toContain('5 octobre 2026');
  });

  it('n’a pas d’informations sans mesure', () => {
    expect(factsOf(image('x'))).toBeNull();
    expect(factsOf(null)).toBeNull();
  });
});
