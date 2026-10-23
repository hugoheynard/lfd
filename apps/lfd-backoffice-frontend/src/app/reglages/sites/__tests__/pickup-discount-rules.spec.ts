import { describe, expect, it } from 'vitest';

import {
  discountCatalogueOf,
  discountOf,
  draftOf,
  strayRules,
  withFamilies,
  withProducts,
} from '../pickup-discount-rules';
import { entry, publishedCatalog, shelf } from './published-catalog-fixture';

const CATALOGUE = discountCatalogueOf(
  publishedCatalog(
    [shelf('pains', 'Pains'), shelf('anciens', 'Anciens', true)],
    [entry('baguette', 'Baguette', 'pains'), entry('vieux', 'Vieux pain', 'pains', 'archived')],
  ),
);

const BASE = {
  adjustment: { mode: 'percent', bp: 1000 },
  scope: 'all_except',
  categories: [],
  products: [],
} as const;

describe('pickup-discount-rules', () => {
  it('ne propose ni famille retirée, ni fiche archivée', () => {
    expect(CATALOGUE.families.map((f) => f.id)).toEqual(['pains']);
    expect(CATALOGUE.productGroups[0]?.products.map((p) => p.id)).toEqual(['baguette']);
  });

  it('dit orphelines une famille retirée et une fiche archivée, en les nommant', () => {
    const stray = strayRules(
      {
        ...BASE,
        categories: [{ categoryId: 'anciens', eligible: false }],
        products: [{ productId: 'vieux', eligible: false }],
      },
      CATALOGUE,
    );

    expect(stray.map((rule) => rule.message)).toEqual([
      expect.stringContaining('« Anciens »'),
      expect.stringContaining('« Vieux pain »'),
    ]);
  });

  it('signale une règle de famille à contre-sens du mode', () => {
    const stray = strayRules(
      { ...BASE, categories: [{ categoryId: 'pains', eligible: true }] },
      CATALOGUE,
    );

    expect(stray[0]?.message).toContain('contre-sens');
  });

  it('remplacer les familles garde les orphelines', () => {
    const draft = withFamilies(
      { ...BASE, categories: [{ categoryId: 'anciens', eligible: false }] },
      ['pains'],
      CATALOGUE,
    );

    expect(draft.categories).toEqual([
      { categoryId: 'anciens', eligible: false },
      { categoryId: 'pains', eligible: false },
    ]);
  });

  it('un produit ne se règle qu’une fois', () => {
    const excluded = withProducts(BASE, ['baguette'], false, CATALOGUE);
    const reincluded = withProducts(excluded, ['baguette'], true, CATALOGUE);

    expect(reincluded.products).toEqual([{ productId: 'baguette', eligible: true }]);
  });

  it('sans réduction, la clientèle n’a pas de remise', () => {
    expect(
      discountOf({ ...draftOf(null), categories: [{ categoryId: 'x', eligible: false }] }),
    ).toBeNull();
  });
});
