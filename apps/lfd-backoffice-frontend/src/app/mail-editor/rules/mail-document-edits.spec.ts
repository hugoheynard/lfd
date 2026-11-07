import { modelBlockId, type MailDocument, type FreeBlock } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import {
  appendBlock,
  appendToCell,
  findEditableBlock,
  moveBlock,
  moveBlockBy,
  newCellBlock,
  newLibraryBlock,
  removeBlock,
  replaceFreeBlock,
  setColumnWidth,
  textOf,
  withText,
} from './mail-document-edits';

const TITLE = { id: modelBlockId('title'), kind: 'model', section: 'title' } as const;
const FOOTER = { id: modelBlockId('footer'), kind: 'model', section: 'footer' } as const;
const NOTE: FreeBlock = { id: 'note', kind: 'paragraph', text: { fr: 'Fermé le 1er mai' } };
const DOCUMENT: MailDocument = {
  template: 'customer.order-placed',
  blocks: [TITLE, NOTE, FOOTER],
};

describe('les gestes du canevas', () => {
  it('déplace un bloc sans toucher au document d’origine', () => {
    const moved = moveBlock(DOCUMENT, 0, 2);
    expect(moved.blocks.map((block) => block.id)).toEqual(['note', 'model:footer', 'model:title']);
    expect(DOCUMENT.blocks.map((block) => block.id)).toEqual([
      'model:title',
      'note',
      'model:footer',
    ]);
  });

  it('rend le même document pour un déplacement hors bornes', () => {
    expect(moveBlockBy(DOCUMENT, 'model:title', -1)).toBe(DOCUMENT);
    expect(moveBlockBy(DOCUMENT, 'model:footer', 1)).toBe(DOCUMENT);
    expect(moveBlockBy(DOCUMENT, 'inconnu', 1)).toBe(DOCUMENT);
  });

  it('monte et descend d’un cran', () => {
    expect(moveBlockBy(DOCUMENT, 'note', -1).blocks[0]?.id).toBe('note');
    expect(moveBlockBy(DOCUMENT, 'note', 1).blocks[2]?.id).toBe('note');
  });

  it('ne retire jamais un bloc du modèle', () => {
    expect(removeBlock(DOCUMENT, 'model:title')).toBe(DOCUMENT);
  });

  it('retire un bloc libre, du fil comme d’une cellule', () => {
    expect(removeBlock(DOCUMENT, 'note').blocks).toEqual([TITLE, FOOTER]);
    const withColumns = appendToCell(
      appendBlock(DOCUMENT, newLibraryBlock('columns-2', 'cols')),
      'cols',
      1,
      NOTE,
    );
    const cleared = removeBlock(withColumns, 'note');
    expect(findEditableBlock(cleared, 'cols')).toEqual({
      id: 'cols',
      kind: 'columns',
      widths: [50, 50],
      cells: [[], []],
    });
  });

  it('crée des blocs vides, sans texte ni adresse inventés', () => {
    expect(newLibraryBlock('button', 'b')).toEqual({
      id: 'b',
      kind: 'button',
      label: {},
      href: '',
    });
    expect(newLibraryBlock('callout-warning', 'c')).toEqual({
      id: 'c',
      kind: 'callout',
      tone: 'warning',
      text: {},
    });
    expect(newLibraryBlock('columns-3', 'k')).toMatchObject({ widths: [33, 33, 33] });
    expect(newCellBlock('columns-2', 'x')).toBeNull();
  });

  it('écrit un texte dans une langue sans effacer les autres', () => {
    const written = withText(NOTE, 'en', 'Closed on May 1st');
    expect(textOf(written, 'fr')).toBe('Fermé le 1er mai');
    expect(textOf(written, 'en')).toBe('Closed on May 1st');
    expect(textOf(NOTE, 'en')).toBe('');
    const button = withText(newLibraryBlock('button', 'b') as FreeBlock, 'fr', 'Voir');
    expect(button).toMatchObject({ label: { fr: 'Voir' } });
  });

  it('remplace un bloc libre jusque dans une cellule', () => {
    const withColumns = appendToCell(
      appendBlock(DOCUMENT, newLibraryBlock('columns-2', 'cols')),
      'cols',
      0,
      NOTE,
    );
    const next = replaceFreeBlock(withColumns, withText(NOTE, 'fr', 'Ouvert'));
    expect(findEditableBlock(next, 'note')).toMatchObject({ text: { fr: 'Ouvert' } });
    expect(findEditableBlock(withColumns, 'note')).toBe(NOTE);
  });

  it('change une largeur sans juger la somme', () => {
    const next = setColumnWidth(
      appendBlock(DOCUMENT, newLibraryBlock('columns-2', 'cols')),
      'cols',
      0,
      75,
    );
    expect(findEditableBlock(next, 'cols')).toMatchObject({ widths: [75, 50] });
  });

  it('ne rend pas un bloc du modèle comme bloc à régler', () => {
    expect(findEditableBlock(DOCUMENT, 'model:title')).toBeNull();
  });
});
