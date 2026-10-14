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
 * `slotsFor` du contrat (CA3b, plan composition automatique §14.1). Ne lit
 * que `slotList` depuis le retrait de l'ancien créneau unique (`plan-retrait-slots.md`).
 */
export function bookSlotsOfDay(
  address: DeliveryAddressView | null,
  day: Weekday | null,
): readonly FulfillmentWindow[] {
  if (address === null) {
    return [];
  }
  const list = address.specs.slotList;
  if (list.mode === 'everyday') {
    return list.slots;
  }
  return day === null ? [] : (list.byDay[day] ?? []);
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
 * - **échéance** : l'heure choisie, sans début ;
 * - **créneau** : celui choisi parmi ceux du carnet (`slot`, sa
 *   {@link slotKey}) ; aucun au carnet, le créneau tapé, complet (CA3b).
 *
 * 🔴 **Plus de reprise silencieuse** (Hugo, 2026-10-14 : « pas de commande
 * sans créneau »). Une seule échéance, un seul créneau au carnet ce jour-là
 * rendaient `null` — « le serveur la reprend » — et le client passait sans
 * avoir rien choisi. Il la choisit maintenant dans la liste, même seule.
 */
export function deliveryWindowOf(input: {
  readonly mode: 'slot' | 'deadline';
  readonly daySlots: readonly FulfillmentWindow[];
  readonly deadline: string;
  readonly slot: string;
  readonly slotStart: string;
  readonly slotEnd: string;
}): FulfillmentWindow | undefined {
  if (input.mode === 'deadline') {
    return isClockTime(input.deadline) ? { start: null, end: input.deadline } : undefined;
  }
  if (input.daySlots.length > 0) {
    const picked = input.daySlots.find((slot) => slotKey(slot) === input.slot);
    return picked === undefined ? undefined : { start: picked.start, end: picked.end };
  }
  return isClockTime(input.slotStart) &&
    isClockTime(input.slotEnd) &&
    input.slotStart < input.slotEnd
    ? { start: input.slotStart, end: input.slotEnd }
    : undefined;
}
