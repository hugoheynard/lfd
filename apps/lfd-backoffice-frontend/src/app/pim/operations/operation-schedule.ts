import { instantToLocal, localToInstant, weekdayOf } from '@lfd/contracts';
import type { OperationSchedulePayload } from '@lfd/pim-contracts';

/**
 * **Les cinq dates d'une opération, telles qu'on les saisit** — en heure de
 * Paris, un jour et une heure par instant (plan, D2).
 *
 * 🔴 Le fuseau a UNE traduction : `localToInstant` de `@lfd/contracts`, la même
 * que le serveur emploie pour `fin(pickupUntil)`. Jamais un `T00:00Z` collé à
 * un jour — `lint:business-day` scanne ce dossier pour ça : un minuit UTC
 * ouvrirait les commandes à 1 h du matin en hiver, 2 h en été.
 *
 * Ce fichier ne vérifie que la FORME de la saisie — un champ manquant, une
 * heure qui n'existe pas. L'ordre des cinq dates est la règle de l'agrégat
 * `Operation` : le recopier ici ferait deux endroits à corriger, et le refus
 * du serveur se lit déjà en français.
 */
export interface ScheduleDraft {
  readonly announceDay: string;
  readonly announceTime: string;
  /** Vides tous les deux = on commande dès l'annonce (`orderFrom: null`). */
  readonly orderFromDay: string;
  readonly orderFromTime: string;
  readonly orderUntilDay: string;
  readonly orderUntilTime: string;
  /** Des JOURS `AAAA-MM-JJ` : une commande porte un jour de retrait, pas un instant. */
  readonly pickupFrom: string;
  readonly pickupUntil: string;
}

/** Les cinq dates telles qu'une vue les porte. */
export interface ScheduleDates {
  readonly announceFrom: string;
  readonly orderFrom: string | null;
  readonly orderUntil: string;
  readonly pickupFrom: string;
  readonly pickupUntil: string;
}

export type ScheduleReading =
  | { readonly ok: true; readonly payload: OperationSchedulePayload }
  | { readonly ok: false; readonly problem: string };

/** Rien de saisi : aucune date n'est inventée, pas même une heure « raisonnable ». */
export const EMPTY_SCHEDULE: ScheduleDraft = {
  announceDay: '',
  announceTime: '',
  orderFromDay: '',
  orderFromTime: '',
  orderUntilDay: '',
  orderUntilTime: '',
  pickupFrom: '',
  pickupUntil: '',
};

/**
 * L'instant ISO d'une heure de Paris, ou `null` si elle n'existe pas (la nuit
 * du passage à l'heure d'été) ou si la saisie est mal formée.
 *
 * À l'heure ambiguë d'octobre (2 h 30 existe deux fois), `localToInstant`
 * retient la PREMIÈRE — encore en heure d'été.
 */
export function parisInstant(day: string, time: string): string | null {
  return localToInstant(day, time)?.toISOString() ?? null;
}

/** La lecture d'un instant en heure de Paris : ce que l'écran remet dans les champs. */
export function parisMoment(iso: string): { readonly day: string; readonly time: string } {
  return instantToLocal(new Date(iso));
}

/** Les champs d'une opération existante, relus en heure de Paris. */
export function draftOf(dates: ScheduleDates): ScheduleDraft {
  const announce = parisMoment(dates.announceFrom);
  const until = parisMoment(dates.orderUntil);
  const from = dates.orderFrom === null ? null : parisMoment(dates.orderFrom);
  return {
    announceDay: announce.day,
    announceTime: announce.time,
    orderFromDay: from?.day ?? '',
    orderFromTime: from?.time ?? '',
    orderUntilDay: until.day,
    orderUntilTime: until.time,
    pickupFrom: dates.pickupFrom,
    pickupUntil: dates.pickupUntil,
  };
}

/** La saisie, convertie en ce que le serveur attend — ou la phrase qui dit ce qui manque. */
export function readSchedule(draft: ScheduleDraft): ScheduleReading {
  const announce = instantField(draft.announceDay, draft.announceTime, "l'annonce");
  if (!announce.ok) {
    return announce;
  }
  const orderFrom = openingField(draft);
  if (!orderFrom.ok) {
    return orderFrom;
  }
  const until = instantField(draft.orderUntilDay, draft.orderUntilTime, 'la clôture des commandes');
  if (!until.ok) {
    return until;
  }
  if (draft.pickupFrom === '' || draft.pickupUntil === '') {
    return { ok: false, problem: 'Renseignez le premier et le dernier jour de retrait.' };
  }
  return {
    ok: true,
    payload: {
      announceFrom: announce.iso,
      orderFrom: orderFrom.iso,
      orderUntil: until.iso,
      pickupFrom: draft.pickupFrom,
      pickupUntil: draft.pickupUntil,
    },
  };
}

type FieldReading<T> =
  { readonly ok: true; readonly iso: T } | { readonly ok: false; readonly problem: string };

function instantField(day: string, time: string, what: string): FieldReading<string> {
  if (day === '' || time === '') {
    return { ok: false, problem: `Renseignez le jour et l'heure de ${what}.` };
  }
  const iso = parisInstant(day, time);
  return iso === null
    ? {
        ok: false,
        problem:
          `${formatDay(day)} à ${time} n'existe pas à Paris (passage à l'heure d'été) : ` +
          `choisissez une autre heure pour ${what}.`,
      }
    : { ok: true, iso };
}

/** L'ouverture est facultative, mais jamais à moitié : un jour sans heure ne dit pas quand. */
function openingField(draft: ScheduleDraft): FieldReading<string | null> {
  if (draft.orderFromDay === '' && draft.orderFromTime === '') {
    return { ok: true, iso: null };
  }
  if (draft.orderFromDay === '' || draft.orderFromTime === '') {
    return {
      ok: false,
      problem:
        "Pour l'ouverture des commandes, donnez le jour et l'heure — ou laissez les deux vides " +
        "pour qu'on commande dès l'annonce.",
    };
  }
  return instantField(draft.orderFromDay, draft.orderFromTime, "l'ouverture des commandes");
}

const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'] as const;
const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

/**
 * Un jour `AAAA-MM-JJ`, lu à la française : « jeu. 24 déc. 2026 ».
 *
 * Écrit à la main plutôt que par `Intl` : un jour n'a pas de fuseau, et
 * passer par un `Date` obligerait à en choisir un — c'est exactement le piège
 * du minuit UTC. Un jour illisible se rend tel quel.
 */
export function formatDay(day: string): string {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const monthName = month === undefined ? undefined : MONTHS[month - 1];
  if (year === undefined || dayOfMonth === undefined || monthName === undefined) {
    return day;
  }
  return `${WEEKDAYS[weekdayOf(day)] ?? ''} ${String(dayOfMonth)} ${monthName} ${String(year)}`;
}

/** Un instant, lu en heure de Paris : « lun. 21 déc. 2026 à 12:00 ». */
export function formatInstant(iso: string): string {
  const moment = parisMoment(iso);
  return `${formatDay(moment.day)} à ${moment.time}`;
}

/** Une étape du cycle annonce → commande → retrait, prête à lire. */
export interface CycleStep {
  readonly label: string;
  readonly when: string;
}

/** Le cycle d'une opération, dans l'ordre où elle le traverse (plan, D2). */
export function cycleOf(dates: ScheduleDates): readonly CycleStep[] {
  const opens =
    dates.orderFrom === null ? "dès l'annonce" : `à partir du ${formatInstant(dates.orderFrom)}`;
  return [
    { label: 'Annonce', when: `à partir du ${formatInstant(dates.announceFrom)}` },
    { label: 'Commandes', when: `${opens}, jusqu'au ${formatInstant(dates.orderUntil)}` },
    { label: 'Retrait', when: pickupPhrase(dates.pickupFrom, dates.pickupUntil) },
    {
      label: 'Fin',
      when: `tout s'éteint le lendemain du dernier retrait, à minuit (heure de Paris)`,
    },
  ];
}

/** Le retrait sur un jour ou sur une plage. */
export function pickupPhrase(from: string, until: string): string {
  return from === until ? `le ${formatDay(from)}` : `du ${formatDay(from)} au ${formatDay(until)}`;
}
