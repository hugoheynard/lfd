import type {
  DeliveryAddressView,
  FulfillmentWindow,
  PreferredDeadlines,
  Weekday,
} from '@lfd/contracts';

/**
 * **L'heure d'une livraison, à la passation** (plan composition automatique,
 * CA3 et CA1b — 2026-10-03) : ce que le carnet en dit pour le jour livré, et
 * la fenêtre que la commande enverra.
 *
 * 🔴 Types seulement depuis `@lfd/contracts` : `deadlinesFor` et
 * `weekdayOfDate` vivent dans des modules qui embarquent zod, et ce fichier est
 * lu par le parcours de commande. Leurs trois lignes sont refaites ici plutôt
 * que de ramener le baril au démarrage (budget `cloudflare`).
 */

/** Dimanche = 0, l'ordre de `getUTCDay`. */
const WEEKDAY_BY_JS_DAY: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/u;

/** Le jour de la semaine d'une date `YYYY-MM-DD`, lue en UTC : une date nue n'a pas de fuseau. */
export function weekdayOfIsoDate(date: string): Weekday | null {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : (WEEKDAY_BY_JS_DAY[parsed.getUTCDay()] ?? null);
}

/** Les échéances préférées d'un jour — la même lecture que `deadlinesFor` du contrat. */
export function deadlinesOfDay(
  deadlines: PreferredDeadlines | null | undefined,
  day: Weekday | null,
): readonly string[] {
  if (deadlines === null || deadlines === undefined) {
    return [];
  }
  if (deadlines.mode === 'everyday') {
    return deadlines.times;
  }
  return day === null ? [] : (deadlines.byDay[day] ?? []);
}

/**
 * Les créneaux que le CARNET déclare pour ce jour — la même lecture que
 * `slotsFor` du contrat (CA3b, plan composition automatique §14.1) : la liste
 * `slotList` si l'adresse en porte une, sinon l'ancien `slots` lu comme une
 * liste d'un élément.
 */
export function bookSlotsOfDay(
  address: DeliveryAddressView | null,
  day: Weekday | null,
): readonly FulfillmentWindow[] {
  if (address === null) {
    return [];
  }
  const list = address.specs.slotList;
  if (list !== null && list !== undefined) {
    if (list.mode === 'everyday') {
      return list.slots;
    }
    return day === null ? [] : (list.byDay[day] ?? []);
  }
  const slots = address.specs.slots;
  const single = slots.mode === 'everyday' ? slots.slot : day === null ? null : slots.byDay[day];
  return single === null ? [] : [single];
}

/** La clé d'un créneau dans une liste à choisir : `07:00-08:00`. */
export function slotKey(slot: FulfillmentWindow): string {
  return `${slot.start ?? ''}-${slot.end}`;
}

/** Une heure `HH:mm` que le contrat accepte. */
export function isClockTime(time: string): boolean {
  return TIME_HHMM.test(time);
}

/**
 * La fenêtre qu'une livraison enverra, ou `undefined` tant qu'il en manque une.
 *
 * - **échéance** : l'heure choisie, sans début ; omise (`null`) quand le jour
 *   n'en a qu'une — le serveur la reprend ;
 * - **créneau** : `null` quand le carnet en déclare UN SEUL pour ce jour — le
 *   serveur le lit ; plusieurs, celui choisi (`slot`, sa {@link slotKey}) ;
 *   aucun, le créneau tapé, complet (CA3b).
 *
 * `null` = rien à envoyer, le serveur a ce qu'il faut ; `undefined` = la
 * commande ne peut pas partir, il manque une heure (CA1b).
 */
export function deliveryWindowOf(input: {
  readonly mode: 'slot' | 'deadline';
  readonly dayDeadlines: readonly string[];
  readonly daySlots: readonly FulfillmentWindow[];
  readonly deadline: string;
  readonly slot: string;
  readonly slotStart: string;
  readonly slotEnd: string;
}): FulfillmentWindow | null | undefined {
  if (input.mode === 'deadline') {
    if (isClockTime(input.deadline)) {
      return { start: null, end: input.deadline };
    }
    return input.dayDeadlines.length === 1 ? null : undefined;
  }
  if (input.daySlots.length > 0) {
    const picked = input.daySlots.find((slot) => slotKey(slot) === input.slot);
    if (picked !== undefined) {
      return { start: picked.start, end: picked.end };
    }
    return input.daySlots.length === 1 ? null : undefined;
  }
  return isClockTime(input.slotStart) &&
    isClockTime(input.slotEnd) &&
    input.slotStart < input.slotEnd
    ? { start: input.slotStart, end: input.slotEnd }
    : undefined;
}
