/**
 * Ce qu'il reste de la station de maquette.
 *
 * 🔴 **Les points de retrait et les zones en sont PARTIS le 2026-09-06.** Ils
 * portaient une remise en pourcentage et des frais en euros flottants, écrits
 * en dur ; ils viennent désormais de `GET /pickup-addresses` et
 * `GET /delivery-zones` (cf. `ServicePoints`), et les montants du panier de
 * `POST /shop/quote`. Le front n'a plus de chiffre d'argent à se tromper.
 *
 * Ce qui reste ici n'a pas de source serveur : le carnet d'adresses du client
 * et la grille de créneaux. Les deux attendent leur route — le carnet existe
 * côté API pour un client CONNECTÉ, ce que la boutique n'est pas encore.
 */

/** Une adresse du carnet. */
export interface SavedAddress {
  readonly id: string;
  readonly label: string;
  /** Le complément, comme pour un point de retrait : « au chalet », « au bureau ». */
  readonly at: string;
  readonly street: string;
  readonly postcode: string;
  readonly isDefault: boolean;
}

export const SAVED_ADDRESSES: readonly SavedAddress[] = [
  {
    id: 'chalet',
    label: 'Le Chalet',
    at: 'au chalet',
    street: '18 chemin des Barmettes',
    postcode: '73150',
    isDefault: true,
  },
  {
    id: 'bureau',
    label: 'Bureau',
    at: 'au bureau',
    street: '4 avenue Olympique',
    postcode: '73150',
    isDefault: false,
  },
];

/**
 * Ce qu'un créneau dit de lui-même. Ce ne sont pas cinq façons d'écrire
 * « libre » : la sortie du four et la seconde fournée expliquent POURQUOI cette
 * heure-là est bonne, et « Labo seulement » dit une restriction sans la punir.
 */
export type OrderSlotState = 'first-batch' | 'free' | 'full' | 'second-batch' | 'labo-only';

/** Le moment de la journée — le fournil travaille en deux temps. */
export type DayPart = 'am' | 'pm';

export interface OrderSlot {
  readonly id: string;
  readonly label: string;
  readonly part: DayPart;
  readonly state: OrderSlotState;
}

/**
 * Les créneaux de demain. Le complet reste AFFICHÉ et inerte, comme le créneau
 * « au four » du rappel : un trou dans une grille se lit comme un bug, un
 * « complet » se lit comme une boulangerie qui a du succès.
 */
export const ORDER_SLOTS: readonly OrderSlot[] = [
  { id: 'a1', label: '7 h – 8 h', part: 'am', state: 'first-batch' },
  { id: 'a2', label: '8 h – 9 h', part: 'am', state: 'full' },
  { id: 'a3', label: '9 h – 10 h', part: 'am', state: 'free' },
  { id: 'a4', label: '10 h – 11 h', part: 'am', state: 'free' },
  { id: 'p1', label: '16 h – 17 h', part: 'pm', state: 'second-batch' },
  { id: 'p2', label: '17 h – 18 h', part: 'pm', state: 'free' },
  { id: 'p3', label: '18 h – 19 h', part: 'pm', state: 'full' },
  { id: 'p4', label: '19 h – 20 h', part: 'pm', state: 'labo-only' },
];

/**
 * **La journée que ces créneaux visent** — demain, au format `AAAA-MM-JJ`.
 *
 * Elle était implicite : le titre disait « demain » et rien ne la portait. Elle
 * ne pouvait pas le rester à partir du moment où la commande part au serveur —
 * `requestedDeliveryDate` y est **obligatoire**, parce que c'est la journée de
 * production.
 *
 * ⚠️ Calculée ici faute de source : les créneaux sont une maquette. Le jour où
 * ils viennent de l'API, la date arrive avec eux et cette fonction disparaît —
 * une journée de production se lit sur le calendrier de la maison, pas sur
 * l'horloge du navigateur du client.
 */
export function slotDate(): string {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  return day.toISOString().slice(0, 10);
}

/** Complet : le créneau reste là, il ne se prend pas. */
export function isSlotOpen(slot: OrderSlot): boolean {
  return slot.state !== 'full';
}
