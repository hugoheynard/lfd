import { describe, expect, it } from 'vitest';

import { categoryMix, planRatios, shareAt, type MixArticle } from '../mercuriale-mix';

const basis = { catalogCents: 100, floorCents: null };

function article(overrides: Partial<MixArticle>): MixArticle {
  return {
    categoryId: 'pains',
    categoryName: 'Pains',
    sku: 'baguette',
    basis,
    tiers: [{ minQuantity: 1, unitPriceCents: 90 }],
    plannedVolume: 1_000,
    ...overrides,
  };
}

describe('planRatios', () => {
  it('pose le plan tenu exactement, et va au-delà', () => {
    const ratios = planRatios();
    expect(ratios).toContain(1);
    expect(ratios.at(-1)).toBeGreaterThan(1);
  });
});

describe('categoryMix', () => {
  it('groupe par rayon et somme les articles', () => {
    const mix = categoryMix(
      [
        article({ sku: 'a' }),
        article({ sku: 'b' }),
        article({ sku: 'c', categoryId: 'viennoiseries', categoryName: 'Viennoiseries' }),
      ],
      [1],
    );
    expect(mix.categories).toHaveLength(2);
    expect(mix.plannedArticles).toBe(3);
    expect(mix.categories[0]?.revenueByRatio[0]).toBe(2 * 90 * 1_000);
  });

  it("écarte les articles sans volume prévu plutôt que d'en inventer un", () => {
    const mix = categoryMix([article({ sku: 'a' }), article({ sku: 'b', plannedVolume: 0 })], [1]);
    expect(mix.plannedArticles).toBe(1);
  });

  it('compte un article non tarifé au tarif catalogue', () => {
    const mix = categoryMix([article({ tiers: [] })], [1]);
    expect(mix.categories[0]?.revenueByRatio[0]).toBe(100 * 1_000);
  });

  it('ne voit un palier que sur une vraie grille à plusieurs paliers', () => {
    expect(categoryMix([article({})], [1]).hasTier).toBe(false);
    const laddered = article({
      tiers: [
        { minQuantity: 1, unitPriceCents: 90 },
        { minQuantity: 500, unitPriceCents: 80 },
      ],
    });
    expect(categoryMix([laddered], [1]).hasTier).toBe(true);
  });

  it('sans palier, la PART de chaque rayon ne bouge pas avec le plan', () => {
    const mix = categoryMix(
      [article({ sku: 'a' }), article({ sku: 'b', categoryId: 'v', categoryName: 'V' })],
      [0.5, 1],
    );
    const shareOf = (index: number): number => {
      const rows = shareAt(mix, index);
      const total = rows.reduce((sum, row) => sum + row.cents, 0);
      return Math.round(((rows[0]?.cents ?? 0) / total) * 1_000);
    };
    // C'est exactement ce qui justifie le camembert dans ce cas-là.
    expect(shareOf(0)).toBe(shareOf(1));
  });

  it('avec un palier, la part du rayon qui en porte un DESCEND quand le plan grossit', () => {
    const laddered = article({
      sku: 'a',
      tiers: [
        { minQuantity: 1, unitPriceCents: 90 },
        { minQuantity: 600, unitPriceCents: 40 },
      ],
    });
    const flat = article({ sku: 'b', categoryId: 'v', categoryName: 'V' });
    const mix = categoryMix([laddered, flat], [0.5, 1]);
    const shareOf = (index: number): number => {
      const rows = shareAt(mix, index);
      const total = rows.reduce((sum, row) => sum + row.cents, 0);
      return (rows[0]?.cents ?? 0) / total;
    };
    expect(shareOf(1)).toBeLessThan(shareOf(0));
  });

  it('donne le chiffre du plan tenu, et zéro si le plan n’est pas tracé', () => {
    expect(categoryMix([article({})], [1]).plannedCents).toBe(90 * 1_000);
    expect(categoryMix([article({})], [0.5]).plannedCents).toBe(0);
  });
});

describe('categoryMix · ce qui est lâché', () => {
  it('compte les euros concédés face au catalogue', () => {
    // 1 000 unités à 0,90 € contre 1,00 € au catalogue : 100 € lâchés.
    const mix = categoryMix([article({})], [1]);
    expect(mix.categories[0]?.catalogueByRatio[0]).toBe(100 * 1_000);
    expect(mix.categories[0]?.concededByRatio[0]).toBe(10 * 1_000);
    expect(mix.concededCents).toBe(10 * 1_000);
  });

  it('ne concède rien sur un article non tarifé', () => {
    const mix = categoryMix([article({ tiers: [] })], [1]);
    expect(mix.categories[0]?.concededByRatio[0]).toBe(0);
  });

  it('rend une concession NÉGATIVE au-dessus du catalogue, sans la masquer', () => {
    const above = article({ tiers: [{ minQuantity: 1, unitPriceCents: 130 }] });
    // La nier ici la ferait disparaître du total ; c'est l'anneau qui l'écarte.
    expect(categoryMix([above], [1]).concededCents).toBeLessThan(0);
  });

  it('la part de la remise ne suit PAS la part du chiffre', () => {
    // Le cas qui justifie les deux anneaux : un petit rayon très remisé.
    const big = article({ sku: 'a', tiers: [{ minQuantity: 1, unitPriceCents: 99 }] });
    const small = article({
      sku: 'b',
      categoryId: 'v',
      categoryName: 'V',
      plannedVolume: 100,
      tiers: [{ minQuantity: 1, unitPriceCents: 40 }],
    });
    const mix = categoryMix([big, small], [1]);
    const revenueShare = (mix.categories[1]?.revenueByRatio[0] ?? 0) / mix.plannedCents;
    const concededShare = (mix.categories[1]?.concededByRatio[0] ?? 0) / mix.concededCents;
    expect(concededShare).toBeGreaterThan(revenueShare);
  });
});
