import type { CustomerOrderView, PickupAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { LIVE_PICKUP } from '../mes-commandes/order-view.fixture';
import { contentOf, draftOf, withAdded, withoutLine, withQuantity } from './revision-draft';

const LABO: PickupAddressView = {
  id: 'pa_labo',
  label: 'Le Labo',
  ligne1: 'Route de la Balme',
  ligne2: '',
  codePostal: '73150',
  ville: "Val d'Isère",
  pays: 'France',
  discounts: { b2b: null, b2c: null },
  opening: { proPickup: null, publicOpening: null },
};

function point(overrides: Partial<PickupAddressView> = {}): PickupAddressView {
  return { ...LABO, ...overrides };
}

describe('revision-draft', () => {
  it('part de la commande telle qu’elle est, avec le point qu’elle porte', () => {
    const draft = draftOf(LIVE_PICKUP, [point()]);
    expect(draft.lines).toEqual([{ sku: 'VIE-001', name: 'Croissant', quantity: 2 }]);
    expect(draft.service).toMatchObject({
      mode: 'pickup',
      pickupAddressId: 'pa_labo',
      place: 'Le Labo',
    });
  });

  it('prend l’identifiant de la commande, jamais un point à la même adresse', () => {
    // Deux points partagent l'adresse : seul celui de la commande compte.
    const draft = draftOf(LIVE_PICKUP, [point({ id: 'pa_bis', label: 'Le Bis' }), point()]);
    expect(draft.service).toMatchObject({ pickupAddressId: 'pa_labo', place: 'Le Labo' });
  });

  it('une commande d’avant le site figé : point à choisir, rien n’est envoyé', () => {
    const order: CustomerOrderView = { ...LIVE_PICKUP, pickupAddressId: null };
    const draft = draftOf(order, [point()]);
    expect(draft.service).toMatchObject({ mode: 'pickup', pickupAddressId: null });
    expect(contentOf(draft, order)).toBeNull();
  });

  it('renvoie la note et les consignes figées tant que le mode ne change pas', () => {
    const order: CustomerOrderView = { ...LIVE_PICKUP, note: 'sonner deux fois' };
    const content = contentOf(draftOf(order, [point()]), order);
    expect(content).toMatchObject({
      fulfillmentMethod: 'pickup',
      pickupAddressId: 'pa_labo',
      requestedDeliveryDate: '2026-09-08',
      note: 'sonner deux fois',
      signatureRequired: false,
      deliveryContact: null,
      lines: [{ sku: 'VIE-001', quantity: 2 }],
    });
  });

  it('n’envoie rien sans ligne', () => {
    const draft = draftOf(LIVE_PICKUP, [point()]);
    expect(contentOf({ ...draft, lines: [] }, LIVE_PICKUP)).toBeNull();
  });

  it('ajoute une pièce à une ligne présente, une ligne neuve sinon, et borne à un', () => {
    const lines = [{ sku: 'A', name: 'A', quantity: 1 }];
    expect(withAdded(lines, { sku: 'A', name: 'A' })).toEqual([
      { sku: 'A', name: 'A', quantity: 2 },
    ]);
    expect(withAdded(lines, { sku: 'B', name: 'B' })).toHaveLength(2);
    expect(withQuantity(lines, 'A', 0)).toEqual([{ sku: 'A', name: 'A', quantity: 1 }]);
    expect(withoutLine(lines, 'A')).toEqual([]);
  });

  /** P5 (`plan-vente-au-poids.md`) : ajouter un article au poids ajoutait « 1 » gramme. */
  it('ajoute un article au poids à sa première quantité, puis d’un pas', () => {
    const gravlax = {
      sku: 'G',
      name: 'Gravlax',
      saleUnit: 'weight' as const,
      step: 100,
      first: 300,
    };
    const added = withAdded([], gravlax);
    expect(added).toEqual([{ sku: 'G', name: 'Gravlax', quantity: 300, saleUnit: 'weight' }]);
    expect(withAdded(added, gravlax)).toEqual([
      { sku: 'G', name: 'Gravlax', quantity: 400, saleUnit: 'weight' },
    ]);
  });
});
