import { describe, expect, it } from 'vitest';

import { PointerDrag, type PointerLike } from '../storefront-drag';

function pointer(x: number, y: number, button = 0): PointerLike {
  return { clientX: x, clientY: y, button, preventDefault: () => undefined };
}

const source = { format: 'tile', template: null, blockId: 'b' } as const;

describe('PointerDrag', () => {
  it('seul le bouton principal commence un glisser', () => {
    const drag = new PointerDrag();
    drag.start(pointer(0, 0, 2), source, { column: 0, row: 0 });
    expect(drag.state()).toBeNull();
  });

  it('sous le seuil, c’est un clic ; au-delà, un glisser', () => {
    const drag = new PointerDrag();
    drag.start(pointer(10, 10), source, { column: 0, row: 0 });
    drag.move(pointer(12, 12), { column: 1, row: 1 });
    expect(drag.state()?.moved).toBe(false);
    drag.move(pointer(30, 10), { column: 2, row: 1 });
    expect(drag.state()?.moved).toBe(true);
  });

  it('vise l’origine de l’objet, décalée de la case saisie', () => {
    const drag = new PointerDrag();
    drag.start(pointer(0, 0), source, { column: 1, row: 0 });
    drag.move(pointer(50, 0), { column: 4, row: 2 });
    expect(drag.state()?.target).toEqual({ column: 3, row: 2 });
    expect(drag.finish({ column: 5, row: 3 })?.origin).toEqual({ column: 4, row: 3 });
    expect(drag.state()).toBeNull();
  });

  it('hors de la grille : pas de cible ; annuler efface tout', () => {
    const drag = new PointerDrag();
    drag.start(pointer(0, 0), source, { column: 0, row: 0 });
    drag.move(pointer(50, 0), null);
    expect(drag.state()?.target).toBeNull();
    drag.cancel();
    expect(drag.finish(null)).toBeNull();
  });
});
