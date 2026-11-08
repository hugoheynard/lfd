import { describe, expect, it } from 'vitest';

import { pointerOverColumns } from './mail-columns-drop-zone';

const LAYOUT = { left: 100, right: 500, top: 200, bottom: 320 };

describe('pointerOverColumns — viser une colonne sans que le fil la fasse fuir', () => {
  it('pointeur sur une cellule : le fil ne trie pas (la place de dépôt ne repousse plus la mise en page)', () => {
    expect(pointerOverColumns({ x: 150, y: 250 }, [LAYOUT])).toBe(true);
  });

  it('pointeur sur la gouttière ou un bord : toujours dans la mise en page', () => {
    expect(pointerOverColumns({ x: 300, y: 200 }, [LAYOUT])).toBe(true);
    expect(pointerOverColumns({ x: 500, y: 320 }, [LAYOUT])).toBe(true);
  });

  it('au-dessus ou au-dessous de la mise en page : le fil reprend son tri', () => {
    expect(pointerOverColumns({ x: 150, y: 199 }, [LAYOUT])).toBe(false);
    expect(pointerOverColumns({ x: 150, y: 321 }, [LAYOUT])).toBe(false);
  });

  it('dans l’une de plusieurs mises en page', () => {
    const second = { left: 100, right: 500, top: 400, bottom: 480 };
    expect(pointerOverColumns({ x: 120, y: 450 }, [LAYOUT, second])).toBe(true);
    expect(pointerOverColumns({ x: 120, y: 350 }, [LAYOUT, second])).toBe(false);
  });

  it('sans pointeur connu (glisser qui commence), le fil reste une destination', () => {
    expect(pointerOverColumns(null, [LAYOUT])).toBe(false);
  });
});
