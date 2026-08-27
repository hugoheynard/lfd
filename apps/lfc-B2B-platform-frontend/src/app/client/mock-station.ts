/**
 * La station, telle que la maquette la connaît.
 *
 * ⚠️ Tout ceci viendra du serveur : les points de retrait de la boutique, les
 * zones de la table de livraison, le carnet du compte. C'est rassemblé ici pour
 * qu'il n'y ait qu'un endroit à débrancher — et parce que la remise du Labo et
 * le tarif d'une zone sont des DONNÉES, jamais des constantes de gabarit.
 */

/** Un point de retrait. */
export interface PickupPoint {
  readonly id: string;
  readonly name: string;
  /**
   * Le même lieu au complément : « au Labo ». La ligne de remise du panier le
   * lit tel quel — coller « Remise » devant `name` donnerait « Remise Le Labo ».
   */
  readonly at: string;
  readonly address: string;
  /** L'heure à partir de laquelle la commande est prête. */
  readonly readyFrom: string;
  /** La remise consentie sur le retrait, en pourcentage. Zéro = prix boutique. */
  readonly discount: number;
  /** Le point où l'on va d'habitude — il se nomme au lieu d'afficher sa distance. */
  readonly habitual: boolean;
  readonly distance: string | null;
}

export const PICKUP_POINTS: readonly PickupPoint[] = [
  {
    id: 'labo',
    name: 'Le Labo',
    at: 'au Labo',
    address: 'Route de la Balme, Val d’Isère',
    readyFrom: '7 h',
    discount: 10,
    habitual: true,
    distance: null,
  },
  {
    id: 'village',
    name: 'Le Village',
    at: 'au Village',
    address: '4 avenue Olympique',
    readyFrom: '9 h',
    discount: 0,
    habitual: false,
    distance: '1,6 km',
  },
];

/** Une zone de livraison : ce qu'elle coûte, et pourquoi. */
export interface DeliveryZone {
  readonly postcode: string;
  readonly city: string;
  /** Le nom montré : « Zone 1 · Val d'Isère ». */
  readonly label: string;
  /** Le moyen et le délai — l'explication du tarif. */
  readonly note: string;
  readonly fee: number;
  /** L'encre pour la station, le beurre pour la vallée. */
  readonly tone: 'ink' | 'accent';
}

export const DELIVERY_ZONES: readonly DeliveryZone[] = [
  {
    postcode: '73150',
    city: 'Val d’Isère',
    label: 'Zone 1 · Val d’Isère',
    note: 'Station et hameaux — coursier vélo, 20 min.',
    fee: 20,
    tone: 'ink',
  },
  {
    postcode: '73130',
    city: 'Bourg-Saint-Maurice',
    label: 'Zone 2 · Vallée',
    note: 'Hors station — course dédiée, 45 min.',
    fee: 50,
    tone: 'accent',
  },
];

export function zoneOf(postcode: string): DeliveryZone | null {
  return DELIVERY_ZONES.find((z) => z.postcode === postcode.trim()) ?? null;
}

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

/** Complet : le créneau reste là, il ne se prend pas. */
export function isSlotOpen(slot: OrderSlot): boolean {
  return slot.state !== 'full';
}
