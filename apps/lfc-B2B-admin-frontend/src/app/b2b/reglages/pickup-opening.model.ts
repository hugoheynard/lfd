import type { FulfillmentWindow, PickupOpening } from '@lfd/contracts';
import { formatTimeRange, type HoursEntry } from '@lfd/b2b-ui/hours';

/**
 * Le pont entre les **heures d'un point de retrait** (le contrat) et les plages
 * nommées du socle `@lfd/b2b-ui/hours` (l'écran).
 *
 * Les deux fenêtres restent **nommées et séparées** — c'est le contrat
 * (`pickupOpeningSchema`), pas une commodité d'écran : entre le créneau pro et
 * l'ouverture au public il peut y avoir une porte close, et les aplatir
 * inventerait une disponibilité qui n'existe pas. Le socle ne les fusionne
 * jamais non plus : il rend les lignes qu'on lui donne, dans l'ordre donné.
 */

/** Le créneau pro en tête : c'est celui qui concerne le client B2B. */
export const OPENING_KEYS = { pro: 'pro', public: 'public' } as const;

/** Les heures vides — un point neuf n'oppose aucune plage. */
export const EMPTY_OPENING: PickupOpening = { publicOpening: null, proPickup: null };

/** Les heures enregistrées → deux lignes éditables, toujours les deux. */
export function openingEntries(opening: PickupOpening): readonly HoursEntry[] {
  return [
    { key: OPENING_KEYS.pro, label: 'Créneau pro', range: rangeOf(opening.proPickup) },
    {
      key: OPENING_KEYS.public,
      label: 'Ouverture au public',
      range: rangeOf(opening.publicOpening),
    },
  ];
}

function rangeOf(window: FulfillmentWindow | null): { start: string; end: string } {
  return { start: window?.start ?? '', end: window?.end ?? '' };
}

/**
 * Les lignes éditées → heures du point.
 *
 * Ici les **deux** bornes sont exigées : une plage d'ouverture se lit « de X à
 * Y ». Le contrat autorise un début absent parce qu'un *client* peut demander
 * « avant 8h » — ce n'est pas la même phrase, et l'admettre dans un réglage
 * ferait ouvrir le point à minuit.
 */
export function toPickupOpening(entries: readonly HoursEntry[]): PickupOpening {
  return {
    proPickup: windowOf(entries, OPENING_KEYS.pro),
    publicOpening: windowOf(entries, OPENING_KEYS.public),
  };
}

function windowOf(entries: readonly HoursEntry[], key: string): FulfillmentWindow | null {
  const range = entries.find((entry) => entry.key === key)?.range;
  if (range === undefined || range.start === '' || range.end === '' || range.start >= range.end) {
    return null;
  }
  return { start: range.start, end: range.end };
}

/**
 * Les plages déclarées, à lire. Liste **vide** = le point n'oppose aucune heure
 * — l'écran doit le dire, parce qu'alors n'importe quelle heure de retrait sera
 * acceptée.
 */
export function openingRows(opening: PickupOpening): readonly HoursEntry[] {
  return openingEntries(opening).filter((entry) => formatTimeRange(entry.range) !== '');
}
