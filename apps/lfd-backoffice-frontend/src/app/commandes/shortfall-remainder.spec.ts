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
      { sku: 'CRO', due: 3, packed: 1 },
      { sku: 'PAI', due: 2, packed: 2 },
      { sku: 'XYZ', due: 1, packed: 0 },
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
      { sku: 'CRO', productName: 'Croissant', quantity: 2 },
      // Un article que la commande ne nomme pas garde son SKU.
      { sku: 'XYZ', productName: 'XYZ', quantity: 1 },
    ]);
  });
});

describe('abandonedSentence', () => {
  it('dit la quantité puis le produit', () => {
    expect(abandonedSentence({ sku: 'CRO', productName: 'Croissant', quantity: 2 })).toBe(
      'Reste abandonné : 2 Croissant',
    );
  });
});
