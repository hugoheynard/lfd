import type {
  DeliveryAddressView,
  FulfillmentPreferenceView,
  PickupAddressView,
} from '@lfd/contracts';

/** Adresse de livraison, telle que le panier la manipule (champs postaux nus). */
export interface CourierAddress {
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
}

/**
 * Le choix « une autre adresse » — celle qu'on remplit à la volée, sans
 * l'enregistrer sur la société. C'est le seul choix possible quand on commande
 * sans compte, et il reste offert à ceux qui en ont un : une livraison
 * exceptionnelle (un chalet loué, un événement) n'a rien à faire dans le carnet
 * d'adresses.
 */
export const NEW_ADDRESS = '';

export const EMPTY_ADDRESS: CourierAddress = {
  ligne1: '',
  ligne2: '',
  codePostal: '',
  ville: '',
};

/** Une adresse enregistrée, réduite à ce que le panier livre. */
export function courierFrom(address: DeliveryAddressView): CourierAddress {
  return {
    ligne1: address.ligne1,
    ligne2: address.ligne2,
    codePostal: address.codePostal,
    ville: address.ville,
  };
}

/** Ce qu'un choix propose : l'entrée à la volée, puis les adresses du carnet. */
export interface AddressOption {
  readonly value: string;
  readonly label: string;
}

/** Étiquette d'une adresse enregistrée : son libellé, sinon sa rue et sa ville. */
export function addressLabel(address: DeliveryAddressView): string {
  const postal = `${address.ligne1}, ${address.codePostal} ${address.ville}`;
  return address.label === '' ? postal : `${address.label} — ${postal}`;
}

/**
 * Les adresses proposées au panier : celles de la société d'abord (la défaut en
 * tête, l'API les rend déjà ainsi), puis « une autre adresse ». L'entrée à la
 * volée ferme la liste plutôt que de l'ouvrir : sur un compte qui a un carnet,
 * la livraison habituelle est de loin le cas courant.
 */
export function addressOptions(deliveries: readonly DeliveryAddressView[]): AddressOption[] {
  return [
    ...deliveries.map((address) => ({ value: address.id, label: addressLabel(address) })),
    { value: NEW_ADDRESS, label: 'Une autre adresse…' },
  ];
}

/** Étiquette d'un point de retrait dans le choix du panier. */
export function pickupLabel(point: PickupAddressView): string {
  return `${point.label || point.ville} — ${point.ligne1}, ${point.codePostal} ${point.ville}`;
}

/** Ce que le panier retient d'une préférence : sa méthode et sa destination. */
export interface FulfillmentChoice {
  readonly method: 'delivery' | 'pickup';
  /** Point de retrait choisi, ou `''` = le point par défaut de la plateforme. */
  readonly pickupId: string;
  /** Adresse choisie, ou {@link NEW_ADDRESS} = saisie à la volée. */
  readonly addressId: string;
}

/**
 * Traduit la **préférence** d'une société en position de départ du panier, ou
 * `null` s'il n'y a rien à appliquer.
 *
 * Deux règles portent tout le sens :
 * - un pointeur `null` veut dire **« la défaut du moment »**, jamais « celle qui
 *   l'était le jour où j'ai posé la préférence » — on résout donc à l'exécution,
 *   sur le carnet tel qu'il est aujourd'hui ;
 * - une préférence de **livraison** ne s'applique pas si la plateforme a fermé
 *   le service : mieux vaut ouvrir sur le retrait que sur un mode qu'on ne rend
 *   pas.
 */
export function preferredChoice(
  preference: FulfillmentPreferenceView,
  deliveries: readonly DeliveryAddressView[],
  deliveryOffered: boolean,
): FulfillmentChoice | null {
  if (preference.method === null) {
    return null;
  }
  if (preference.method === 'pickup') {
    return {
      method: 'pickup',
      pickupId: preference.pickupAddressId ?? '',
      addressId: NEW_ADDRESS,
    };
  }
  if (!deliveryOffered) {
    return null;
  }
  return {
    method: 'delivery',
    pickupId: '',
    addressId: preferredAddressId(preference.deliveryAddressId, deliveries),
  };
}

/**
 * L'adresse visée : celle que la préférence désigne si elle existe encore, la
 * défaut du carnet sinon. Une adresse supprimée ne doit pas figer le panier sur
 * un id fantôme — il rendrait le choix vide sans rien expliquer.
 */
function preferredAddressId(
  pointed: string | null,
  deliveries: readonly DeliveryAddressView[],
): string {
  if (pointed !== null && deliveries.some((address) => address.id === pointed)) {
    return pointed;
  }
  return deliveries.find((address) => address.isDefault)?.id ?? deliveries[0]?.id ?? NEW_ADDRESS;
}
