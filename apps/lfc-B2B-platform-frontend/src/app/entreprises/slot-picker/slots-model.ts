import type { Slot } from '@lfd/contracts';

/**
 * Les fonctions **pures** du choix de créneau : comment on écrit un jour, à
 * quelle demi-journée appartient une heure, et comment on regroupe.
 *
 * Toute la mise en forme de date passe par ici, en **Europe/Paris** : le serveur
 * a déjà calculé la lecture locale (`day`, `time`), on ne refait donc jamais de
 * conversion de fuseau — seulement de la typographie.
 */

/** Le filtre de demi-journée. `all` = on ne filtre pas. */
export type SlotPeriod = 'all' | 'morning' | 'afternoon';

/** Frontière matin / après-midi, en heure locale. */
const NOON = 12;

/** Un jour de créneaux, prêt à rendre. */
export interface SlotDay {
  /** Le jour ISO — sert de clé de suivi. */
  readonly day: string;
  /** Comment on l'écrit : « Aujourd'hui », « Demain », « jeudi 14 août ». */
  readonly label: string;
  readonly slots: readonly Slot[];
}

/** La demi-journée d'une heure locale `HH:MM`. */
export function periodOf(time: string): 'morning' | 'afternoon' {
  return Number(time.slice(0, 2)) < NOON ? 'morning' : 'afternoon';
}

/**
 * Comment s'écrit un jour pour quelqu'un qui choisit un rendez-vous.
 *
 * « Aujourd'hui » et « Demain » d'abord : ce sont les deux repères qu'on lit
 * sans réfléchir, et une date brute (`2026-08-14`) demande un effort que
 * personne ne devrait fournir pour cliquer sur une heure. Au-delà, le jour de
 * la semaine reste en tête — c'est lui qui porte la décision, plus que le
 * numéro.
 */
export function dayLabel(day: string, today: string, tomorrow: string): string {
  if (day === today) {
    return "Aujourd'hui";
  }
  if (day === tomorrow) {
    return 'Demain';
  }
  return formatDay(day);
}

/** « jeudi 14 août » — sans l'année, qui n'apporte rien sur un horizon d'un mois. */
function formatDay(day: string): string {
  // Ancré à MIDI UTC : un jour lu à minuit bascule d'un cran selon le fuseau.
  const date = new Date(`${day}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  }).format(date);
}

/**
 * Regroupe les créneaux par jour, filtre sur la demi-journée, et **écarte les
 * jours devenus vides** : une ligne de jour sans une seule heure en dessous
 * n'apprend rien et fait défiler pour rien.
 */
export function groupSlots(
  slots: readonly Slot[],
  period: SlotPeriod,
  today: string,
  tomorrow: string,
): SlotDay[] {
  const byDay = new Map<string, Slot[]>();
  for (const slot of slots) {
    if (period !== 'all' && periodOf(slot.time) !== period) {
      continue;
    }
    const bucket = byDay.get(slot.day);
    if (bucket === undefined) {
      byDay.set(slot.day, [slot]);
    } else {
      bucket.push(slot);
    }
  }
  return [...byDay.entries()].map(([day, daySlots]) => ({
    day,
    label: dayLabel(day, today, tomorrow),
    slots: daySlots,
  }));
}

/**
 * Le **premier créneau ouvert**, écrit en toutes lettres — « demain à 09:00 ».
 *
 * C'est ce qui rend « au plus vite » honnête : sans repère, le client ne sait
 * pas s'il sera rappelé dans l'heure ou la semaine prochaine. Rend `null` quand
 * il n'y a rien à promettre, et on ne promet alors rien.
 */
export function soonestLabel(
  slots: readonly Slot[],
  today: string,
  tomorrow: string,
): string | null {
  const first = slots[0];
  if (first === undefined) {
    return null;
  }
  const day = dayLabel(first.day, today, tomorrow);
  const article = day === "Aujourd'hui" || day === 'Demain' ? '' : 'le ';
  return `${article}${day.toLowerCase()} à ${first.time}`;
}
