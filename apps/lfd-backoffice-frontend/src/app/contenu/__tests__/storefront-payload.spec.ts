import type { StorefrontView } from '@lfd/contracts';
import { DEFAULT_CAROUSEL } from '@lfd/storefront-layout';
import { describe, expect, it } from 'vitest';

import { dropShelf, EMPTY_STATE, payloadOf, stateOf } from '../storefront-payload';

const VIEW: StorefrontView = {
  revision: 7,
  updatedAt: null,
  pages: [
    { shelfKey: 'all', rows: 4 },
    { shelfKey: 'gone', rows: 3 },
  ],
  objects: [
    {
      id: 'o-1',
      shape: 'tile',
      column: 1,
      row: 1,
      shelves: ['all', 'gone'],
      applyOnMobile: false,
      mediaFit: 'contain',
      mediaSide: 'right',
      multiple: true,
      carousel: { ...DEFAULT_CAROUSEL, autoplay: true },
      tone: 'dark',
      contents: [{ kind: 'product', sku: 'CRO' }],
    },
    {
      id: 'o-2',
      shape: 'card',
      column: 5,
      row: 1,
      shelves: ['gone'],
      applyOnMobile: true,
      mediaFit: 'cover',
      mediaSide: 'top',
      multiple: false,
      carousel: { ...DEFAULT_CAROUSEL },
      tone: 'light',
      contents: [],
    },
  ],
  templates: [
    {
      id: 't-1',
      name: 'Noël',
      description: null,
      shape: 'band',
      applyOnMobile: true,
      mediaFit: 'cover',
      mediaSide: 'left',
      multiple: false,
      carousel: { ...DEFAULT_CAROUSEL },
      tone: 'accent',
    },
  ],
};

describe('le payload de la vitrine', () => {
  it('relit fidèlement ce qu’il a chargé : un aller-retour ne change rien', () => {
    const payload = payloadOf(stateOf(VIEW));
    expect(payload.revision).toBe(7);
    expect(payload.pages).toEqual(VIEW.pages);
    expect(payload.objects).toEqual(VIEW.objects);
    expect(payload.templates).toEqual(VIEW.templates);
  });

  it('un objet ou un gabarit posé par l’éditeur part SANS identifiant', () => {
    const state = stateOf(VIEW);
    const payload = payloadOf({
      ...state,
      blocks: [
        ...state.blocks,
        { id: 'local-1', format: 'card', column: 1, row: 3, shelves: ['all'] },
      ],
      templates: [...state.templates, { id: 'local-2', name: 'Neuf', format: 'card' }],
    });
    expect(payload.objects.at(-1)).not.toHaveProperty('id');
    expect(payload.objects.at(-1)).toMatchObject({
      shape: 'card',
      applyOnMobile: true,
      mediaFit: 'cover',
      mediaSide: 'top',
      multiple: false,
      tone: 'light',
      contents: [],
    });
    expect(payload.templates.at(-1)).not.toHaveProperty('id');
    expect(payload.templates.at(-1)).toMatchObject({ name: 'Neuf', description: null });
  });

  it('un rayon où paraît un objet reçoit une page, aux rangées par défaut', () => {
    const payload = payloadOf({
      ...EMPTY_STATE,
      blocks: [{ id: 'local-1', format: 'card', column: 1, row: 1, shelves: ['bread'] }],
    });
    expect(payload.pages).toEqual([{ shelfKey: 'bread', rows: 6 }]);
  });

  it('vider un rayon disparu : sa page part, et l’objet qui n’y paraissait que là aussi', () => {
    const state = dropShelf(stateOf(VIEW), 'gone');
    expect(state.rows).toEqual({ all: 4 });
    expect(state.blocks.map((b) => [b.id, b.shelves])).toEqual([['o-1', ['all']]]);
  });
});
