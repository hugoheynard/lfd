import { describe, expect, it } from 'vitest';
import type { PriceTemplateLineView } from '@lfd/contracts';

import {
  averageGapBp,
  entryPriceCents,
  gapToCatalogBp,
  isFlatPrice,
  ruleCount,
} from '../template-grid';

const line = (over: Partial<PriceTemplateLineView>): PriceTemplateLineView => ({
  sku: 'PAI-001',
  productName: 'Baguette',
  catalogPriceCents: 100,
  tiers: [{ minQuantity: 1, unitPriceCents: 80 }],
  ...over,
});

describe('isFlatPrice', () => {
  /** Le point du modèle : un prix fixe EST la grille à un palier, à partir de 1. */
  it('reconnaît le prix fixe dans la grille à un palier depuis 1', () => {
    expect(isFlatPrice([{ minQuantity: 1, unitPriceCents: 80 }])).toBe(true);
  });

  it("n'est pas un prix fixe dès qu'il y a deux paliers", () => {
    expect(
      isFlatPrice([
        { minQuantity: 1, unitPriceCents: 85 },
        { minQuantity: 10_000, unitPriceCents: 78 },
      ]),
    ).toBe(false);
  });

  /** Un palier unique posé à 500 n'est pas un prix fixe : en dessous, rien ne s'applique. */
  it("n'est pas un prix fixe si le palier unique ne part pas de 1", () => {
    expect(isFlatPrice([{ minQuantity: 500, unitPriceCents: 80 }])).toBe(false);
  });
});

describe('gapToCatalogBp', () => {
  it('rend une baisse positive et une hausse négative', () => {
    expect(gapToCatalogBp(100, 80)).toBe(2000);
    expect(gapToCatalogBp(100, 120)).toBe(-2000);
  });

  it("ne rend rien sans tarif catalogue — une absence n'est pas une remise", () => {
    expect(gapToCatalogBp(null, 80)).toBeNull();
    expect(gapToCatalogBp(0, 80)).toBeNull();
  });
});

describe('entryPriceCents', () => {
  /** Le prix d'ENTRÉE, pas le plus flatteur : c'est celui qu'un petit client paie. */
  it('prend le prix du plus petit palier', () => {
    expect(
      entryPriceCents([
        { minQuantity: 1, unitPriceCents: 85 },
        { minQuantity: 10_000, unitPriceCents: 78 },
      ]),
    ).toBe(85);
  });
});

describe('averageGapBp', () => {
  it('moyenne les écarts des lignes qui en ont un', () => {
    expect(
      averageGapBp([
        line({}),
        line({ sku: 'PAI-002', tiers: [{ minQuantity: 1, unitPriceCents: 60 }] }),
      ]),
    ).toBe(3000);
  });

  it('ignore les lignes sans tarif catalogue plutôt que de les compter à zéro', () => {
    expect(averageGapBp([line({}), line({ sku: 'X', catalogPriceCents: null })])).toBe(2000);
  });

  it('ne rend rien quand aucune ligne ne se compare', () => {
    expect(averageGapBp([line({ catalogPriceCents: null })])).toBeNull();
  });
});

describe('ruleCount', () => {
  it('compte un palier par règle, pas une ligne', () => {
    expect(
      ruleCount([
        line({
          tiers: [
            { minQuantity: 1, unitPriceCents: 85 },
            { minQuantity: 10_000, unitPriceCents: 78 },
          ],
        }),
        line({ sku: 'PAI-002' }),
      ]),
    ).toBe(3);
  });
});
