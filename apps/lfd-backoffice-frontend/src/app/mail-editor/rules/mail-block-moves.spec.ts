import { modelBlockId, type MailDocument } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import {
  cellListIds,
  draggedBlockId,
  FLOW,
  moveBlock,
  moveDestinations,
  narrowsImage,
  slotOf,
  type BlockContainer,
} from './mail-block-moves';

const TITLE = { id: modelBlockId('title'), kind: 'model', section: 'title' } as const;
const NOTE = { id: 'note', kind: 'paragraph', text: { fr: 'Note' } } as const;
const WIDE = {
  id: 'wide',
  kind: 'image',
  src: 'https://m.fr/a.webp',
  alt: {},
  width: 'full',
} as const;
const HEAD = { id: 'head', kind: 'heading', text: { fr: 'Titre' } } as const;
const RULE = { id: 'rule', kind: 'divider' } as const;
const COLS = { id: 'cols', kind: 'columns', widths: [50, 50], cells: [[HEAD], [RULE]] } as const;
const OTHER = { id: 'other', kind: 'columns', widths: [33, 33, 33], cells: [[], [], []] } as const;

const DOC: MailDocument = { template: 't', blocks: [TITLE, NOTE, COLS, WIDE, OTHER] };

function cell(columnsId: string, index: number): BlockContainer {
  return { kind: 'cell', columnsId, cell: index };
}

function ids(document: MailDocument): readonly string[] {
  return document.blocks.map((block) => block.id);
}

describe('moveBlock — fil, cellules et bibliothèque en une édition', () => {
  it('réordonne dans le fil sans toucher le document d’origine', () => {
    const next = moveBlock(DOC, { container: FLOW, index: 1 }, { container: FLOW, index: 0 });
    expect(ids(next)).toEqual(['note', 'model:title', 'cols', 'wide', 'other']);
    expect(ids(DOC)).toEqual(['model:title', 'note', 'cols', 'wide', 'other']);
  });

  it('fait entrer un bloc du fil dans une cellule, à sa place', () => {
    const next = moveBlock(
      DOC,
      { container: FLOW, index: 1 },
      { container: cell('cols', 0), index: 0 },
    );
    expect(ids(next)).toEqual(['model:title', 'cols', 'wide', 'other']);
    expect(slotOf(next, 'note')).toEqual({ container: cell('cols', 0), index: 0 });
  });

  it('passe d’une cellule à une autre, dans la même mise en page ou une autre', () => {
    const across = moveBlock(
      DOC,
      { container: cell('cols', 0), index: 0 },
      { container: cell('cols', 1), index: 1 },
    );
    expect(slotOf(across, 'head')).toEqual({ container: cell('cols', 1), index: 1 });
    const other = moveBlock(
      DOC,
      { container: cell('cols', 1), index: 0 },
      { container: cell('other', 2), index: 0 },
    );
    expect(slotOf(other, 'rule')).toEqual({ container: cell('other', 2), index: 0 });
  });

  it('ressort une cellule vers le fil', () => {
    const next = moveBlock(
      DOC,
      { container: cell('cols', 0), index: 0 },
      { container: FLOW, index: 0 },
    );
    expect(ids(next)[0]).toBe('head');
    expect(slotOf(next, 'head')?.container).toEqual(FLOW);
  });

  it('réordonne dans une cellule', () => {
    const two = moveBlock(
      DOC,
      { container: FLOW, index: 1 },
      { container: cell('cols', 0), index: 1 },
    );
    const next = moveBlock(
      two,
      { container: cell('cols', 0), index: 1 },
      { container: cell('cols', 0), index: 0 },
    );
    expect(slotOf(next, 'note')?.index).toBe(0);
  });

  it('pose un bloc neuf de la bibliothèque dans une cellule', () => {
    const next = moveBlock(
      DOC,
      { added: { id: 'neuf', kind: 'divider' } },
      { container: cell('other', 1), index: 0 },
    );
    expect(slotOf(next, 'neuf')).toEqual({ container: cell('other', 1), index: 0 });
  });

  it('refuse une mise en page ou un bloc du modèle dans une cellule : le document est rendu tel quel', () => {
    expect(
      moveBlock(DOC, { container: FLOW, index: 4 }, { container: cell('cols', 0), index: 0 }),
    ).toBe(DOC);
    expect(
      moveBlock(DOC, { container: FLOW, index: 0 }, { container: cell('cols', 0), index: 0 }),
    ).toBe(DOC);
    expect(moveBlock(DOC, { added: OTHER }, { container: cell('cols', 0), index: 0 })).toBe(DOC);
  });

  it('une image pleine largeur entrée dans une cellule y passe dans le texte, dans la même édition', () => {
    expect(narrowsImage(WIDE, cell('cols', 0))).toBe(true);
    expect(narrowsImage(WIDE, FLOW)).toBe(false);
    const next = moveBlock(
      DOC,
      { container: FLOW, index: 3 },
      { container: cell('cols', 1), index: 0 },
    );
    const cols = next.blocks.find((block) => block.id === 'cols');
    expect(cols?.kind === 'columns' ? cols.cells[1]?.[0] : null).toEqual({
      id: 'wide',
      kind: 'image',
      src: 'https://m.fr/a.webp',
      alt: {},
    });
  });

  it('une place inconnue ou identique rend le même document', () => {
    expect(moveBlock(DOC, { container: FLOW, index: 9 }, { container: FLOW, index: 0 })).toBe(DOC);
    expect(
      moveBlock(DOC, { container: FLOW, index: 1 }, { container: cell('absent', 0), index: 0 }),
    ).toBe(DOC);
    expect(moveBlock(DOC, { container: FLOW, index: 1 }, { container: FLOW, index: 1 })).toBe(DOC);
  });
});

describe('les outils du glisser', () => {
  it('nomme une liste par cellule, dans l’ordre du fil', () => {
    expect(cellListIds(DOC, 'p')).toEqual([
      'p-cell-cols-0',
      'p-cell-cols-1',
      'p-cell-other-0',
      'p-cell-other-1',
      'p-cell-other-2',
    ]);
  });

  it('lit l’identifiant d’un bloc glissé, pas une clé de bibliothèque', () => {
    expect(draggedBlockId({ blockId: 'note' })).toBe('note');
    expect(draggedBlockId('image')).toBeNull();
  });
});

describe('moveDestinations — « Déplacer vers… » au clavier', () => {
  it('propose le fil puis chaque colonne ; le fil d’un bloc de colonne est sous sa mise en page', () => {
    const destinations = moveDestinations(DOC, 'head');
    expect(destinations.map((destination) => destination.label)).toEqual([
      'Dans l’e-mail, hors des colonnes',
      'Mise en page 1 · colonne 1 sur 2',
      'Mise en page 1 · colonne 2 sur 2',
      'Mise en page 2 · colonne 1 sur 3',
      'Mise en page 2 · colonne 2 sur 3',
      'Mise en page 2 · colonne 3 sur 3',
    ]);
    const out = moveBlock(DOC, slotOf(DOC, 'head')!, destinations[0]!.slot);
    expect(ids(out)).toEqual(['model:title', 'note', 'cols', 'head', 'wide', 'other']);
    const into = moveBlock(DOC, slotOf(DOC, 'head')!, destinations[2]!.slot);
    expect(slotOf(into, 'head')).toEqual({ container: cell('cols', 1), index: 1 });
  });

  it('une mise en page ou un bloc du modèle n’a que le fil', () => {
    expect(moveDestinations(DOC, 'other')).toHaveLength(1);
    expect(moveDestinations(DOC, 'model:title')).toHaveLength(1);
    expect(moveDestinations(DOC, 'absent')).toEqual([]);
  });
});
