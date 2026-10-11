import { describe, expect, it } from 'vitest';

import {
  carriersWording,
  counted,
  imagesLabel,
  photosWording,
  tileLabel,
  usesWording,
} from './media-wording';

describe('les comptes en toutes lettres', () => {
  it('accorde au singulier à 1 seulement, zéro compris au pluriel', () => {
    expect(counted(0, 'image')).toBe('0 images');
    expect(counted(1, 'image')).toBe('1 image');
    expect(counted(3, 'cheval', 'chevaux')).toBe('3 chevaux');
  });

  it('dit les images, les porteurs et les photos', () => {
    expect(imagesLabel(1)).toBe('1 image');
    expect(imagesLabel(2)).toBe('2 images');
    expect(carriersWording(1)).toBe('1 porteur');
    expect(carriersWording(4)).toBe('4 porteurs');
    expect(photosWording(1)).toBe('1 photo');
    expect(photosWording(12)).toBe('12 photos');
  });

  it('dit « Inutilisée » plutôt que « 0 emploi »', () => {
    expect(usesWording(0)).toBe('Inutilisée');
    expect(usesWording(1)).toBe('1 emploi');
    expect(usesWording(3)).toBe('3 emplois');
  });

  it('avoue une étiquette manquante plutôt qu’un vide', () => {
    expect(tileLabel({ name: '' })).toBe('Sans nom');
    expect(tileLabel({ name: 'Croissant' })).toBe('Croissant');
  });
});
