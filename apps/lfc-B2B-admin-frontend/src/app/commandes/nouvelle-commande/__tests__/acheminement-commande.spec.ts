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
  dictate?: { ligne1: string; codePostal: string; ville: string };
  keep?: boolean;
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
  const dictated = options.dictate;
  if (dictated !== undefined) {
    fixture.componentInstance['onAddress']('__new__');
    type Field = 'ligne1' | 'codePostal' | 'ville';
    const fields: readonly Field[] = ['ligne1', 'codePostal', 'ville'];
    for (const field of fields) {
      // Un vrai élément et un vrai événement : `onField` lit `event.target`, et le
      // simuler par un littéral aurait demandé un cast que le dépôt interdit.
      const input = document.createElement('input');
      input.value = dictated[field];
      input.addEventListener('input', (event) =>
        fixture.componentInstance['onField'](field, event),
      );
      input.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
  }
  if (options.keep === true) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    box.addEventListener('change', (event) => fixture.componentInstance['onKeep'](event));
    box.dispatchEvent(new Event('change'));
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
      saveToBook: false,
      issue: null,
    });
  });

  it('fige l’adresse du carnet quand on livre', () => {
    const choice = choiceOf({ courier: true });

    expect(choice.method).toBe('delivery');
    expect(choice.pickupAddressId).toBeNull();
    expect(choice.deliveryAddress).toEqual({
      // Pas de nom d'usage : le carnet le tient pour ses entrées, une adresse de
      // commande est une adresse, pas une fiche.
      label: '',
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

  it('ouvre la saisie quand le carnet est vide, et bloque tant qu’elle est incomplète', () => {
    // Un carnet vide ne doit pas immobiliser l'appel : la saisie s'ouvre d'
    // elle-même, et c'est l'adresse manquante — pas le carnet — qui bloque.
    const choice = choiceOf({ courier: true, addresses: [] });

    expect(choice.deliveryAddress).toBeNull();
    expect(choice.issue).toContain('incomplète');
  });

  it('accepte une adresse dictée au téléphone', () => {
    const choice = choiceOf({
      courier: true,
      addresses: [],
      dictate: { ligne1: '5 rue Neuve', codePostal: '92200', ville: 'Neuilly' },
    });

    expect(choice.deliveryAddress).toEqual({
      label: '',
      ligne1: '5 rue Neuve',
      ligne2: '',
      codePostal: '92200',
      ville: 'Neuilly',
      pays: 'France',
    });
    expect(choice.issue).toBeNull();
  });

  it('bloque quand aucun point de retrait n’est configuré', () => {
    expect(choiceOf({ pickups: [] }).issue).toContain('Réglages');
  });

  it('ne garde l’adresse au carnet que si la case est cochée', () => {
    // Une commande peut livrer une adresse de passage : l'enregistrer d'office
    // remplirait le carnet du compte de lieux où l'on ne retournera jamais.
    const dictate = { ligne1: '5 rue Neuve', codePostal: '92200', ville: 'Neuilly' };

    expect(choiceOf({ courier: true, addresses: [], dictate }).saveToBook).toBe(false);
    expect(choiceOf({ courier: true, addresses: [], dictate, keep: true }).saveToBook).toBe(true);
  });

  it('ne propose pas de garder une adresse qui vient déjà du carnet', () => {
    // La case n'est pas rendue dans ce cas ; le choix le redit, pour que le jour
    // où le gabarit changerait, le carnet ne se duplique pas en silence.
    expect(choiceOf({ courier: true, keep: true }).saveToBook).toBe(false);
  });
});
