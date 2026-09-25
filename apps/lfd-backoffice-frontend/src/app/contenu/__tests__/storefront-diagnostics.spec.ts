import type { StorefrontContent } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { EditorBlock } from '../storefront-block';
import type { StorefrontCatalog } from '../storefront-catalog';
import { contentIssuesOf, returnedIdsOf, shelfOptionsOf } from '../storefront-diagnostics';

const CATALOG: StorefrontCatalog = {
  shelves: [{ key: 'all', label: 'Tout' }],
  products: [{ sku: 'CRO', name: 'Croissant', shelf: 'vien' }],
  operations: [
    {
      key: 'noel-2026',
      name: { fr: 'Noël' },
      lede: null,
      image: null,
      state: 'open',
      announceFrom: '2026-10-31T23:00:00.000Z',
      orderFrom: '2026-11-14T23:00:00.000Z',
      orderUntil: '2026-12-21T11:00:00.000Z',
      pickupFrom: '2026-12-20',
      pickupUntil: '2026-12-24',
    },
    {
      key: 'galette-2025',
      name: { fr: 'Galette' },
      lede: null,
      image: null,
      state: 'ended',
      announceFrom: '2024-12-20T23:00:00.000Z',
      orderFrom: '2024-12-20T23:00:00.000Z',
      orderUntil: '2025-01-30T11:00:00.000Z',
      pickupFrom: '2025-01-02',
      pickupUntil: '2025-01-31',
    },
  ],
};

function block(id: string, items: readonly StorefrontContent[]): EditorBlock {
  return { id, format: 'tile', column: 1, row: 1, shelves: ['all'], contents: 'multiple', items };
}

const untitled = {
  kind: 'info',
  badge: null,
  title: { fr: '' },
  lede: null,
  image: null,
  linkShelfKey: null,
} as const;
const titled = { ...untitled, title: { fr: 'Noël' } } as const;

describe('storefront-diagnostics', () => {
  it('sans catalogue, propose les rayons visés, « Tout » en tête', () => {
    expect(shelfOptionsOf(null, ['vien']).map((o) => o.key)).toEqual(['all', 'vien']);
    expect(shelfOptionsOf(CATALOG, ['vien'])).toBe(CATALOG.shelves);
  });

  it('nomme le contenu à compléter par son objet et sa place', () => {
    const [issue] = contentIssuesOf([block('b', [titled, untitled])], () => 'Tout');
    expect(issue).toContain('(Tout, colonne 1, rangée 1), contenu 2 :');
  });

  it('rend au rayon l’objet vide, l’article retiré et l’info sans titre — pas l’info sans image', () => {
    const blocks = [
      block('vide', []),
      block('retire', [{ kind: 'product', sku: 'OLD' }]),
      block('sans-titre', [untitled]),
      block('info', [titled]),
      block('article', [{ kind: 'product', sku: 'CRO' }]),
    ];
    expect([...returnedIdsOf(blocks, CATALOG)].sort()).toEqual(['retire', 'sans-titre', 'vide']);
  });

  it('sans catalogue, ne déclare aucun article retiré', () => {
    expect(returnedIdsOf([block('retire', [{ kind: 'product', sku: 'OLD' }])], null).size).toBe(0);
  });

  /** D11 : l'annonce d'une opération que la boutique ne montre pas n'occupe pas ses cases. */
  it('rend au rayon l’objet dont l’annonce vise une opération terminée ou inconnue', () => {
    const linked = (operationKey: string) => ({
      ...untitled,
      operationKey,
      action: 'operation' as const,
    });
    const blocks = [
      block('ouverte', [linked('noel-2026')]),
      block('terminee', [linked('galette-2025')]),
      block('inconnue', [linked('paques-2027')]),
      block('mixte', [linked('galette-2025'), { kind: 'product', sku: 'CRO' }]),
    ];
    expect([...returnedIdsOf(blocks, CATALOG)].sort()).toEqual(['inconnue', 'terminee']);
    expect(returnedIdsOf(blocks, null).size).toBe(0);
  });
});
