import type { AdminOrderShortfall } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { abandonedOfShortfall, abandonedSentence } from './shortfall-remainder';

const NAMES = new Map([
  ['CRO', 'Croissant'],
  ['PAI', 'Baguette'],
]);

function shortfall(decided: boolean): AdminOrderShortfall {
  return {
    reportedAt: '2030-01-01T05:00:00.000Z',
    lines: [
      { sku: 'CRO', due: 3, packed: 1, saleUnit: 'piece' },
      { sku: 'PAI', due: 2, packed: 2, saleUnit: 'piece' },
      { sku: 'XYZ', due: 1, packed: 0, saleUnit: 'piece' },
    ],
    decision: decided
      ? { decidedAt: '2030-01-01T06:00:00.000Z', remainder: 'abandoned', customerNotice: null }
      : null,
  };
}

describe('abandonedOfShortfall', () => {
  it('ne dit rien tant que le départ n’est pas décidé', () => {
    expect(abandonedOfShortfall(shortfall(false), NAMES)).toEqual([]);
    expect(abandonedOfShortfall(null, NAMES)).toEqual([]);
  });

  it('rend le dû moins ce qui est parti, sur les seules lignes incomplètes', () => {
    expect(abandonedOfShortfall(shortfall(true), NAMES)).toEqual([
      { sku: 'CRO', productName: 'Croissant', quantity: 2, saleUnit: 'piece' },
      // Un article que la commande ne nomme pas garde son SKU.
      { sku: 'XYZ', productName: 'XYZ', quantity: 1, saleUnit: 'piece' },
    ]);
  });
});

describe('abandonedSentence', () => {
  it('dit la quantité puis le produit', () => {
    expect(
      abandonedSentence({ sku: 'CRO', productName: 'Croissant', quantity: 2, saleUnit: 'piece' }),
    ).toBe('Reste abandonné : 2 Croissant');
  });
});

/** P6 de `vente-au-poids.md` : le reste d'un lot au poids se dit en grammes. */
describe('le reste abandonné, au poids', () => {
  it('dit « 250 g », jamais « 250 »', () => {
    expect(
      abandonedSentence({
        sku: 'SAU',
        productName: 'Saumon gravlax',
        quantity: 250,
        saleUnit: 'weight',
      }),
    ).toBe('Reste abandonné : 250 g Saumon gravlax');
  });

  it('recopie l’unité du manque décidé', () => {
    expect(
      abandonedOfShortfall(
        {
          reportedAt: '2026-09-25T06:00:00.000Z',
          lines: [{ sku: 'SAU', due: 1250, packed: 1000, saleUnit: 'weight' }],
          decision: {
            decidedAt: '2026-09-25T07:00:00.000Z',
            remainder: 'abandoned',
            customerNotice: null,
          },
        },
        new Map([['SAU', 'Saumon gravlax']]),
      ),
    ).toEqual([{ sku: 'SAU', productName: 'Saumon gravlax', quantity: 250, saleUnit: 'weight' }]);
  });
});
