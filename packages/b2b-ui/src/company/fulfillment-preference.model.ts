import type {
  DeliveryAddressView,
  FulfillmentMethod,
  FulfillmentPreferenceView,
  PickupAddressView,
} from '@lfd/contracts';

/** Une destination proposée au choix : sa valeur et son libellé. */
export interface FulfillmentDestination {
  readonly value: string;
  readonly label: string;
}

/**
 * La destination « aucune en particulier ».
 *
 * Chaîne vide plutôt que `null` : un listbox traite `null` comme « rien de
 * choisi » et retomberait sur son placeholder, alors que **suivre le défaut est
 * un choix** — et le plus fréquent.
 */
export const DEFAULT_DESTINATION = '';

/**
 * Les destinations **nommées** pour la méthode retenue : les points de retrait
 * de la plateforme, ou les adresses de la société.
 *
 * `null` (aucune méthode posée) ne propose rien : il n'y a pas encore de
 * question à laquelle répondre.
 */
export function namedDestinations(input: {
  readonly method: FulfillmentMethod | null;
  readonly pickups: readonly PickupAddressView[];
  readonly deliveries: readonly DeliveryAddressView[];
}): readonly FulfillmentDestination[] {
  if (input.method === 'pickup') {
    return input.pickups.map((point) => ({ value: point.id, label: labelled(point) }));
  }
  if (input.method === 'delivery') {
    return input.deliveries.map((address) => ({ value: address.id, label: labelled(address) }));
  }
  return [];
}

/**
 * Ce que le choix offre : **suivre le défaut**, puis les destinations nommées.
 *
 * L'entrée « par défaut » est une option à part entière et non un placeholder,
 * parce qu'elle suit le défaut du **moment** : désigner nommément le point par
 * défaut d'aujourd'hui figerait la préférence sur lui le jour où il change.
 */
export function fulfillmentDestinations(input: {
  readonly method: FulfillmentMethod | null;
  readonly pickups: readonly PickupAddressView[];
  readonly deliveries: readonly DeliveryAddressView[];
  readonly defaultLabel: string;
}): readonly FulfillmentDestination[] {
  return [{ value: DEFAULT_DESTINATION, label: input.defaultLabel }, ...namedDestinations(input)];
}

/** La destination retenue par une préférence ; vide = « celle par défaut ». */
export function destinationOf(preference: FulfillmentPreferenceView): string {
  const pointed =
    preference.method === 'pickup' ? preference.pickupAddressId : preference.deliveryAddressId;
  return pointed ?? DEFAULT_DESTINATION;
}

/**
 * La préférence après un changement de **méthode** : la destination repart du
 * défaut.
 *
 * Conserver celle de l'ancienne méthode n'aurait pas de sens — une adresse de
 * livraison ne désigne pas un point de retrait — et la garder « au cas où » la
 * ferait ressurgir des mois plus tard, non revalidée.
 */
export function preferenceForMethod(
  method: FulfillmentMethod,
  from: FulfillmentPreferenceView,
): FulfillmentPreferenceView {
  // On DÉRIVE de la préférence courante au lieu d'en rebâtir une : ce que la
  // méthode remet à zéro se lit alors en trois lignes, et tout le reste — le
  // socle de signature aujourd'hui, le champ d'après demain — survit sans qu'on
  // ait à y penser. Reconstruire de zéro, c'est perdre en silence.
  return { ...from, method, pickupAddressId: null, deliveryAddressId: null };
}

/**
 * La préférence après un choix de **destination**. Le pointeur qui ne concerne
 * pas la méthode reste nul : un seul des deux a un sens à la fois.
 */
export function preferenceForDestination(
  method: FulfillmentMethod,
  chosen: string,
  from: FulfillmentPreferenceView,
): FulfillmentPreferenceView {
  const id = chosen === DEFAULT_DESTINATION ? null : chosen;
  return {
    ...from,
    method,
    pickupAddressId: method === 'pickup' ? id : null,
    deliveryAddressId: method === 'delivery' ? id : null,
  };
}

/** La préférence après un changement du **socle de signature**. */
export function preferenceForSignature(
  signatureRequired: boolean,
  from: FulfillmentPreferenceView,
): FulfillmentPreferenceView {
  return { ...from, signatureRequired };
}

/**
 * Aucune préférence d'ACHEMINEMENT : le choix se refera à chaque commande.
 *
 * Le socle de signature survit — c'est un autre axe. « Je ne veux pas de
 * destination par défaut » ne dit rien sur « on signe toujours », et les
 * effacer ensemble ferait disparaître une exigence sans que personne ne l'ait
 * demandé.
 */
export function noPreference(from: FulfillmentPreferenceView): FulfillmentPreferenceView {
  return { ...from, method: null, pickupAddressId: null, deliveryAddressId: null };
}

/** « Labo Bastille (défaut) » — le défaut se dit, il ne se devine pas. */
function labelled(destination: { readonly label: string; readonly isDefault: boolean }): string {
  return destination.isDefault ? `${destination.label} (défaut)` : destination.label;
}
