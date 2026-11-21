import { describe, expect, it } from 'vitest';

import { orderHeader } from '../order-header';

const BASE = {
  orderNumber: 'ORD-142',
  fulfillmentMethod: 'pickup',
  pickupAddress: null,
  requestedDeliveryDate: '2026-11-22',
  customerLabel: 'Chalet du Laisinant',
  clientele: 'pro',
} as const;

const PICKUP = {
  label: 'La Folie Bakery',
  ligne1: '1 rue du Four',
  ligne2: '',
  codePostal: '75011',
  ville: 'Paris',
  pays: 'France',
};

describe('orderHeader', () => {
  it('dit la référence et le client', () => {
    const header = orderHeader(BASE);
    expect(header.number).toBe('ORD-142');
    expect(header.name).toBe('Chalet du Laisinant');
  });

  it('dit le mode par `fulfillmentLabel`, son point de retrait, puis son jour', () => {
    expect(orderHeader({ ...BASE, pickupAddress: PICKUP }).fulfillment).toBe(
      'Retrait · La Folie Bakery, le 22 novembre 2026',
    );
    expect(orderHeader({ ...BASE, fulfillmentMethod: 'delivery' }).fulfillment).toBe(
      'Livraison par coursier, le 22 novembre 2026',
    );
  });

  it("sans jour demandé, dit le mode seul plutôt qu'un jour inventé", () => {
    expect(orderHeader({ ...BASE, requestedDeliveryDate: null }).fulfillment).toBe('Retrait');
  });

  it('sans nom de client, ne dit rien', () => {
    expect(orderHeader({ ...BASE, customerLabel: ' ' }).name).toBeNull();
  });

  it('porte le badge Pro en info, Particulier en neutre — les teintes de la liste', () => {
    expect(orderHeader(BASE).clientele).toEqual({ label: 'Pro', variant: 'info' });
    expect(orderHeader({ ...BASE, clientele: 'public' }).clientele?.variant).toBe('neutral');
  });

  it("n'invente pas de badge pour une commande d'avant la distinction", () => {
    expect(orderHeader({ ...BASE, clientele: null }).clientele).toBeNull();
  });
});
