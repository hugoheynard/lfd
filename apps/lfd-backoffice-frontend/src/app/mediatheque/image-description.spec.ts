import type { LibraryMediaView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import {
  type DescriptionFields,
  type ImageDescription,
  describedImage,
  factsOf,
  focalAt,
  keyIntent,
  neighboursOf,
  percentLabel,
  sameDescription,
} from './image-description';

const BOX = { left: 100, top: 50, width: 200, height: 100 };

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

describe('le point focal', () => {
  it('se pose en fractions de l’image, pas en pixels', () => {
    expect(focalAt(150, 75, BOX)).toEqual({ x: 0.25, y: 0.25 });
  });

  it('reste dans l’image quand le clic déborde', () => {
    expect(focalAt(0, 500, BOX)).toEqual({ x: 0, y: 1 });
  });

  it('ne se pose pas sur une cible sans surface', () => {
    expect(focalAt(10, 10, { ...BOX, width: 0 })).toBeNull();
  });

  it('se lit au pour cent', () => {
    expect(percentLabel(0.304)).toBe('30 %');
  });
});

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

  it('a des voisines, sauf aux bords et hors de la suite', () => {
    const images = [image('a'), image('b'), image('c')];
    expect(neighboursOf(images, 'b')).toEqual({ previous: images[0], next: images[2] });
    expect(neighboursOf(images, 'a').previous).toBeNull();
    expect(neighboursOf(images, 'z')).toEqual({ previous: null, next: null });
    expect(neighboursOf(images, null)).toEqual({ previous: null, next: null });
  });
});

describe('les touches du panneau', () => {
  it('annule sur Échap, partout', () => {
    expect(keyIntent('Escape', document.createElement('input'))).toBe('cancel');
  });

  it('suit les flèches hors d’un champ, pas dedans', () => {
    const elsewhere = document.createElement('div');
    expect(keyIntent('ArrowLeft', elsewhere)).toBe('previous');
    expect(keyIntent('ArrowRight', elsewhere)).toBe('next');
    expect(keyIntent('ArrowRight', document.createElement('textarea'))).toBeNull();
    expect(keyIntent('Enter', elsewhere)).toBeNull();
  });
});
