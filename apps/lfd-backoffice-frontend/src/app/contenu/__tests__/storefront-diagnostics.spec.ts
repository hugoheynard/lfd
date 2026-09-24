import type { StorefrontContent } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { EditorBlock } from '../storefront-block';
import type { StorefrontCatalog } from '../storefront-catalog';
import { contentIssuesOf, returnedIdsOf, shelfOptionsOf } from '../storefront-diagnostics';

const CATALOG: StorefrontCatalog = {
  shelves: [{ key: 'all', label: 'Tout' }],
  products: [{ sku: 'CRO', name: 'Croissant', shelf: 'vien' }],
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
});
