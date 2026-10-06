import type {
  DeliveryContact,
  DeliveryRunSheetStopView,
  DeliveryRunSheetView,
  GpsPoint,
  HandoverQueueState,
  HandoverQueueWindowView,
} from '@lfd/contracts';

import { fulfillmentWindowLabel, timeLabel } from '../shared/window-label';

/**
 * Les dérivations pures de la feuille de route du jour
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 1).
 *
 * Toutes type-only sur le contrat : une valeur importée de `@lfd/contracts`
 * tirerait zod dans le paquet de la page pour trois comparaisons.
 */

const MINUTES_PER_HOUR = 60;

/** Le jour de Paris d'un instant, `AAAA-MM-JJ` — l'horloge du poste, faute de mieux. */
export function parisDayOf(instant: Date): string {
  // `en-CA` écrit la date en ISO ; le fuseau est celui du fournil, pas du poste.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** `AAAA-MM-JJ` décalé de `days` jours, compté en UTC sur la date seule (pas d'heure d'été). */
export function shiftDay(isoDay: string, days: number): string {
  const [year, month, day] = isoDay.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days))
    .toISOString()
    .slice(0, 10);
}

/** Une date de requête plausible — `AAAA-MM-JJ` : le champ date peut rendre vide. */
export function isServiceDay(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(raw);
}

/** Le paramètre d'URL qui porte le jour affiché — `?jour=AAAA-MM-JJ`. */
export const DAY_QUERY_PARAM = 'jour';

/**
 * Le jour lu dans l'URL, ou `null` s'il n'y en a pas ou qu'il ne désigne pas
 * un vrai jour du calendrier (`2026-13-45` a la forme et pas le sens) : la page
 * retombe alors sur son défaut, sans erreur — un lien abîmé ouvre quand même.
 */
export function dayOfQuery(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || !isServiceDay(raw)) {
    return null;
  }
  // Un jour qui déborde (31 février) est normalisé par `Date` : il ne se relit pas à l'identique.
  return shiftDay(raw, 0) === raw ? raw : null;
}

function minutesOf(time: string): number {
  const match = /^(\d{1,2}):(\d{2})/u.exec(time);
  return match === null
    ? Number.MAX_SAFE_INTEGER
    : Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
}

/** Rang d'une fenêtre : avec début d'abord, puis « avant X », puis sans fenêtre. */
function windowRank(window: HandoverQueueWindowView | null): readonly [number, number] {
  if (window === null) {
    return [2, 0];
  }
  return window.start === null ? [1, minutesOf(window.end)] : [0, minutesOf(window.start)];
}

/**
 * L'ordre de la tournée : par début de fenêtre ; une fenêtre sans début
 * (« avant 10 h ») ensuite, par sa fin ; sans fenêtre à la fin. À égalité, la
 * référence — un ordre stable d'une impression à l'autre.
 */
export function sortStops(
  stops: readonly DeliveryRunSheetStopView[],
): readonly DeliveryRunSheetStopView[] {
  return [...stops].sort((a, b) => {
    const [groupA, minuteA] = windowRank(a.window);
    const [groupB, minuteB] = windowRank(b.window);
    return groupA - groupB || minuteA - minuteB || a.reference.localeCompare(b.reference, 'fr');
  });
}

/** « 8 h 30 » à partir de « 08:30 » — l'écriture commune, réexportée pour les lecteurs de ce module. */
export { timeLabel };

/**
 * « 20 min sur place » quand l'adresse a son propre temps de livraison
 * (L7b-C4) ; `null` quand elle suit le réglage général — rien à signaler.
 */
export function onSiteLabelOf(stop: DeliveryRunSheetStopView): string | null {
  const minutes = stop.addressBook?.stopMinutes;
  return minutes === undefined ? null : `${String(minutes)} min sur place`;
}

/** « 8 h 00 – 10 h 00 », « avant 10 h 00 », ou « Sans créneau ». */
export function windowLabel(window: HandoverQueueWindowView | null): string {
  if (window === null) {
    return 'Sans créneau';
  }
  return fulfillmentWindowLabel(window);
}

/** Ce que dit l'état du bac, et sa couleur de badge. */
export interface StateLabel {
  readonly label: string;
  readonly variant: 'neutral' | 'info' | 'success' | 'warning';
}

const STATE_LABELS: Readonly<Record<HandoverQueueState, StateLabel>> = {
  expected: { label: 'À coliser', variant: 'warning' },
  ready: { label: 'Colisé', variant: 'info' },
  handed_over: { label: 'Remis', variant: 'success' },
  cancelled: { label: 'Annulé', variant: 'neutral' },
};

export function stateLabelOf(state: HandoverQueueState): StateLabel {
  return STATE_LABELS[state];
}

/** Le nom affiché d'un arrêt : l'enseigne, sinon la raison sociale. */
export function stopTitleOf(stop: DeliveryRunSheetStopView): string {
  return stop.tradeName ?? stop.customerLabel;
}

/** Les lignes postales, sans les champs vides. */
export function addressLinesOf(stop: DeliveryRunSheetStopView): readonly string[] {
  const address = stop.address;
  if (address === null) {
    return [];
  }
  return [address.ligne1, address.ligne2, `${address.codePostal} ${address.ville}`].filter(
    (line) => line.trim() !== '',
  );
}

/** « Prénom Nom ». */
export function contactNameOf(contact: DeliveryContact): string {
  return `${contact.prenom} ${contact.nom}`;
}

/** Le lien `tel:` — espaces et points retirés, le `+` gardé. */
export function telHrefOf(telephone: string): string {
  return `tel:${telephone.replace(/[^\d+]/gu, '')}`;
}

/** Un lien carte universel : ouvre l'appli de navigation du téléphone. */
export function mapHrefOf(gps: GpsPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${String(gps.lat)},${String(gps.lng)}`;
}

/** Les chiffres de l'en-tête. Une commande annulée ne part pas : elle ne compte pas. */
export interface RunSheetSummary {
  readonly deliveries: number;
  readonly packed: number;
  readonly withoutAtelierSheet: number;
}

export function summaryOf(view: DeliveryRunSheetView): RunSheetSummary {
  const live = view.stops.filter((stop) => stop.state !== 'cancelled');
  return {
    deliveries: live.length,
    packed: live.filter((stop) => stop.state === 'ready' || stop.state === 'handed_over').length,
    withoutAtelierSheet: live.filter((stop) => stop.withoutAtelierSheet).length,
  };
}

/** « mercredi 7 octobre » — le jour de service tel qu'on le dit. */
export function longDayOf(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)));
}

/**
 * Le titre-chiffre de la bande : « 14 adresses · 9 colisées ». La partie
 * tournées attend que la vue porte la composition (2026-10-06).
 */
export function headlineOf(summary: RunSheetSummary): string {
  const addresses = `${String(summary.deliveries)} adresse${summary.deliveries > 1 ? 's' : ''}`;
  const packed = `${String(summary.packed)} colisée${summary.packed > 1 ? 's' : ''}`;
  return `${addresses} · ${packed}`;
}
