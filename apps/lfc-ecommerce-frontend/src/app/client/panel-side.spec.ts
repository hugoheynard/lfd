import { afterEach, vi } from 'vitest';

import { dialogSide, NARROW_QUERY, panelSide } from './panel-side';

/** Ce que `matchMedia` répond : vrai seulement pour le pli, et seulement en pile. */
function widthIs(narrow: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: narrow && query === NARROW_QUERY,
    media: query,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('panel-side', () => {
  it('un panneau monte du bas en pile, et se range à droite au-delà', () => {
    widthIs(true);
    expect(panelSide()).toBe('bottom');
    widthIs(false);
    expect(panelSide()).toBe('right');
  });

  it('un dialogue monte du bas en pile, et se centre au-delà', () => {
    widthIs(true);
    expect(dialogSide()).toBe('bottom');
    widthIs(false);
    expect(dialogSide()).toBe('center');
  });

  it('lit la largeur au moment de l’appel, pas une fois pour toutes', () => {
    widthIs(false);
    expect(dialogSide()).toBe('center');
    widthIs(true);
    expect(dialogSide()).toBe('bottom');
  });
});
