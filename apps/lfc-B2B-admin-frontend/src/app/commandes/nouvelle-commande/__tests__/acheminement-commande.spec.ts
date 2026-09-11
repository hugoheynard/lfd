import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { DeliveryAddressView, DeliveryZoneView, PickupAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  AcheminementCommande,
  type FulfillmentChoice,
} from '../acheminement-commande/acheminement-commande';
import { DraftStore } from '../draft.store';

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
  // Aucune heure déclarée : le point n'oppose rien à la tranche demandée.
  opening: { publicOpening: null, proPickup: null },
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
    signatureRequired: false,
  },
};

const ZONE_92: DeliveryZoneView = {
  id: 'zone_1',
  label: 'Ouest',
  postalPrefixes: ['92'],
  fee: { mode: 'amount', cents: 800 },
};

/** Monte le sélecteur sur ces points, sans rien toucher d'autre. */
function mount(pickups: readonly PickupAddressView[]): ComponentFixture<AcheminementCommande> {
  const fixture = TestBed.createComponent(AcheminementCommande);
  fixture.componentRef.setInput('draft', new DraftStore());
  fixture.componentRef.setInput('pickups', pickups);
  fixture.componentRef.setInput('addresses', [ADRESSE]);
  fixture.componentRef.setInput('zones', [ZONE_92]);
  fixture.detectChanges();
  return fixture;
}

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
  // Le brouillon de l'écran : c'est lui qui garde le choix, le composant n'en
  // est qu'une vue (cf. `DraftStore`).
  fixture.componentRef.setInput('draft', new DraftStore());
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
      // Ce point n'a aucune heure déclarée : aucun créneau ne peut être
      // convenu, et le créneau est obligatoire — donc l'acheminement refuse, en
      // nommant le réglage. Le parcours CLIENT refuse déjà sur un tel point.
      window: null,
      issue:
        'Ce point n’a aucune heure d’ouverture déclarée — impossible de convenir d’un créneau (Réglages → Livraisons & retraits).',
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

  /**
   * 🔴 **Le créneau de retrait, ajouté le 2026-09-11.** L'écran n'en proposait
   * aucun, donc toute commande prise au téléphone arrivait au comptoir sans
   * heure : la file ne pouvait pas juger son retard, et l'équipe ne savait pas
   * quand attendre le client.
   */
  describe('le créneau de retrait', () => {
    const OUVERT: PickupAddressView = {
      ...LABO,
      opening: {
        proPickup: { start: '05:00', end: '06:30' },
        publicOpening: { start: '07:00', end: '09:00' },
      },
    };

    it('🔴 réclame une réponse tant que rien n’est choisi', () => {
      const choice = choiceOf({ pickups: [OUVERT] });

      expect(choice.window).toBeNull();
      expect(choice.issue).toContain('Créneau de retrait');
    });

    it('🔴 n’invente AUCUNE heure de départ', () => {
      // Préremplir avec la première ouverture ferait promettre un engagement
      // que personne n'a pris — et le comptoir le lirait comme tel.
      const fixture = mount([OUVERT]);

      expect(fixture.componentInstance['slotId']()).toBe('');
    });

    it('retient la tranche choisie, bornes comprises', () => {
      const fixture = mount([OUVERT]);
      fixture.componentInstance['onSlot']('05:00-06:00');
      fixture.detectChanges();

      expect(fixture.componentInstance['choice']().window).toEqual({
        start: '05:00',
        end: '06:00',
      });
      expect(fixture.componentInstance['choice']().issue).toBeNull();
    });

    it('🔴 il n’existe AUCUNE option « aucune heure convenue »', () => {
      // Elle a existé une heure le 2026-09-11, et elle rendait acceptable
      // précisément ce qu'on voulait faire disparaître. Un retard se gère ; une
      // commande sans heure n'a pas de rang dans la file et ne peut être en
      // retard de rien.
      const fixture = mount([OUVERT]);

      const values = fixture.componentInstance['slotOptions']().map((option) => option.value);
      expect(values).toEqual(['05:00-06:00', '06:00-06:30', '07:00-08:00', '08:00-09:00']);
    });

    it('🔴 une valeur qui n’est pas un créneau du point ne s’écrit pas', () => {
      // La sentinelle disparue traînerait dans un gabarit ou un brouillon ; la
      // laisser remettre la tranche à `null` rouvrirait l'échappatoire.
      const fixture = mount([OUVERT]);
      fixture.componentInstance['onSlot']('05:00-06:00');
      fixture.detectChanges();
      fixture.componentInstance['onSlot']('__none__');
      fixture.detectChanges();

      expect(fixture.componentInstance['choice']().window).toEqual({
        start: '05:00',
        end: '06:00',
      });
    });

    it('🔴 changer de point EFFACE la tranche et rouvre la question', () => {
      // Les créneaux d'un point ne valent pas pour un autre : garder l'heure
      // promettrait une porte close, et le serveur refuserait à la passation —
      // une fois le client raccroché.
      const village: PickupAddressView = {
        ...OUVERT,
        id: 'pick_2',
        label: 'Village',
        isDefault: false,
      };
      const fixture = mount([OUVERT, village]);
      fixture.componentInstance['onSlot']('05:00-06:00');
      fixture.detectChanges();

      fixture.componentInstance['onPickup']('pick_2');
      fixture.detectChanges();

      expect(fixture.componentInstance['choice']().window).toBeNull();
      expect(fixture.componentInstance['choice']().issue).toContain('Créneau de retrait');
    });

    it('🔴 le coursier n’en porte JAMAIS', () => {
      // La fenêtre qui vaut en livraison est celle du CARNET, que le serveur
      // lit à partir de l'adresse. En poser une ici l'écraserait.
      expect(choiceOf({ pickups: [OUVERT], courier: true }).window).toBeNull();
    });

    it('🔴 un point sans heure déclarée REFUSE, et nomme le réglage', () => {
      // Ce n'est pas un durcissement : le dialogue du parcours client n'émet
      // que si une tranche est choisie, et un point sans ouverture n'en offre
      // aucune — personne ne peut y commander. Laisser passer la saisie staff
      // ferait de l'écran du commercial la seule porte d'entrée de la donnée
      // qu'on vient de bannir.
      expect(choiceOf({ pickups: [LABO] }).issue).toContain('Réglages');
    });
  });
});
