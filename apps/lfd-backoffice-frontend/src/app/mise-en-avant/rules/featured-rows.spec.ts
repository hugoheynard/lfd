import type { CatalogAdminItemView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { familiesOf, featuredCount, featuredRows, filterRows } from './featured-rows';

function item(over: Partial<CatalogAdminItemView> = {}): CatalogAdminItemView {
  return {
    sku: 'VIE-001-1',
    productSku: 'VIE-001',
    name: 'Croissant',
    categoryId: 'cat_vien',
    categoryName: 'Viennoiseries',
    pimPriceMillicents: 170_616,
    vatRatePercent: 5.5,
    publicTtcCents: 225,
    publicVatRatePercent: 5.5,
    allergens: [],
    allergensIncomplete: false,
    isHidden: false,
    isHiddenPublic: false,
    publicReviewPending: false,
    proReviewPending: false,
    audience: null,
    isFeaturedPro: false,
    isFeaturedPublic: false,
    operationOnly: false,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    receivedAt: '2026-09-01T08:00:00.000Z',
    ...over,
  };
}

describe('featuredRows — une case par audience', () => {
  it('ouvre les deux cases d’un article vendu à tous', () => {
    const [row] = featuredRows([item({ isFeaturedPro: true })]);
    expect(row?.pro).toEqual({ state: 'open', featured: true, reason: null });
    expect(row?.public).toEqual({ state: 'open', featured: false, reason: null });
  });

  it('ferme la case d’une audience que le référentiel ne sert pas, et le dit', () => {
    const [row] = featuredRows([item({ audience: 'pro' })]);
    expect(row?.public.state).toBe('not_served');
    expect(row?.public.reason).toContain('Non vendu au public');
    expect(row?.pro.state).toBe('open');
  });

  it('ferme la case d’une audience où l’article est masqué, et renvoie au catalogue publié', () => {
    const [row] = featuredRows([item({ isHidden: true })]);
    expect(row?.pro.state).toBe('masked');
    expect(row?.pro.reason).toContain('Catalogue publié');
    expect(row?.public.state).toBe('open');
  });
});

describe('filterRows et familiesOf', () => {
  const rows = featuredRows([
    item(),
    item({
      sku: 'PAI-001-1',
      name: 'Éclair café',
      categoryId: 'cat_pat',
      categoryName: 'Pâtisserie',
    }),
  ]);

  it('cherche sans accents, par nom ou SKU', () => {
    expect(filterRows(rows, 'eclair', null).map((row) => row.sku)).toEqual(['PAI-001-1']);
    expect(filterRows(rows, 'vie-001', null).map((row) => row.sku)).toEqual(['VIE-001-1']);
  });

  it('filtre par famille', () => {
    expect(filterRows(rows, '', 'cat_pat').map((row) => row.sku)).toEqual(['PAI-001-1']);
  });

  it('liste chaque famille une fois, dans l’ordre du catalogue', () => {
    expect(familiesOf([...rows, ...rows])).toEqual([
      { id: 'cat_vien', name: 'Viennoiseries' },
      { id: 'cat_pat', name: 'Pâtisserie' },
    ]);
  });

  it('compte les mises en avant par audience', () => {
    const counted = featuredRows([
      item({ isFeaturedPublic: true }),
      item({ isFeaturedPublic: true }),
    ]);
    expect(featuredCount(counted, 'public')).toBe(2);
    expect(featuredCount(counted, 'pro')).toBe(0);
  });
});
