import { NO_PICKUP_DISCOUNTS, type PickupAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  defaultPickupIdOf,
  particularBlockersOf,
  particularEstimatePayloadOf,
  particularPickupsOf,
} from './particular-order-draft';

function point(id: string, b2c = true): PickupAddressView {
  return {
    id,
    label: id,
    ligne1: '1 rue',
    ligne2: '',
    codePostal: '73000',
    ville: 'Chambéry',
    pays: 'FR',
    discounts: NO_PICKUP_DISCOUNTS,
    pickupAudiences: { b2b: true, b2c },
    opening: { publicOpening: null, proPickup: null },
  };
}

const CHOICE = {
  buyerUserId: 'u1',
  pickupAddressId: 'p1',
  requestedDate: '2026-12-01',
  window: { start: '08:00', end: '09:00' },
  note: '',
};

describe('la saisie particulier au comptoir', () => {
  it('ne propose que les points ouverts aux particuliers', () => {
    expect(particularPickupsOf([point('a'), point('pro', false)]).map((p) => p.id)).toEqual(['a']);
  });

  it('prend par défaut le point du comptoir, s’il est ouvert au particulier', () => {
    expect(defaultPickupIdOf([point('a'), point('b')], 'b')).toBe('b');
    expect(defaultPickupIdOf([point('a')], 'pro')).toBeNull();
    expect(defaultPickupIdOf([point('a')], null)).toBeNull();
  });

  it('compose un retrait, jamais une livraison, et rien tant qu’il manque un créneau', () => {
    const lines = [{ sku: 'S1', quantity: 2 }];
    expect(particularEstimatePayloadOf(CHOICE, lines)).toMatchObject({
      buyerUserId: 'u1',
      fulfillmentMethod: 'pickup',
      deliveryAddress: null,
      pickupAddressId: 'p1',
      requestedWindow: { start: '08:00', end: '09:00' },
    });
    expect(particularEstimatePayloadOf({ ...CHOICE, window: null }, lines)).toBeNull();
    expect(particularEstimatePayloadOf(CHOICE, [])).toBeNull();
  });

  it('dit ce qui retient, refus « rattrapable » compris : un particulier n’a pas de dérogation', () => {
    const base = {
      empty: false,
      pickupAddressId: 'p1',
      hasSlots: true,
      window: CHOICE.window,
      requestedDate: CHOICE.requestedDate,
    };
    expect(particularBlockersOf({ ...base, refusal: null })).toEqual([]);
    expect(
      particularBlockersOf({
        ...base,
        refusal: { code: 'orders.cutoff.grace', message: 'Heure limite passée.' },
      }),
    ).toEqual(['Heure limite passée.']);
    expect(particularBlockersOf({ ...base, empty: true, window: null, refusal: null })).toEqual([
      'Le panier est vide.',
      'Créneau de retrait à choisir.',
    ]);
  });
});
