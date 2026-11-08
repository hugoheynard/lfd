import { describe, expect, it } from 'vitest';

import {
  boundaryAtFraction,
  boundaryPositions,
  boundaryRange,
  equalWidths,
  moveBoundary,
  placeBoundary,
  sameWidths,
  twelfthsPercent,
  widthsSpoken,
} from './mail-column-boundaries';

describe('les frontières entre colonnes', () => {
  it('place chaque frontière en douzièmes depuis le bord gauche', () => {
    expect(boundaryPositions([50, 50])).toEqual([6]);
    expect(boundaryPositions([25, 50, 25])).toEqual([3, 9]);
  });

  it('borne une frontière pour que ses deux voisines gardent 2/12', () => {
    expect(boundaryRange([50, 50], 0)).toEqual({ min: 2, max: 10 });
    expect(boundaryRange([33, 33, 33], 1)).toEqual({ min: 6, max: 10 });
  });

  it('ne déplace que les deux colonnes voisines, leur somme gardée', () => {
    expect(placeBoundary([33, 33, 33], 1, 9)).toEqual([33, 42, 25]);
    expect(moveBoundary([50, 50], 0, 1)).toEqual([58, 42]);
    expect(moveBoundary([50, 50], 0, -1)).toEqual([42, 58]);
  });

  it('s’arrête aux bornes au lieu de dépasser', () => {
    expect(placeBoundary([50, 50], 0, 20)).toEqual([83, 17]);
    expect(placeBoundary([33, 33, 33], 0, 0)).toEqual([17, 50, 33]);
    expect(moveBoundary([83, 17], 0, 1)).toEqual([83, 17]);
  });

  it('rend le même tableau quand rien ne bouge, ou pour une frontière inconnue', () => {
    const widths = [50, 50] as const;
    expect(placeBoundary(widths, 0, 6)).toBe(widths);
    expect(placeBoundary(widths, 3, 4)).toBe(widths);
    expect(placeBoundary(widths, 0, Number.NaN)).toBe(widths);
  });

  it('aimante le pointeur au douzième le plus proche', () => {
    expect(boundaryAtFraction([50, 50], 0, 0.6)).toEqual([58, 42]);
    expect(boundaryAtFraction([50, 50], 0, 0.52)).toEqual([50, 50]);
    expect(boundaryAtFraction([50, 50], 0, -0.4)).toEqual([17, 83]);
  });

  it('égalise deux ou trois colonnes, et seulement quand la ligne se partage en crans', () => {
    expect(equalWidths(2)).toEqual([50, 50]);
    expect(equalWidths(3)).toEqual([33, 33, 33]);
    expect(equalWidths(5)).toBeNull();
    expect(equalWidths(0)).toBeNull();
  });

  it('dit une position en pour cent et une répartition en mots', () => {
    expect(twelfthsPercent(7)).toBe(58);
    expect(widthsSpoken([58, 42])).toBe('colonne 1 à 58 %, colonne 2 à 42 %');
    expect(sameWidths([50, 50], [50, 50])).toBe(true);
    expect(sameWidths([50, 50], [58, 42])).toBe(false);
  });
});
