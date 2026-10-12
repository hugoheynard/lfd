import { addDays, instantToLocal, localToInstant } from "@lfd/contracts";

import { BillingCycleBoundaryError } from "../errors/accounting-errors.js";
import {
  InvalidPeriodClosureError,
  NotABillingClosureError,
} from "../errors/monthly-invoice-errors.js";
import type { BillingRhythmSetting } from "../value-objects/billing-rhythm-setting.js";
import { closureAtOrBefore, nextClosureAfter, type BillingCycle } from "./billing-cycle.js";

/**
 * **La facture par clôture**, sa partie pure (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`,
 * §9 « Sérieux » et §10) : quelle clôture de l'entité se facture, à partir de
 * quand, et quelle période elle ferme.
 *
 * La période facturée n'est plus un mois civil : c'est l'intervalle entre deux
 * clôtures du rythme de l'ENTITÉ. Le mensuel au 1er rend exactement les
 * moments et les bornes de la facture du mois d'avant le rythme.
 *
 * Ni horloge, ni port : l'instant et le rythme sont donnés.
 */

/**
 * L'heure de l'émission, la veille de la clôture, à Paris — 23h55 depuis E4b
 * (Hugo, 2026-10-08) : les bons du soir restent sur leur période. Cinq minutes
 * avant minuit, la plus petite fenêtre que le cron (`55 21,22 * * *`, UTC)
 * tient en heure d'été comme d'hiver ; un bon passé entre 23h55 et minuit va à
 * la facture de la période suivante (arbitré).
 */
export const PERIOD_INVOICE_TIME = "23:55";

/**
 * Au plus tant de clôtures rattrapées par passage : un plancher mal posé ne
 * lance pas des centaines d'émissions d'un coup. Le passage suivant reprend où
 * celui-ci s'est arrêté — la dernière tentée avance.
 */
export const MAX_CLOSURES_PER_PASS = 12;

/** Le rythme en vigueur à un instant — le réglage de l'entité (R2). */
export type RhythmTimeline = Pick<BillingRhythmSetting, "rhythmAt">;

/** Le dernier jour (local) d'une période — la veille de sa clôture, date d'émission. */
export function lastDayOf(closesAt: Date): string {
  return addDays(instantToLocal(closesAt).day, -1);
}

/**
 * L'instant à partir duquel la période qui se clôt à `closesAt` se facture :
 * la veille de la clôture à 23h55, heure de Paris.
 *
 * @throws {BillingCycleBoundaryError} l'heure n'existe pas ce jour-là (jamais à Paris).
 */
export function invoicingMomentOf(closesAt: Date): Date {
  const day = lastDayOf(closesAt);
  const moment = localToInstant(day, PERIOD_INVOICE_TIME);
  if (moment === null) {
    throw new BillingCycleBoundaryError(day, PERIOD_INVOICE_TIME);
  }
  return moment;
}

/**
 * La prochaine clôture de l'entité STRICTEMENT après `instant`, sous le rythme
 * en vigueur à cet instant. Un rythme programmé prend effet à une clôture de
 * l'ancien (`BillingRhythmSetting.change`) : la suite des clôtures n'a donc
 * jamais de trou ni de chevauchement.
 */
export function closureAfter(instant: Date, timeline: RhythmTimeline): Date {
  return nextClosureAfter(instant, timeline.rhythmAt(instant));
}

/**
 * **La clôture précédente RÉELLE** de `closesAt` : celle de l'ancien rythme
 * quand la période qu'elle ferme est la première du nouveau.
 *
 * Sous le rythme de la période, la clôture d'avant peut tomber avant la
 * bascule ; on repart alors d'elle et on suit la suite réelle jusqu'à
 * `closesAt` — la bascule, qui est une clôture de l'ancien rythme, y est.
 */
export function previousClosureOf(closesAt: Date, timeline: RhythmTimeline): Date {
  const justBefore = new Date(closesAt.getTime() - 1);
  const rhythm = timeline.rhythmAt(justBefore);
  const candidate = closureAtOrBefore(justBefore, rhythm);
  if (timeline.rhythmAt(candidate).equals(rhythm)) {
    return candidate;
  }
  let cursor = candidate;
  for (;;) {
    const next = closureAfter(cursor, timeline);
    if (next.getTime() >= closesAt.getTime()) {
      return cursor;
    }
    cursor = next;
  }
}

/**
 * La période que ferme `closesAt` : `[clôture précédente réelle, closesAt[`.
 *
 * @throws {NotABillingClosureError} `closesAt` n'est pas une clôture de l'entité.
 */
export function invoicedPeriodOf(closesAt: Date, timeline: RhythmTimeline): BillingCycle {
  const startsAt = previousClosureOf(closesAt, timeline);
  if (closureAfter(startsAt, timeline).getTime() !== closesAt.getTime()) {
    throw new NotABillingClosureError(closesAt);
  }
  return { startsAt, closesAt };
}

/**
 * **La clôture dont on émet les factures à `now`** : la dernière dont la
 * veille à 23h55 est passée. Clé stable pour « déjà tenté ».
 */
export function closureToInvoice(now: Date, timeline: RhythmTimeline): Date {
  const upcoming = closureAfter(now, timeline);
  return invoicingMomentOf(upcoming).getTime() <= now.getTime()
    ? upcoming
    : previousClosureOf(upcoming, timeline);
}

/**
 * Les clôtures à tenter à `now`, de la plus ancienne à la plus récente : celles
 * qui suivent `after` (la dernière tentée, ou le plancher) jusqu'à la clôture
 * à facturer incluse. Sans `after`, ou s'il ne la précède pas, la seule
 * clôture à facturer. Au plus {@link MAX_CLOSURES_PER_PASS} : les plus
 * anciennes d'abord, le reste au passage suivant.
 */
export function closuresToAttempt(
  now: Date,
  timeline: RhythmTimeline,
  after: Date | null,
): readonly Date[] {
  const current = closureToInvoice(now, timeline);
  if (after === null || after.getTime() >= current.getTime()) {
    return [current];
  }
  const closures: Date[] = [];
  let cursor = closureAfter(after, timeline);
  while (cursor.getTime() <= current.getTime() && closures.length < MAX_CLOSURES_PER_PASS) {
    closures.push(cursor);
    cursor = closureAfter(cursor, timeline);
  }
  return closures;
}

/**
 * Le mois (`AAAA-MM`) du dernier jour de la période — ce que lisent encore le
 * journal (`invoice.signalled`, `invoice.autopilot_ran`) et la colonne
 * « période » des factures. Exact pour le mensuel au 1er ; pour un rythme plus
 * court, le mois où la période s'achève.
 */
export function periodMonthOf(closesAt: Date): string {
  return lastDayOf(closesAt).slice(0, 7);
}

/**
 * L'étiquette d'une période — `AAAAMMJJ`, son DERNIER jour compris (la veille
 * de la clôture, la borne haute étant exclusive) : `20260930` pour la période
 * close le 1er octobre. Deux semaines d'un même mois ne la partagent jamais,
 * ce que faisait l'ancienne `AAAAMM` (R5). Sert aux noms de fichiers et aux
 * libellés de lot (`cycleTagOf`).
 */
export function periodTagOf(closesAt: Date): string {
  return lastDayOf(closesAt).replace(/-/gu, "");
}

/**
 * Lit une clôture demandée (ISO 8601) ; la forme est vérifiée par le
 * contrôleur, l'instant ici.
 *
 * @throws {InvalidPeriodClosureError} la chaîne n'est pas un instant.
 */
export function parsePeriodClosure(raw: string): Date {
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) {
    throw new InvalidPeriodClosureError(raw);
  }
  return instant;
}

const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/**
 * La période en clair, jours locaux et dernier jour inclus : « du 1er au
 * 30 septembre 2026 », « du 28 septembre au 4 octobre 2026 ».
 */
export function periodLabelOf(period: BillingCycle): string {
  const first = splitDay(instantToLocal(period.startsAt).day);
  const last = splitDay(lastDayOf(period.closesAt));
  const lastText = `${dayName(last.day)} ${monthName(last.month)} ${String(last.year)}`;
  if (first.year !== last.year) {
    return `du ${dayName(first.day)} ${monthName(first.month)} ${String(first.year)} au ${lastText}`;
  }
  if (first.month !== last.month) {
    return `du ${dayName(first.day)} ${monthName(first.month)} au ${lastText}`;
  }
  return `du ${dayName(first.day)} au ${lastText}`;
}

function splitDay(day: string): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} {
  return {
    year: Number(day.slice(0, 4)),
    month: Number(day.slice(5, 7)),
    day: Number(day.slice(8, 10)),
  };
}

function dayName(day: number): string {
  return day === 1 ? "1er" : String(day);
}

function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}
