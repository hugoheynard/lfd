import type { CatalogAdminItemView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { catalogOf, searchProducts, shelfLabelIn, vanishedShelves } from '../storefront-catalog';

function item(overrides: Partial<CatalogAdminItemView>): CatalogAdminItemView {
  return {
    sku: 'X',
    productSku: 'X',
    name: 'Article',
    categoryId: 'bread',
    categoryName: 'Pains',
    pimPriceMillicents: 100_000,
    b2bPriceMillicents: null,
    effectivePriceMillicents: 100_000,
    publicTtcCents: null,
    publicVatRatePercent: null,
    decidedPublicTtcCents: null,
    vatRatePercent: 5.5,
    allergens: null,
    allergensIncomplete: false,
    isHidden: false,
    isHiddenPublic: false,
    isFeatured: false,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    receivedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('le catalogue de l’éditeur', () => {
  it('« Tout » en tête, puis les familles dans l’ordre du catalogue', () => {
    const catalog = catalogOf([
      item({ sku: 'BAG', productSku: 'BAG' }),
      item({ sku: 'CRO', productSku: 'CRO', categoryId: 'vien', categoryName: 'Viennoiseries' }),
      item({ sku: 'PAV', productSku: 'PAV' }),
    ]);
    expect(catalog.shelves).toEqual([
      { key: 'all', label: 'Tout' },
      { key: 'bread', label: 'Pains' },
      { key: 'vien', label: 'Viennoiseries' },
    ]);
  });

  it('désigne le SKU du PRODUIT, une fois par produit', () => {
    const catalog = catalogOf([
      item({ sku: 'BAG-250', productSku: 'BAG', name: 'Baguette' }),
      item({ sku: 'BAG-400', productSku: 'BAG', name: 'Baguette 400 g' }),
    ]);
    expect(catalog.products).toEqual([{ sku: 'BAG', name: 'Baguette', shelf: 'bread' }]);
  });

  it('un article masqué des DEUX boutiques n’est plus en vente, et sa famille seule disparaît', () => {
    const catalog = catalogOf([
      item({
        sku: 'OLD',
        productSku: 'OLD',
        categoryId: 'old',
        isHidden: true,
        isHiddenPublic: true,
      }),
      item({ sku: 'PRO', productSku: 'PRO', isHidden: false, isHiddenPublic: true }),
    ]);
    expect(catalog.products.map((p) => p.sku)).toEqual(['PRO']);
    expect(catalog.shelves.map((s) => s.key)).toEqual(['all', 'bread']);
  });

  it('les rayons disparus : visés mais plus servis, sans doublon', () => {
    const shelves = catalogOf([item({})]).shelves;
    expect(vanishedShelves(['all', 'gone', 'bread', 'gone'], shelves)).toEqual(['gone']);
    expect(shelfLabelIn(shelves, 'gone')).toBe('gone');
  });

  it('cherche par nom ou par SKU, sans casse ni accents', () => {
    const { products } = catalogOf([
      item({ sku: 'ECL', productSku: 'ECL', name: 'Éclair café' }),
      item({ sku: 'BAG', productSku: 'BAG', name: 'Baguette' }),
    ]);
    expect(searchProducts(products, 'eclair').map((p) => p.sku)).toEqual(['ECL']);
    expect(searchProducts(products, 'bag').map((p) => p.sku)).toEqual(['BAG']);
    expect(searchProducts(products, '  ')).toHaveLength(2);
  });
});
