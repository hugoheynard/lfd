import { describe, expect, it } from 'vitest';

import { orderHeader } from '../order-header';

describe('orderHeader', () => {
  it('dit la référence, le mode et son jour, puis le client', () => {
    const header = orderHeader({
      orderNumber: 'ORD-142',
      fulfillmentMethod: 'pickup',
      requestedDeliveryDate: '2026-10-12',
      customerLabel: 'Boulangerie Martin',
      clientele: 'pro',
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
      clientele: 'public',
    });
    expect(header.subtitle).toBe('Livraison — Jeanne Dupont');
  });

  it('porte le badge Pro en info, Particulier en neutre — les teintes de la liste', () => {
    const base = {
      orderNumber: 'ORD-1',
      fulfillmentMethod: 'pickup',
      requestedDeliveryDate: null,
      customerLabel: 'X',
    } as const;
    expect(orderHeader({ ...base, clientele: 'pro' }).clientele).toEqual({
      label: 'Pro',
      variant: 'info',
    });
    expect(orderHeader({ ...base, clientele: 'public' }).clientele?.variant).toBe('neutral');
  });

  it("n'invente pas de badge pour une commande d'avant la distinction", () => {
    const header = orderHeader({
      orderNumber: 'ORD-0',
      fulfillmentMethod: 'pickup',
      requestedDeliveryDate: null,
      customerLabel: 'X',
      clientele: null,
    });
    expect(header.clientele).toBeNull();
  });
});
