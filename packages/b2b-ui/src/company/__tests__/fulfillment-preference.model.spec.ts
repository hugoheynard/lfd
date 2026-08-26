import type {
  DeliveryAddressView,
  FulfillmentPreferenceView,
  PickupAddressView,
} from '@lfd/contracts';

import {
  DEFAULT_DESTINATION,
  destinationOf,
  fulfillmentDestinations,
  namedDestinations,
  noPreference,
  preferenceForDestination,
  preferenceForMethod,
} from '../fulfillment-preference.model';

const PICKUPS = [
  { id: 'pick_1', label: 'Labo Bastille', isDefault: true },
  { id: 'pick_2', label: 'Labo Nation', isDefault: false },
] as unknown as readonly PickupAddressView[];

const DELIVERIES = [
  { id: 'addr_1', label: 'Boutique', isDefault: true },
  { id: 'addr_2', label: 'Entrepôt', isDefault: false },
] as unknown as readonly DeliveryAddressView[];

describe('destinations proposées', () => {
  it('propose les POINTS DE RETRAIT en retrait', () => {
    const options = namedDestinations({
      method: 'pickup',
      pickups: PICKUPS,
      deliveries: DELIVERIES,
    });

    expect(options).toEqual([
      { value: 'pick_1', label: 'Labo Bastille (défaut)' },
      { value: 'pick_2', label: 'Labo Nation' },
    ]);
  });

  it('bascule vers les ADRESSES DE LA SOCIÉTÉ en livraison', () => {
    const options = namedDestinations({
      method: 'delivery',
      pickups: PICKUPS,
      deliveries: DELIVERIES,
    });

    expect(options.map((o) => o.value)).toEqual(['addr_1', 'addr_2']);
  });

  it("ne propose RIEN tant qu'aucune méthode n'est posée", () => {
    // Il n'y a pas encore de question à laquelle répondre.
    expect(namedDestinations({ method: null, pickups: PICKUPS, deliveries: DELIVERIES })).toEqual(
      [],
    );
  });

  it('met « le défaut » en tête, comme une option à part entière', () => {
    // Désigner nommément le point par défaut d'aujourd'hui figerait la
    // préférence sur lui le jour où il change.
    const options = fulfillmentDestinations({
      method: 'pickup',
      pickups: PICKUPS,
      deliveries: DELIVERIES,
      defaultLabel: 'Celui par défaut',
    });

    expect(options[0]).toEqual({ value: DEFAULT_DESTINATION, label: 'Celui par défaut' });
    expect(options).toHaveLength(3);
  });
});

describe('destination retenue', () => {
  it('lit le pointeur de la méthode courante', () => {
    expect(
      destinationOf({ method: 'pickup', pickupAddressId: 'pick_2', deliveryAddressId: null }),
    ).toBe('pick_2');
    expect(
      destinationOf({ method: 'delivery', pickupAddressId: null, deliveryAddressId: 'addr_2' }),
    ).toBe('addr_2');
  });

  it("rend « le défaut » quand rien n'est pointé", () => {
    expect(
      destinationOf({ method: 'pickup', pickupAddressId: null, deliveryAddressId: null }),
    ).toBe(DEFAULT_DESTINATION);
  });

  it("IGNORE le pointeur de l'autre méthode", () => {
    // Un état incohérent venu de la base ne doit pas se voir à l'écran.
    expect(
      destinationOf({ method: 'pickup', pickupAddressId: null, deliveryAddressId: 'addr_1' }),
    ).toBe(DEFAULT_DESTINATION);
  });
});

describe('préférence après un geste', () => {
  /** Une société qui livre chez elle et exige la signature. */
  const SIGNING: FulfillmentPreferenceView = {
    method: 'delivery',
    pickupAddressId: null,
    deliveryAddressId: 'addr_1',
    signatureRequired: true,
  };

  it('repart du DÉFAUT quand la méthode change', () => {
    // Une adresse de livraison ne désigne pas un point de retrait ; la garder
    // « au cas où » la ferait ressurgir des mois plus tard, non revalidée.
    expect(preferenceForMethod('pickup', SIGNING)).toEqual({
      method: 'pickup',
      pickupAddressId: null,
      deliveryAddressId: null,
      signatureRequired: true,
    });
  });

  it('garde le socle de signature à travers un changement de méthode', () => {
    // Ce qu'un geste sur l'acheminement remet à zéro, ce sont les DESTINATIONS.
    // Le socle est un autre axe : le client qui repasse en livraison retrouve
    // son exigence, pas l'adresse qu'il avait quittée.
    expect(preferenceForMethod('pickup', SIGNING).signatureRequired).toBe(true);
    expect(preferenceForDestination('pickup', 'pick_1', SIGNING).signatureRequired).toBe(true);
    expect(noPreference(SIGNING).signatureRequired).toBe(true);
  });

  it('ne renseigne QUE le pointeur de la méthode choisie', () => {
    expect(preferenceForDestination('delivery', 'addr_2', SIGNING)).toEqual({
      method: 'delivery',
      pickupAddressId: null,
      deliveryAddressId: 'addr_2',
      signatureRequired: true,
    });
    expect(preferenceForDestination('pickup', 'pick_1', SIGNING)).toEqual({
      method: 'pickup',
      pickupAddressId: 'pick_1',
      deliveryAddressId: null,
      signatureRequired: true,
    });
  });

  it('traduit « celle par défaut » en pointeur NUL', () => {
    expect(
      preferenceForDestination('pickup', DEFAULT_DESTINATION, SIGNING).pickupAddressId,
    ).toBeNull();
  });

  it('sait ne plus rien préférer — sans toucher au socle', () => {
    expect(noPreference(SIGNING)).toEqual({
      method: null,
      pickupAddressId: null,
      deliveryAddressId: null,
      signatureRequired: true,
    });
  });
});
