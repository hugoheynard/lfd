import { describe, expect, it } from 'vitest';

import { quantityDownStepsFor, quantityStepsFor } from './quantity-steps';

describe('quantityStepsFor', () => {
  it('garde les pas de pièces pour une pièce ou une unité absente', () => {
    expect(quantityStepsFor('piece')).toEqual([1, 10, 50, 100]);
    expect(quantityStepsFor(undefined)).toEqual([1, 10, 50, 100]);
  });

  it('au poids, propose 100 g, 500 g et 1 kg, en grammes (L2b-4)', () => {
    expect(quantityStepsFor('weight')).toEqual([100, 500, 1000]);
    expect(quantityDownStepsFor('weight')).toEqual([1000, 500, 100]);
  });
});
