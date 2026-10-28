import { describe, expect, it } from 'vitest';

import { quantityLabel } from '../issued-invoice-format';

/** Toujours trois décimales au kilo, comme le PDF (plan vente au poids, § 3 bis). */
describe('quantityLabel', () => {
  it.each([
    [1_250, 'KGM', '1,250 kg'],
    [2_000, 'KGM', '2,000 kg'],
    [20, 'KGM', '0,020 kg'],
    [1, 'KGM', '0,001 kg'],
    [1_000_000, 'KGM', '1000,000 kg'],
    [2_000, 'H87', '2'],
  ])('%i millièmes de %s → %s', (thousandths, unitCode, expected) => {
    expect(quantityLabel({ quantityThousandths: thousandths, unitCode })).toBe(expected);
  });
});
