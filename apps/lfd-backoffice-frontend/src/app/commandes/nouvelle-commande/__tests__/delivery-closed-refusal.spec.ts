import { DELIVERY_CLOSED_FOR_AUDIENCE } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { isDeliveryClosedRefusal } from '../delivery-closed-refusal';

/** L'enveloppe d'erreur telle que `HttpClient` la rend : le corps sous `error`. */
function refusal(code: string): unknown {
  return {
    status: 409,
    error: { code, message: 'La livraison n’est pas proposée pour cet espace.' },
  };
}

describe('le refus d’une livraison fermée à la clientèle', () => {
  it('se reconnaît à son code', () => {
    expect(isDeliveryClosedRefusal(refusal(DELIVERY_CLOSED_FOR_AUDIENCE))).toBe(true);
  });

  it('ne se confond pas avec le rattrapage d’heure limite', () => {
    expect(isDeliveryClosedRefusal(refusal('orders.cutoff.grace'))).toBe(false);
  });

  it('ne reconnaît rien dans une panne réseau', () => {
    expect(isDeliveryClosedRefusal({ status: 0, error: null })).toBe(false);
  });
});
