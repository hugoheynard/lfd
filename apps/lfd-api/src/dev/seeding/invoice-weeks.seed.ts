import type { RhythmTimeline } from "../../b2b/accounting/domain/services/invoicing-closures.js";
import {
  closureAfter,
  previousClosureOf,
} from "../../b2b/accounting/domain/services/invoicing-closures.js";
import { defaultDatesOf } from "../../b2b/accounting/domain/value-objects/billing-mode.js";
import { InvoiceSeedTooEarlyError } from "./invoice-seed-errors.js";
import { atHour, shiftDays } from "./order-placing.seed.js";
import { startOfPreviousMonth } from "./sub-account-pricing.seed.js";

/**
 * **Le calendrier du semis des factures** — pur : il reçoit son instant et ne
 * lit aucune horloge.
 *
 * Les payeurs du groupe des Cimes passent en facturation HEBDOMADAIRE : c'est
 * le seul rythme qui donne, avec des dates passées seulement, assez de
 * clôtures pour qu'un site ait une facture par statut (§7.1 du plan
 * `plan-page-mes-factures.md`) — un rejet, une re-présentation, un « réglée »
 * portent chacun sur une LIGNE de prélèvement, donc sur un lot différent.
 *
 * Le changement de mode prend effet à la prochaine clôture MENSUELLE (le 1er) :
 * il se programme la veille du 1er du mois qui contient « il y a six
 * semaines », et jamais avant que la structure des sous-comptes n'existe
 * (posée la veille du mois dernier, `sub-accounts.seed.ts`).
 */

/** Ce qu'une semaine devient — l'issue que la page doit montrer. */
export type WeekFate =
  /** Lot déposé, retour bancaire, puis « réglée autrement ». */
  | "settled"
  /** Lot déposé, retour bancaire, puis re-présentation. */
  | "represented"
  /** Lot déposé, retour bancaire laissé à traiter. */
  | "rejected"
  /** Les deux hôtels suivent la facturation du groupe cette semaine-là. */
  | "group"
  /** Lot déposé, sans retour. */
  | "collected"
  /** Lot constitué, pas encore déposé. */
  | "constituted"
  /** Facture émise, aucun lot. */
  | "issued";

export interface InvoiceWeek {
  /** La clôture hebdomadaire (lundi 00 h, Paris). */
  readonly closesAt: Date;
  /** L'ouverture de la période (la clôture précédente). */
  readonly opensAt: Date;
  readonly fate: WeekFate;
}

export interface InvoiceCalendar {
  /** L'instant où le mode hebdomadaire se programme. */
  readonly modeSetAt: Date;
  /** La clôture mensuelle où il prend effet — et le plancher des deux mises en service. */
  readonly weeklyFrom: Date;
  readonly weeks: readonly InvoiceWeek[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Six semaines : assez de clôtures passées pour tous les statuts. */
const LOOKBACK_DAYS = 42;
/** L'heure (locale) des gestes de structure de `sub-accounts.seed.ts`. */
const STRUCTURE_HOUR = 9;
/** Le dépôt suit la clôture de trois heures : une semaine plus jeune n'est pas encore jouable. */
export const DEPOSIT_DELAY_MS = 3 * HOUR_MS;
/** Les trois issues qui portent un retour bancaire, les plus anciennes semaines. */
const RETURN_FATES: readonly WeekFate[] = ["settled", "represented", "rejected"];
/** Ce qui remplit le milieu, dans cet ordre, puis des semaines prélevées. */
const MIDDLE_FATES: readonly WeekFate[] = ["group", "collected", "constituted"];
const MIN_WEEKS = RETURN_FATES.length + 1;
/** Le jeudi qui précède la clôture du lundi. */
const ORDER_DAYS_BEFORE_CLOSURE = 4;
const ORDER_HOUR = 9;

const MONTHLY: RhythmTimeline = { rhythmAt: () => defaultDatesOf("monthly") };
const WEEKLY: RhythmTimeline = { rhythmAt: () => defaultDatesOf("weekly") };

/**
 * @throws {InvoiceSeedTooEarlyError} moins de quatre clôtures hebdomadaires
 * passées — les statuts à retour ne tiendraient pas.
 */
export function planInvoiceCalendar(now: Date): InvoiceCalendar {
  const structureAt = atHour(shiftDays(startOfPreviousMonth(now), -1), STRUCTURE_HOUR);
  const probe = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
  const monthStart = previousClosureOf(closureAfter(probe, MONTHLY), MONTHLY);
  const earliest = new Date(structureAt.getTime() + HOUR_MS);
  const wanted = new Date(monthStart.getTime() - 14 * HOUR_MS);
  const modeSetAt = wanted.getTime() < earliest.getTime() ? earliest : wanted;
  const weeklyFrom = closureAfter(modeSetAt, MONTHLY);
  const closures = weeklyClosures(weeklyFrom, now);
  if (closures.length < MIN_WEEKS) {
    throw new InvoiceSeedTooEarlyError(closures.length, MIN_WEEKS);
  }
  const fates = fatesFor(closures.length);
  return {
    modeSetAt,
    weeklyFrom,
    weeks: closures.map((closesAt, index) => ({
      closesAt,
      opensAt: closures[index - 1] ?? weeklyFrom,
      fate: fates[index] ?? "collected",
    })),
  };
}

/**
 * Les clôtures hebdomadaires après `from` dont le dépôt est déjà passé. Une
 * première semaine trop courte pour y commander (le jeudi la précède) est
 * sautée : sa commande tomberait sous le plancher, jamais facturée.
 */
function weeklyClosures(from: Date, now: Date): readonly Date[] {
  const closures: Date[] = [];
  for (let cursor = closureAfter(from, WEEKLY); ; cursor = closureAfter(cursor, WEEKLY)) {
    if (cursor.getTime() + DEPOSIT_DELAY_MS > now.getTime()) {
      return closures;
    }
    if (orderInstantOf(cursor).getTime() > from.getTime()) {
      closures.push(cursor);
    }
  }
}

/** La commande de la semaine : passée le jeudi à 9 h, pour le vendredi. */
export function orderInstantOf(closesAt: Date): Date {
  return atHour(new Date(closesAt.getTime() - ORDER_DAYS_BEFORE_CLOSURE * DAY_MS), ORDER_HOUR);
}

/**
 * Les retours d'abord (les semaines les plus anciennes : leur échéance est
 * passée), la dernière semaine émise sans lot, le milieu dans l'ordre de
 * {@link MIDDLE_FATES}.
 */
export function fatesFor(count: number): readonly WeekFate[] {
  const middle = Array.from(
    { length: count - MIN_WEEKS },
    (_, index): WeekFate => MIDDLE_FATES[index] ?? "collected",
  );
  return [...RETURN_FATES, ...middle, "issued"];
}
