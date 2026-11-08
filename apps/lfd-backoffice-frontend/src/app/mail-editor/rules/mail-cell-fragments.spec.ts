import type { ColumnsBlock } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import { cellFragments } from './mail-cell-fragments';

const COLS: ColumnsBlock = {
  id: 'cols',
  kind: 'columns',
  widths: [50, 50],
  cells: [
    [
      { id: 'h', kind: 'heading', text: { fr: 'Titre' } },
      { id: 'img', kind: 'image', src: 'https://m.fr/a.webp', alt: {} },
      { id: 'p', kind: 'paragraph', text: {} },
    ],
    [{ id: 'd', kind: 'divider' }],
  ],
};

const HTML =
  '<table><tr>' +
  '<td><h2><span data-free-block="h">Titre</span></h2><table data-img="1"><tr><td>img</td></tr></table></td>' +
  '<td><hr data-rule="1" /></td>' +
  '</tr></table>';

describe('cellFragments — le rendu de chaque bloc de colonne, retrouvé', () => {
  it('par sa marque pour un texte, dans l’ordre des restes pour une image ou un trait', () => {
    const fragments = cellFragments(HTML, COLS);
    expect(fragments.get('h')).toContain('data-free-block="h"');
    expect(fragments.get('img')).toContain('data-img');
    expect(fragments.get('d')).toContain('data-rule');
  });

  it('un texte sans rendu a un fragment vide (le canevas garde sa zone d’écriture)', () => {
    expect(cellFragments(HTML, COLS).get('p')).toBe('');
  });

  it('sans pouvoir apparier les restes, ne devine pas', () => {
    const fragments = cellFragments('<table><tr><td></td><td></td></tr></table>', COLS);
    expect(fragments.has('img')).toBe(false);
    expect(fragments.has('d')).toBe(false);
    expect(cellFragments('<p>rien</p>', COLS).size).toBe(0);
  });
});
