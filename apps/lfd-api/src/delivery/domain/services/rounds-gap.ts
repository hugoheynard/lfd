import { deliveryDayLabel } from "./plan-arrested-words.js";

/** Le jour de livraison est aujourd'hui, ou demain. */
export type DeliveryDayDue = "today" | "tomorrow";

/**
 * L'heure, à Paris, à partir de laquelle la veille d'un jour de livraison
 * sonne la cloche « hors tournée » : 16 h (décision du 2026-10-06, sur carte
 * blanche d'Hugo). Assez tard pour que le plan soit arrêté et qu'on ait pu
 * composer ; assez tôt pour que le bureau soit encore là. Aucun réglage de la
 * livraison ne porte une heure voisine — celle d'alerte du fournil est
 * hors de portée (vérifié le 2026-10-06) —, d'où une constante.
 */
export const ROUNDS_GAP_BELL_TIME = "16:00";

/** Le moment local de Paris, déjà découpé par l'appelant. */
export interface LocalNow {
  /** `AAAA-MM-JJ`. */
  readonly today: string;
  /** Le lendemain de `today`, `AAAA-MM-JJ`. */
  readonly tomorrow: string;
  /** `HH:MM`. */
  readonly time: string;
}

/** Le jour est-il imminent ? `null` : ni aujourd'hui, ni demain. */
export function dueOf(day: string, now: LocalNow): DeliveryDayDue | null {
  if (day === now.today) {
    return "today";
  }
  return day === now.tomorrow ? "tomorrow" : null;
}

/**
 * Les jours que la cloche regarde maintenant : aujourd'hui toujours, demain
 * à partir de {@link ROUNDS_GAP_BELL_TIME}. Les heures `HH:MM` se comparent
 * comme des chaînes.
 */
export function daysToWatch(now: LocalNow): readonly string[] {
  return now.time >= ROUNDS_GAP_BELL_TIME ? [now.today, now.tomorrow] : [now.today];
}

/**
 * Faut-il prévenir ? Le plan est arrêté (la liste est figée) et des
 * livraisons du jour ne sont dans aucune tournée enregistrée — aucune
 * tournée appliquée compte aussi : tout est alors hors tournée.
 */
export function isRoundsGap(input: {
  readonly closedAt: Date | null;
  readonly unplacedCount: number;
}): boolean {
  return input.closedAt !== null && input.unplacedCount > 0;
}

const DUE_WORDS: Readonly<Record<DeliveryDayDue, string>> = {
  today: "Aujourd'hui",
  tomorrow: "Demain",
};

function deliveries(count: number): string {
  return count > 1 ? `${String(count)} livraisons` : `${String(count)} livraison`;
}

/** Ce que dit la cloche « hors tournée » — un sujet et une ligne. */
export function roundsGapWords(input: {
  readonly serviceDay: string;
  readonly due: DeliveryDayDue;
  readonly unplacedCount: number;
}): { readonly subject: string; readonly body: string } {
  return {
    subject: `${DUE_WORDS[input.due]}, ${deliveryDayLabel(input.serviceDay)} : ${deliveries(input.unplacedCount)} hors tournée`,
    body: "Le plan est arrêté. Ouvrez Organisation de tournées : « Proposer les tournées » ou « Placer ici », puis appliquez.",
  };
}
