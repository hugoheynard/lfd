import { describe, expect, it } from 'vitest';

import { orderHeader } from '../order-header';

describe('orderHeader', () => {
  it('dit la référence, le mode et son jour, puis le client', () => {
    const header = orderHeader({
      orderNumber: 'ORD-142',
      fulfillmentMethod: 'pickup',
      requestedDeliveryDate: '2026-10-12',
      customerLabel: 'Boulangerie Martin',
    });
    expect(header.number).toBe('ORD-142');
    expect(header.subtitle).toMatch(/^Retrait le .+ — Boulangerie Martin$/);
  });

  it("sans jour demandé, dit le mode seul plutôt qu'un jour inventé", () => {
    const header = orderHeader({
      orderNumber: 'ORD-7',
      fulfillmentMethod: 'delivery',
      requestedDeliveryDate: null,
      customerLabel: 'Jeanne Dupont',
    });
    expect(header.subtitle).toBe('Livraison — Jeanne Dupont');
  });
});
