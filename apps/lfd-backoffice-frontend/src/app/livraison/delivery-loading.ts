import type {
  DeliveryBagView,
  DeliveryLoadingRoundView,
  DeliveryLoadingStopState,
  DeliveryLoadingStopView,
  LoadDeliveryBagPayload,
} from '@lfd/contracts';

/**
 * **Le chargement, en fonctions pures** (`plan-preparation-de-tournee.md`,
 * lot 4, v4). Aucun chiffre n'est RÈGLE ici : l'état d'un arrêt vient du
 * serveur (`state`) ; on ne fait que le dire.
 *
 * Types seulement de `@lfd/contracts` : le schéma zod du code court tirerait
 * zod dans le paquet de la page pour une expression régulière.
 */

/** Le chemin qu'encode le QR d'un sac (L4-C13) — ouvrir montre, un geste charge. */
export const BAG_PATH = '/livraison/sac/';

/** L'adresse absolue d'un sac, telle qu'un appareil photo natif l'ouvrira. */
export function bagUrl(origin: string, bagId: string): string {
  return `${origin.replace(/\/+$/u, '')}${BAG_PATH}${encodeURIComponent(bagId)}`;
}

/** Le code court : six caractères de Crockford base 32 (sans I, L, O, U) — L4-C20. */
const CODE = /^[0-9A-HJKMNP-TV-Z]{6}$/u;

/** Un identifiant de sac dans une adresse : ce que le serveur a tiré, rien d'autre. */
const BAG_IN_URL = /\/livraison\/sac\/([A-Za-z0-9_-]+)(?:[/?#]|$)/u;

/**
 * Le code tapé, remis à la forme de Crockford : majuscules, séparateurs ôtés,
 * et les lettres que l'alphabet exclut lues comme les chiffres qu'elles imitent
 * (O → 0, I et L → 1) — c'est la règle de décodage de Crockford elle-même.
 */
export function normalisedCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/gu, '')
    .replace(/O/gu, '0')
    .replace(/[IL]/gu, '1');
}

/**
 * **Ce qu'un code lu ou tapé désigne**, ou `null`.
 *
 * Deux formes, et rien d'autre : l'adresse d'un sac (`…/livraison/sac/{id}`,
 * le QR), ou le code court (six caractères, tapé quand le QR est illisible).
 *
 * 🔴 Le refus est le point, comme `tokenOf` au comptoir : une étiquette de
 * transporteur ou la feuille d'atelier (`/colisage/…`) n'atteint jamais le
 * réseau. `tokenOf` n'est pas réutilisé — il ne lit que `/retrait/`, et c'est
 * voulu.
 */
export function scannedBag(raw: string): LoadDeliveryBagPayload | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  const inUrl = BAG_IN_URL.exec(trimmed);
  if (inUrl?.[1] !== undefined) {
    return { bagId: inUrl[1] };
  }
  const code = normalisedCode(trimmed);
  return CODE.test(code) ? { code } : null;
}

/** « sac 2 / 3 » — ou « sac annulé », qui n'a plus de rang. */
export function bagIndexLabel(bag: Pick<DeliveryBagView, 'index' | 'total'>): string {
  return bag.index === null ? 'sac annulé' : `sac ${String(bag.index)} / ${String(bag.total)}`;
}

/** Combien de sacs de l'arrêt sont déjà dans le véhicule. */
export function loadedCount(stop: Pick<DeliveryLoadingStopView, 'bags'>): number {
  return stop.bags.filter((bag) => bag.loadedAt !== null).length;
}

/** « 2 sacs sur 3 », « 1 sac sur 1 », « aucun sac déclaré ». */
export function bagCountLabel(stop: Pick<DeliveryLoadingStopView, 'bags'>): string {
  const total = stop.bags.length;
  if (total === 0) {
    return 'aucun sac déclaré';
  }
  const loaded = loadedCount(stop);
  return `${String(loaded)} sac${loaded > 1 ? 's' : ''} sur ${String(total)}`;
}

export interface StopStateLabel {
  readonly label: string;
  readonly variant: 'alert' | 'warning' | 'success';
}

/** L'état d'un arrêt en toutes lettres. 🔴 `unlabelled` en rouge : « Partir » le refuse (L4-C17). */
export function stopStateLabel(state: DeliveryLoadingStopState): StopStateLabel {
  switch (state) {
    case 'unlabelled':
      return { label: 'Aucun sac déclaré', variant: 'alert' };
    case 'partial':
      return { label: 'À charger', variant: 'warning' };
    case 'loaded':
      return { label: 'Chargé', variant: 'success' };
  }
}

/** Ce qui manque encore à un arrêt, dit par référence et enseigne. */
export interface MissingStop {
  readonly stopId: string;
  readonly reference: string;
  readonly customerLabel: string;
  /** « aucun sac déclaré », ou « 1 sac sur 3 » : ce qui reste, en toutes lettres. */
  readonly detail: string;
}

/** Les arrêts qui ne sont pas chargés, dans l'ordre de passage. */
export function missingStops(
  round: Pick<DeliveryLoadingRoundView, 'stops'>,
): readonly MissingStop[] {
  return round.stops
    .filter((stop) => stop.state !== 'loaded')
    .map((stop) => ({
      stopId: stop.stopId,
      reference: stop.reference,
      customerLabel: stop.customerLabel,
      detail: bagCountLabel(stop),
    }));
}

const PARIS_TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: 'numeric',
  minute: '2-digit',
});

/** « 7 h 42 » — l'heure de Paris d'un instant servi. */
export function parisTimeOf(iso: string): string {
  return PARIS_TIME.format(new Date(iso)).replace(':', ' h ');
}
