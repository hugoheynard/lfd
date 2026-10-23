import type { DeliveryAddressView, OrderView, PickupAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NEW_ADDRESS } from '../../nouvelle-commande/draft.store';
import {
  bookAddressIdOf,
  revisionCartOf,
  revisionContentOf,
  revisionDraftOf,
} from '../revision-draft';

const POINT = {
  id: 'pk_labo',
  ligne1: '3 rue du Four',
  codePostal: '73000',
} as const;

const BOOK = { id: 'adr_1', ligne1: '1 place Haute', codePostal: '73150' } as const;

const ADDRESS = {
  label: '',
  ligne1: '1 place Haute',
  ligne2: '',
  codePostal: '73150',
  ville: 'Val',
  pays: 'France',
};

const FULFILLMENT: OrderView['fulfillment'] = {
  window: { value: { start: '08:00', end: '09:00' }, source: 'override' },
  contact: { value: null, source: 'default' },
  signatureRequired: { value: true, source: 'override' },
};

// Le point se retrouve par son id ; l'adresse livrée, par sa rue.
const pickups = (): readonly Pick<PickupAddressView, 'id' | 'ligne1' | 'codePostal'>[] => [
  { ...POINT, id: 'pk_meme_rue' },
  POINT,
];
const book = (): readonly Pick<DeliveryAddressView, 'id' | 'ligne1' | 'codePostal'>[] => [BOOK];

describe('la commande passée, remise dans la forme de la saisie', () => {
  it('garde les lignes à leur prix figé', () => {
    const lines = revisionCartOf({
      lines: [
        {
          sku: 'BAG',
          productName: 'Baguette',
          unitPriceMillicents: 95_000,
          quantity: 12,
        },
      ],
    });
    expect(lines).toEqual([
      { sku: 'BAG', name: 'Baguette', unitPriceMillicents: 95_000, quantity: 12 },
    ]);
  });

  it('reprend le point de retrait que la commande porte, jamais un voisin à la même adresse', () => {
    const draft = revisionDraftOf(
      {
        fulfillmentMethod: 'pickup',
        pickupAddressId: 'pk_labo',
        deliveryAddress: null,
        fulfillment: FULFILLMENT,
        requestedDeliveryDate: '2026-11-02',
        note: 'Sans sel',
      },
      pickups(),
      [],
    );
    expect(draft).toMatchObject({
      method: 'pickup',
      pickupId: 'pk_labo',
      window: { start: '08:00', end: '09:00' },
      requestedDate: '2026-11-02',
      note: 'Sans sel',
    });
  });

  it("laisse le choix vide quand le point n'est plus offert, plutôt que d'en deviner un", () => {
    const draft = revisionDraftOf(
      {
        fulfillmentMethod: 'pickup',
        pickupAddressId: 'pk_ferme',
        deliveryAddress: null,
        fulfillment: FULFILLMENT,
        requestedDeliveryDate: null,
        note: '',
      },
      pickups(),
      [],
    );
    expect(draft.pickupId).toBe('');
    expect(draft.requestedDate).toBe('');
  });

  it('rouvre une adresse livrée sur le carnet, ou sur la saisie garnie', () => {
    const base = {
      fulfillmentMethod: 'delivery' as const,
      pickupAddressId: null,
      fulfillment: FULFILLMENT,
      requestedDeliveryDate: '2026-11-02',
      note: '',
    };
    expect(revisionDraftOf({ ...base, deliveryAddress: ADDRESS }, [], book()).addressId).toBe(
      'adr_1',
    );
    const dictated = revisionDraftOf(
      { ...base, deliveryAddress: { ...ADDRESS, ligne1: '9 chemin Bas' } },
      [],
      book(),
    );
    expect(dictated.addressId).toBe(NEW_ADDRESS);
    expect(dictated.address.ligne1).toBe('9 chemin Bas');
  });
});

describe('la commande voulue, telle que le serveur la reçoit', () => {
  const pickup = {
    method: 'pickup' as const,
    pickupAddressId: 'pk_labo',
    deliveryAddress: null,
    saveToBook: false,
    window: { start: '08:00', end: '09:00' },
    issue: null,
  };

  it('renvoie les choix faits (override) et omet les défauts', () => {
    const content = revisionContentOf(
      { fulfillment: FULFILLMENT },
      {
        fulfillment: pickup,
        bookAddressId: 'adr_1',
        requestedDeliveryDate: '2026-11-03',
        note: 'n',
      },
      [{ sku: 'BAG', name: 'Baguette', unitPriceMillicents: 1, quantity: 3 }],
    );
    expect(content).toEqual({
      fulfillmentMethod: 'pickup',
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddressId: 'pk_labo',
      requestedDeliveryDate: '2026-11-03',
      requestedWindow: { start: '08:00', end: '09:00' },
      signatureRequired: true,
      note: 'n',
      lines: [{ sku: 'BAG', quantity: 3 }],
    });
    expect('deliveryContact' in content).toBe(false);
  });

  it('omet la tranche quand aucune n’est convenue, jamais `null`', () => {
    const content = revisionContentOf(
      { fulfillment: FULFILLMENT },
      {
        fulfillment: { ...pickup, method: 'delivery', deliveryAddress: ADDRESS, window: null },
        bookAddressId: 'adr_1',
        requestedDeliveryDate: '2026-11-03',
        note: '',
      },
      [],
    );
    expect('requestedWindow' in content).toBe(false);
    expect(content.pickupAddressId).toBeNull();
    expect(content.deliveryAddressId).toBe('adr_1');
  });

  it("résout l'entrée du carnet comme le sélecteur", () => {
    expect(bookAddressIdOf('', book())).toBe('adr_1');
    expect(bookAddressIdOf('', [])).toBeNull();
    expect(bookAddressIdOf(NEW_ADDRESS, book())).toBeNull();
  });
});
