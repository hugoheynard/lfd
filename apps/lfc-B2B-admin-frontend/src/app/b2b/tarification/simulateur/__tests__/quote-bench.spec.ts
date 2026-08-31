import { describe, expect, it } from 'vitest';
import type { OrderQuoteLineView } from '@lfd/contracts';

import { benchRow, probeQuantities, stepDownCents, variationBp } from '../quote-bench';

const tier = (minQuantity: number, unitPriceMillicents: number) => ({
  minQuantity,
  unitPriceMillicents,
  discountBp: 0,
});

describe('probeQuantities', () => {
  it('pose 1, puis chaque seuil ET le cran juste en dessous', () => {
    expect(probeQuantities([tier(10, 180), tier(50, 160)], null)).toEqual([1, 9, 10, 49, 50]);
  });

  it('ajoute la quantité libre à sa place, sans doublon', () => {
    expect(probeQuantities([tier(10, 180)], 10)).toEqual([1, 9, 10]);
    expect(probeQuantities([tier(10, 180)], 200)).toEqual([1, 9, 10, 200]);
  });

  it("sans barème, ne pose que 1 — et la quantité libre s'il y en a une", () => {
    expect(probeQuantities(null, null)).toEqual([1]);
    expect(probeQuantities(null, 40)).toEqual([1, 40]);
  });

  /** Chaque quantité est une requête : un barème bavard ne doit pas en lancer vingt. */
  it('borne le nombre de sondes', () => {
    const tiers = [1, 2, 3, 4, 5, 6].map((step) => tier(step * 10, 100));

    expect(probeQuantities(tiers, null)).toHaveLength(8);
  });

  it('ne dédouble pas un seuil posé à 1', () => {
    expect(probeQuantities([tier(1, 190)], null)).toEqual([1]);
  });
});

describe('variationBp', () => {
  it('rend une baisse positive et une HAUSSE négative', () => {
    expect(variationBp(200, 180)).toBe(1000);
    // Le cas qu'on vient chercher : une règle qui fait MONTER le prix.
    expect(variationBp(200, 220)).toBe(-1000);
  });

  it('ne divise pas par zéro sur un article offert', () => {
    expect(variationBp(0, 0)).toBe(0);
  });
});

const line = (over: Partial<OrderQuoteLineView>): OrderQuoteLineView => ({
  sku: 'VIE-001',
  productName: 'Croissant',
  canonicalMillicents: 200,
  unitPriceMillicents: 200,
  quantity: 1,
  vatRate: 5.5,
  steps: [],
  floored: false,
  sealedByRuleId: null,
  sealedRuleIds: [],
  volumeTiers: null,
  floorMillicents: null,
  ...over,
});

describe('benchRow', () => {
  it('multiplie le prix RÉSOLU, jamais le canonique', () => {
    const row = benchRow(line({ quantity: 10, unitPriceMillicents: 180 }));

    expect(row.totalCents).toBe(1800);
    expect(row.discountBp).toBe(1000);
  });
});

describe('stepDownCents', () => {
  const rows = [
    benchRow(line({ quantity: 1, unitPriceMillicents: 200 })),
    benchRow(line({ quantity: 10, unitPriceMillicents: 180 })),
    benchRow(line({ quantity: 11, unitPriceMillicents: 180 })),
  ];

  it('mesure la marche par rapport à la quantité précédente', () => {
    expect(stepDownCents(rows, 1)).toBe(20);
  });

  it("ne rend rien sur la première ligne — il n'y a pas de marche", () => {
    expect(stepDownCents(rows, 0)).toBeNull();
  });

  it("ne rend rien quand le prix n'a pas bougé", () => {
    expect(stepDownCents(rows, 2)).toBeNull();
  });
});
