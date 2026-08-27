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
    address: 'Route de la Balme, Val d’Isère',
    readyFrom: '7 h',
    discount: 10,
    habitual: true,
    distance: null,
  },
  {
    id: 'village',
    name: 'Le Village',
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
  readonly street: string;
  readonly postcode: string;
  readonly isDefault: boolean;
}

export const SAVED_ADDRESSES: readonly SavedAddress[] = [
  {
    id: 'chalet',
    label: 'Le Chalet',
    street: '18 chemin des Barmettes',
    postcode: '73150',
    isDefault: true,
  },
  {
    id: 'bureau',
    label: 'Bureau',
    street: '4 avenue Olympique',
    postcode: '73150',
    isDefault: false,
  },
];
