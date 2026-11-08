import { modelBlockId, type MailDocument, type FreeBlock } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import {
  appendBlock,
  appendToCell,
  findEditableBlock,
  insertBlockAfter,
  insertBlockAt,
  libraryItemKeyOf,
  moveBlock,
  moveBlockBy,
  newCellBlock,
  newLibraryBlock,
  removeBlock,
  replaceFreeBlock,
  setColumnWidth,
  setColumnWidths,
  textOf,
  withDecorative,
  withImageFocal,
  withImageFormat,
  withImageWidth,
  isInColumn,
  withImageHref,
  withImageSource,
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

  it('pose deux largeurs d’un seul geste, et refuse un compte qui ne suit pas les colonnes', () => {
    const start = appendBlock(DOCUMENT, newLibraryBlock('columns-2', 'cols'));
    expect(findEditableBlock(setColumnWidths(start, 'cols', [58, 42]), 'cols')).toMatchObject({
      widths: [58, 42],
    });
    expect(setColumnWidths(start, 'cols', [33, 33, 33])).toBe(start);
    expect(setColumnWidths(start, 'inconnu', [58, 42])).toBe(start);
  });

  it('ne rend pas un bloc du modèle comme bloc à régler', () => {
    expect(findEditableBlock(DOCUMENT, 'model:title')).toBeNull();
  });

  describe('le bloc image (§ 19)', () => {
    const IMAGE = {
      id: 'i',
      kind: 'image',
      src: 'https://m.fr/a.webp',
      alt: { fr: 'Une brioche' },
    } as const;

    it('pose la pleine largeur, et retire le champ en revenant dans le texte', () => {
      const wide = withImageWidth(IMAGE, 'full');
      expect(wide).toEqual({ ...IMAGE, width: 'full' });
      expect('width' in withImageWidth(wide, 'content')).toBe(false);
    });

    it('sait si un bloc est rangé dans une colonne', () => {
      const inner = { ...IMAGE, id: 'in' };
      const document: MailDocument = {
        template: 't',
        blocks: [IMAGE, { id: 'k', kind: 'columns', widths: [50, 50], cells: [[inner], []] }],
      };
      expect(isInColumn(document, 'in')).toBe(true);
      expect(isInColumn(document, 'i')).toBe(false);
    });

    it('naît sans image ni texte, et entre dans une colonne', () => {
      expect(newLibraryBlock('image', 'i')).toEqual({ id: 'i', kind: 'image', src: '', alt: {} });
      expect(newCellBlock('image', 'i')).toEqual({ id: 'i', kind: 'image', src: '', alt: {} });
    });

    it('son texte est le texte de remplacement, par langue', () => {
      expect(textOf(IMAGE, 'fr')).toBe('Une brioche');
      expect(withText(IMAGE, 'en', 'A brioche')).toEqual({
        ...IMAGE,
        alt: { fr: 'Une brioche', en: 'A brioche' },
      });
    });

    it('décorative, elle perd son lien ; les champs retirés sont absents', () => {
      const linked = { ...IMAGE, href: 'https://lafoliedouce.fr' };
      const decorative = withDecorative(linked, true);
      expect(decorative).toEqual({ ...IMAGE, decorative: true });
      expect('href' in decorative).toBe(false);
      const back = withDecorative(decorative, false);
      expect(back).toEqual(IMAGE);
      expect('decorative' in back).toBe(false);
    });

    it('un lien vidé disparaît', () => {
      const linked = withImageHref(IMAGE, 'https://lafoliedouce.fr');
      expect(linked.href).toBe('https://lafoliedouce.fr');
      expect('href' in withImageHref(linked, '')).toBe(false);
    });

    it('choisit un format ; « originale » retire le champ et garde le point focal', () => {
      const framed = withImageFormat({ ...IMAGE, focal: { x: 0.2, y: 0.8 } }, '2:1');
      expect(framed).toEqual({ ...IMAGE, format: '2:1', focal: { x: 0.2, y: 0.8 } });
      const original = withImageFormat(framed, 'original');
      expect('format' in original).toBe(false);
      expect(original.focal).toEqual({ x: 0.2, y: 0.8 });
    });

    it('pose le point focal au centième, et le retire sans laisser `undefined`', () => {
      expect(withImageFocal(IMAGE, { x: 0.3333, y: 0.666 }).focal).toEqual({ x: 0.33, y: 0.67 });
      const cleared = withImageFocal({ ...IMAGE, focal: { x: 0.1, y: 0.1 } }, null);
      expect('focal' in cleared).toBe(false);
    });

    it('une autre image prend le point de la médiathèque, ou le centre', () => {
      const framed = { ...IMAGE, format: '1:1', focal: { x: 0.1, y: 0.1 } } as const;
      expect(withImageSource(framed, 'https://m.fr/b.webp', { x: 0.4, y: 0.6 })).toEqual({
        ...IMAGE,
        src: 'https://m.fr/b.webp',
        format: '1:1',
        focal: { x: 0.4, y: 0.6 },
      });
      expect('focal' in withImageSource(framed, 'https://m.fr/b.webp', null)).toBe(false);
    });
  });

  it('insère un bloc déposé à son index, ramené aux bornes du fil', () => {
    const added: FreeBlock = { id: 'neuf', kind: 'divider' };
    expect(insertBlockAt(DOCUMENT, 1, added).blocks.map((b) => b.id)).toEqual([
      'model:title',
      'neuf',
      'note',
      'model:footer',
    ]);
    expect(insertBlockAt(DOCUMENT, 0, added).blocks[0]?.id).toBe('neuf');
    expect(insertBlockAt(DOCUMENT, 99, added).blocks.at(-1)?.id).toBe('neuf');
    expect(insertBlockAt(DOCUMENT, -3, added).blocks[0]?.id).toBe('neuf');
    expect(DOCUMENT.blocks.map((b) => b.id)).not.toContain('neuf');
  });

  it('reconnaît une clé de bibliothèque dans une donnée de glisser, et rien d’autre', () => {
    expect(libraryItemKeyOf('columns-2')).toBe('columns-2');
    expect(libraryItemKeyOf('model:title')).toBeNull();
    expect(libraryItemKeyOf(undefined)).toBeNull();
  });

  it('ajoute sous le bloc sélectionné, sous sa mise en page s’il est en colonne, sinon à la fin', () => {
    const added: FreeBlock = { id: 'neuf', kind: 'divider' };
    expect(insertBlockAfter(DOCUMENT, 'model:title', added).blocks.map((b) => b.id)).toEqual([
      'model:title',
      'neuf',
      'note',
      'model:footer',
    ]);
    expect(insertBlockAfter(DOCUMENT, null, added).blocks.at(-1)?.id).toBe('neuf');
    expect(insertBlockAfter(DOCUMENT, 'parti', added).blocks.at(-1)?.id).toBe('neuf');
    const withColumns: MailDocument = {
      ...DOCUMENT,
      blocks: [
        TITLE,
        { id: 'cols', kind: 'columns', widths: [50, 50], cells: [[NOTE], []] },
        FOOTER,
      ],
    };
    expect(insertBlockAfter(withColumns, 'note', added).blocks.map((b) => b.id)).toEqual([
      'model:title',
      'cols',
      'neuf',
      'model:footer',
    ]);
  });
});
