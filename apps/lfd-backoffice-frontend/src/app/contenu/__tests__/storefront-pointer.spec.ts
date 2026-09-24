import { describe, expect, it } from 'vitest';

import { cellAtPoint } from '../storefront-pointer';

describe('cellAtPoint', () => {
  const box = { left: 100, top: 50, width: 500, height: 300 };

  it('aimante à la case sous le point', () => {
    expect(cellAtPoint(box, 3, 101, 51)).toEqual({ column: 1, row: 1 });
    expect(cellAtPoint(box, 3, 350, 200)).toEqual({ column: 3, row: 2 });
  });

  it('le bord droit/bas appartient à la dernière case', () => {
    expect(cellAtPoint(box, 3, 600, 350)).toEqual({ column: 5, row: 3 });
  });

  it('hors de la grille, ou grille sans taille : null', () => {
    expect(cellAtPoint(box, 3, 99, 60)).toBeNull();
    expect(cellAtPoint(box, 3, 200, 351)).toBeNull();
    expect(cellAtPoint({ ...box, width: 0 }, 3, 100, 50)).toBeNull();
  });
});
