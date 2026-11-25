import type { AdminBackorderView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  particularBackorderBlockersOf,
  particularBackorderLoadRefusalOf,
  particularBackorderPayloadOf,
  type ParticularBackorderChoice,
} from './particular-backorder-payload';

const CHOICE: ParticularBackorderChoice = {
  venue: 'shop_till',
  pickupAddressId: 'pickup_1',
  requestedDate: '2030-01-12',
  window: { start: '07:00', end: '08:00' },
  note: '',
  offerNature: null,
  offerNote: '',
  offerNotifiesCustomer: false,
};

const OPEN: AdminBackorderView = {
  id: 'bo_1',
  state: 'open',
  createdAt: '2030-01-10T09:15:00.000Z',
  origin: { orderId: 'ord_1', orderNumber: 'ORD-0042' },
  company: null,
  buyer: { userId: 'u_1', name: 'Léa Martin' },
  lines: [],
  convertedOrder: null,
  closedAt: null,
};

describe('particularBackorderPayloadOf — le corps du reliquat d’un particulier', () => {
  it('au retrait, sans lignes ni acheteur (le serveur les reprend), ni motif à la boutique', () => {
    expect(
      particularBackorderPayloadOf({ ...CHOICE, offerNature: 'goodwill', offerNote: 'x' }),
    ).toEqual({
      venue: 'shop_till',
      fulfillmentMethod: 'pickup',
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddressId: 'pickup_1',
      requestedDeliveryDate: '2030-01-12',
      requestedWindow: { start: '07:00', end: '08:00' },
      note: '',
    });
  });

  it('offerte : le motif part complet, et pas avant', () => {
    const offered = { ...CHOICE, venue: 'offered' as const };
    expect(particularBackorderPayloadOf(offered)).not.toHaveProperty('offer');
    expect(
      particularBackorderPayloadOf({
        ...offered,
        offerNature: 'goodwill',
        offerNote: ' Le reste ',
      }),
    ).toMatchObject({ venue: 'offered', offer: { nature: 'goodwill', note: 'Le reste' } });
  });

  it('rien tant que le point, le créneau ou le jour manquent', () => {
    expect(particularBackorderPayloadOf({ ...CHOICE, pickupAddressId: null })).toBeNull();
    expect(particularBackorderPayloadOf({ ...CHOICE, window: null })).toBeNull();
    expect(particularBackorderPayloadOf({ ...CHOICE, requestedDate: '' })).toBeNull();
  });
});

describe('particularBackorderBlockersOf — ce qui retient, dit en clair', () => {
  it('le créneau, le motif d’une offerte, puis le refus du devis', () => {
    expect(
      particularBackorderBlockersOf({
        choice: { ...CHOICE, venue: 'offered', window: null },
        hasSlots: true,
        refusal: { message: 'Trop tard.' },
      }),
    ).toEqual([
      'Créneau de retrait à choisir.',
      'Une commande offerte dit pourquoi : choisissez sa nature.',
      'Une commande offerte porte un motif : écrivez-le en quelques mots.',
      'Trop tard.',
    ]);
    expect(
      particularBackorderBlockersOf({ choice: CHOICE, hasSlots: true, refusal: null }),
    ).toEqual([]);
  });
});

describe('particularBackorderLoadRefusalOf — l’écran ne s’ouvre que sur ce qu’il sait faire', () => {
  it('un reliquat ouvert de particulier : rien à redire', () => {
    expect(particularBackorderLoadRefusalOf(OPEN, false)).toBeNull();
  });

  it('absent, fermé, d’une société, ou offerte sans le droit', () => {
    expect(particularBackorderLoadRefusalOf(null, false)).toContain('pas de reliquat');
    expect(particularBackorderLoadRefusalOf({ ...OPEN, state: 'converted' }, false)).toContain(
      'déjà',
    );
    expect(
      particularBackorderLoadRefusalOf({ ...OPEN, company: { id: 'c', name: 'C' } }, false),
    ).toContain('Transformer');
    expect(particularBackorderLoadRefusalOf(OPEN, true)).toContain('droit d’offrir');
  });
});
