import { TestBed } from '@angular/core/testing';
import type { DeliveryAddressView, DeliveryZoneView, PickupAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  AcheminementCommande,
  type FulfillmentChoice,
} from '../acheminement-commande/acheminement-commande';

const LABO: PickupAddressView = {
  id: 'pick_1',
  label: 'Labo',
  ligne1: '3 rue du Four',
  ligne2: '',
  codePostal: '75011',
  ville: 'Paris',
  pays: 'France',
  isDefault: true,
  discount: null,
};

const ADRESSE: DeliveryAddressView = {
  id: 'addr_1',
  label: 'Boutique',
  ligne1: '12 avenue Foch',
  ligne2: '',
  codePostal: '92100',
  ville: 'Boulogne',
  pays: 'France',
  isDefault: true,
  specs: {
    note: '',
    slots: { mode: 'everyday', slot: null },
    deliveryContact: null,
    gps: null,
  },
};

const ZONE_92: DeliveryZoneView = {
  id: 'zone_1',
  label: 'Ouest',
  postalPrefixes: ['92'],
  fee: { mode: 'amount', cents: 800 },
};

/** Monte le sélecteur et rend le dernier choix émis. */
function choiceOf(options: {
  pickups?: readonly PickupAddressView[];
  addresses?: readonly DeliveryAddressView[];
  zones?: readonly DeliveryZoneView[];
  courier?: boolean;
}): FulfillmentChoice {
  const fixture = TestBed.createComponent(AcheminementCommande);
  fixture.componentRef.setInput('pickups', options.pickups ?? [LABO]);
  fixture.componentRef.setInput('addresses', options.addresses ?? [ADRESSE]);
  fixture.componentRef.setInput('zones', options.zones ?? [ZONE_92]);

  let last: FulfillmentChoice | null = null;
  fixture.componentInstance.choiceChange.subscribe((choice) => (last = choice));
  fixture.detectChanges();
  if (options.courier === true) {
    fixture.componentInstance['onMethod']('delivery');
    fixture.detectChanges();
  }
  if (last === null) {
    throw new Error("Le sélecteur n'a émis aucun acheminement.");
  }
  return last;
}

describe("le sélecteur d'acheminement de la saisie staff", () => {
  it('émet un acheminement dès l’ouverture, sans rien toucher', () => {
    // Le cas le plus courant : le commercial ne touche pas au sélecteur. Émettre
    // sur les seules interactions aurait laissé le panier sans acheminement.
    expect(choiceOf({})).toEqual({
      method: 'pickup',
      pickupAddressId: 'pick_1',
      deliveryAddress: null,
      issue: null,
    });
  });

  it('fige l’adresse du carnet quand on livre', () => {
    const choice = choiceOf({ courier: true });

    expect(choice.method).toBe('delivery');
    expect(choice.pickupAddressId).toBeNull();
    expect(choice.deliveryAddress).toEqual({
      label: 'Boutique',
      ligne1: '12 avenue Foch',
      ligne2: '',
      codePostal: '92100',
      ville: 'Boulogne',
      pays: 'France',
    });
    expect(choice.issue).toBeNull();
  });

  it('bloque quand aucune tournée ne dessert le code postal', () => {
    // Le serveur refuserait la commande : autant le dire avant que le panier ne
    // soit rempli et le client au téléphone.
    const choice = choiceOf({ courier: true, zones: [] });

    expect(choice.issue).toContain('92100');
  });

  it('bloque quand le compte n’a aucune adresse de livraison', () => {
    // Une adresse dictée au téléphone appartient à la fiche, pas à une commande :
    // le sélecteur renvoie donc vers la fiche au lieu d'ouvrir une saisie libre.
    const choice = choiceOf({ courier: true, addresses: [] });

    expect(choice.deliveryAddress).toBeNull();
    expect(choice.issue).toContain('fiche');
  });

  it('bloque quand aucun point de retrait n’est configuré', () => {
    expect(choiceOf({ pickups: [] }).issue).toContain('Réglages');
  });
});
