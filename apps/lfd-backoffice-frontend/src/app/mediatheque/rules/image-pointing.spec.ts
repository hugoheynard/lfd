import { describe, expect, it } from 'vitest';

import type { ImageDescription } from './image-description';
import { focalAt, keyIntent, neighboursOf, percentLabel } from './image-pointing';

const BOX = { left: 100, top: 50, width: 200, height: 100 };

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

describe('une suite d’images', () => {
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
