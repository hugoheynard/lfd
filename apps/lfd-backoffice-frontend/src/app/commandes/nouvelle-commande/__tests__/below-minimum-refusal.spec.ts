import { describe, expect, it } from 'vitest';

import { isBelowMinimumRefusal } from '../below-minimum-refusal';

/** L'enveloppe d'erreur telle que `HttpClient` la rend : le corps sous `error`. */
function refusal(code: string): unknown {
  return {
    status: 409,
    error: { code, message: 'Croissant se commande par 6 pièces au moins.' },
  };
}

describe('le refus d’une ligne sous le minimum', () => {
  it('se reconnaît à son code', () => {
    expect(isBelowMinimumRefusal(refusal('orders.line.quantity_below_minimum'))).toBe(true);
  });

  it('ne se confond pas avec un autre refus de ligne', () => {
    expect(isBelowMinimumRefusal(refusal('orders.line.weight_without_step'))).toBe(false);
  });

  it('ne reconnaît rien dans une panne réseau', () => {
    expect(isBelowMinimumRefusal({ status: 0, error: null })).toBe(false);
  });
});
