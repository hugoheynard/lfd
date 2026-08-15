import type { DeliveryAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { addressOptions, NEW_ADDRESS, preferredChoice } from './fulfillment-choice';

function delivery(over: Partial<DeliveryAddressView> = {}): DeliveryAddressView {
  return {
    id: 'adr_1',
    label: 'Dépôt',
    ligne1: '12 rue du Test',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
    isDefault: true,
    specs: {
      note: '',
      slots: { mode: 'everyday', slot: null },
      deliveryContact: null,
      gps: null,
      signatureRequired: false,
    },
    ...over,
  };
}

const NO_PREFERENCE = { method: null, pickupAddressId: null, deliveryAddressId: null } as const;

describe('adresses proposées au panier', () => {
  it('offre TOUJOURS la saisie à la volée, carnet ou pas', () => {
    // Une livraison exceptionnelle ne passe pas par le carnet d'adresses.
    expect(addressOptions([]).map((option) => option.value)).toEqual([NEW_ADDRESS]);
    expect(addressOptions([delivery()]).map((option) => option.value)).toEqual([
      'adr_1',
      NEW_ADDRESS,
    ]);
  });

  it("nomme une adresse par son libellé ET son postal, jamais l'un sans l'autre", () => {
    // Deux dépôts peuvent porter le même libellé ; l'adresse les départage.
    expect(addressOptions([delivery()])[0]?.label).toBe(
      "Dépôt — 12 rue du Test, 73150 Val d'Isère",
    );
  });

  it('retombe sur la rue quand le libellé est vide', () => {
    expect(addressOptions([delivery({ label: '' })])[0]?.label).toBe(
      "12 rue du Test, 73150 Val d'Isère",
    );
  });
});

describe('position de départ du panier, tirée de la préférence', () => {
  it("n'applique RIEN quand aucune préférence n'est posée", () => {
    // « Aucune préférence » n'est pas « retrait » : le panier garde son défaut.
    expect(preferredChoice(NO_PREFERENCE, [], true)).toBeNull();
  });

  it('ouvre sur le point de retrait préféré', () => {
    expect(
      preferredChoice(
        { method: 'pickup', pickupAddressId: 'pick_2', deliveryAddressId: null },
        [],
        true,
      ),
    ).toEqual({ method: 'pickup', pickupId: 'pick_2', addressId: NEW_ADDRESS });
  });

  it('laisse le point par défaut quand la préférence ne désigne personne', () => {
    // Un pointeur `null` dit « celui du moment », pas « celui d'alors ».
    expect(
      preferredChoice(
        { method: 'pickup', pickupAddressId: null, deliveryAddressId: null },
        [],
        true,
      )?.pickupId,
    ).toBe('');
  });

  it("résout « la défaut » sur le carnet D'AUJOURD'HUI", () => {
    const deliveries = [delivery({ id: 'adr_2', isDefault: true }), delivery({ isDefault: false })];

    expect(
      preferredChoice(
        { method: 'delivery', pickupAddressId: null, deliveryAddressId: null },
        deliveries,
        true,
      )?.addressId,
    ).toBe('adr_2');
  });

  it('retombe sur la défaut quand l’adresse préférée a été SUPPRIMÉE', () => {
    // Un id fantôme viderait le choix sans rien expliquer au client.
    expect(
      preferredChoice(
        { method: 'delivery', pickupAddressId: null, deliveryAddressId: 'adr_disparue' },
        [delivery()],
        true,
      )?.addressId,
    ).toBe('adr_1');
  });

  it('bascule sur la saisie quand le carnet est VIDE', () => {
    expect(
      preferredChoice(
        { method: 'delivery', pickupAddressId: null, deliveryAddressId: null },
        [],
        true,
      )?.addressId,
    ).toBe(NEW_ADDRESS);
  });

  it("N'APPLIQUE PAS une préférence de livraison quand le service est fermé", () => {
    // Ouvrir sur un mode que la plateforme ne rend pas serait une promesse
    // qu'aucun écran ne peut tenir.
    expect(
      preferredChoice(
        { method: 'delivery', pickupAddressId: null, deliveryAddressId: 'adr_1' },
        [delivery()],
        false,
      ),
    ).toBeNull();
  });
});
