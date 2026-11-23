import { describe, expect, it } from 'vitest';

import {
  EMPTY_ADDRESS,
  EMPTY_WINDOW,
  offeredParticularBlockersOf,
  offeredParticularEstimatePayloadOf,
  particularEstimateBodyOf,
  type ParticularOfferChoice,
} from './particular-offer-draft';
import type { ParticularOrderChoice } from './particular-order-draft';

const CHOICE: ParticularOrderChoice = {
  buyerUserId: 'u1',
  pickupAddressId: 'p1',
  requestedDate: '2026-12-01',
  window: { start: '08:00', end: '09:00' },
  note: '',
};

const LINES = [{ sku: 'S1', quantity: 2 }];

function offer(over: Partial<ParticularOfferChoice> = {}): ParticularOfferChoice {
  return {
    method: 'pickup',
    address: EMPTY_ADDRESS,
    deliveryWindow: EMPTY_WINDOW,
    nature: 'tasting',
    note: ' Dégustation ',
    notifyCustomer: false,
    ...over,
  };
}

const DELIVERED = offer({
  method: 'delivery',
  address: { ligne1: '1 rue des Lilas', codePostal: '75011', ville: 'Paris' },
  deliveryWindow: { start: '09:00', end: '11:00' },
});

describe('offeredParticularEstimatePayloadOf', () => {
  it('un retrait : le corps du comptoir, avec le motif rogné', () => {
    const payload = offeredParticularEstimatePayloadOf(CHOICE, offer(), LINES);
    expect(payload).toMatchObject({
      fulfillmentMethod: 'pickup',
      pickupAddressId: 'p1',
      offer: { nature: 'tasting', note: 'Dégustation', notifyCustomer: false },
    });
  });

  it('un motif incomplet ne part pas : le serveur chiffre la valeur pleine', () => {
    const payload = offeredParticularEstimatePayloadOf(CHOICE, offer({ note: ' ' }), LINES);
    expect(payload).not.toBeNull();
    expect(payload !== null && 'offer' in payload).toBe(false);
  });

  it('une livraison : l’adresse dictée, en France, et la tranche tapée, sans point', () => {
    const payload = offeredParticularEstimatePayloadOf(CHOICE, DELIVERED, LINES);
    expect(payload).toMatchObject({
      fulfillmentMethod: 'delivery',
      pickupAddressId: null,
      deliveryAddressId: null,
      deliveryAddress: { ligne1: '1 rue des Lilas', codePostal: '75011', pays: 'France' },
      requestedWindow: { start: '09:00', end: '11:00' },
    });
  });

  it('une livraison sans adresse complète ou à la tranche à l’envers ne se compose pas', () => {
    const noCity = { ...DELIVERED, address: { ...DELIVERED.address, ville: '' } };
    const reversed = { ...DELIVERED, deliveryWindow: { start: '11:00', end: '09:00' } };
    expect(offeredParticularEstimatePayloadOf(CHOICE, noCity, LINES)).toBeNull();
    expect(offeredParticularEstimatePayloadOf(CHOICE, reversed, LINES)).toBeNull();
  });
});

describe('particularEstimateBodyOf', () => {
  it('sans offre, le corps du comptoir ; avec, le corps offert', () => {
    expect(particularEstimateBodyOf(CHOICE, null, LINES)?.offered).toBe(false);
    expect(particularEstimateBodyOf(CHOICE, offer(), LINES)?.offered).toBe(true);
    expect(particularEstimateBodyOf(CHOICE, offer(), [])).toBeNull();
  });
});

describe('offeredParticularBlockersOf', () => {
  const facts = {
    empty: false,
    pickupAddressId: 'p1',
    hasSlots: true,
    window: CHOICE.window,
    requestedDate: CHOICE.requestedDate,
    refusal: null,
  };

  it('ne retient rien quand tout est là', () => {
    expect(offeredParticularBlockersOf({ ...facts, offer: offer() })).toEqual([]);
  });

  it('dit le motif manquant, avec les mots de la saisie pro', () => {
    const blockers = offeredParticularBlockersOf({
      ...facts,
      offer: offer({ nature: null, note: '' }),
    });
    expect(blockers).toEqual([
      'Une commande offerte dit pourquoi : choisissez sa nature.',
      'Une commande offerte porte un motif : écrivez-le en quelques mots.',
    ]);
  });

  it('en livraison, dit l’adresse et la tranche, jamais le point de retrait', () => {
    const blockers = offeredParticularBlockersOf({
      ...facts,
      pickupAddressId: null,
      offer: offer({ method: 'delivery' }),
    });
    expect(blockers).toEqual([
      'Adresse de livraison à compléter : rue, code postal et ville.',
      'Créneau de livraison à saisir : de quelle heure à quelle heure.',
    ]);
  });

  it('dit le refus du devis, une seule fois', () => {
    const blockers = offeredParticularBlockersOf({
      ...facts,
      refusal: { code: 'orders.delivery.closed_for_audience', message: 'Fermée.' },
      offer: offer(),
    });
    expect(blockers).toEqual(['Fermée.']);
  });
});
