import type { StorefrontCatalogView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { catalogOf, searchProducts, shelfLabelIn, vanishedShelves } from '../storefront-catalog';

type Item = StorefrontCatalogView['items'][number];

function item(overrides: Partial<Item>): Item {
  return { sku: 'X', name: 'Article', shelfKey: 'bread', served: true, ...overrides };
}

const BREAD = { key: 'bread', name: 'Pains' };

describe('le catalogue de l’éditeur', () => {
  it('« Tout » en tête, puis les familles dans l’ordre où le serveur les rend', () => {
    const catalog = catalogOf({
      shelves: [BREAD, { key: 'vien', name: 'Viennoiseries' }],
      items: [],
    });
    expect(catalog.shelves).toEqual([
      { key: 'all', label: 'Tout' },
      { key: 'bread', label: 'Pains' },
      { key: 'vien', label: 'Viennoiseries' },
    ]);
  });

  it('désigne l’article par le SKU que le serveur rend, dans son rayon', () => {
    const catalog = catalogOf({
      shelves: [BREAD],
      items: [item({ sku: 'BAG', name: 'Baguette' })],
    });
    expect(catalog.products).toEqual([{ sku: 'BAG', name: 'Baguette', shelf: 'bread' }]);
  });

  it('un article que le serveur dit non servi n’est pas proposé', () => {
    const catalog = catalogOf({
      shelves: [BREAD],
      items: [item({ sku: 'OLD', served: false }), item({ sku: 'PRO' })],
    });
    expect(catalog.products.map((p) => p.sku)).toEqual(['PRO']);
  });

  it('les rayons disparus : visés mais plus servis, sans doublon', () => {
    const shelves = catalogOf({ shelves: [BREAD], items: [item({})] }).shelves;
    expect(vanishedShelves(['all', 'gone', 'bread', 'gone'], shelves)).toEqual(['gone']);
    expect(shelfLabelIn(shelves, 'gone')).toBe('gone');
  });

  it('cherche par nom ou par SKU, sans casse ni accents', () => {
    const { products } = catalogOf({
      shelves: [BREAD],
      items: [item({ sku: 'ECL', name: 'Éclair café' }), item({ sku: 'BAG', name: 'Baguette' })],
    });
    expect(searchProducts(products, 'eclair').map((p) => p.sku)).toEqual(['ECL']);
    expect(searchProducts(products, 'bag').map((p) => p.sku)).toEqual(['BAG']);
    expect(searchProducts(products, '  ')).toHaveLength(2);
  });
});
