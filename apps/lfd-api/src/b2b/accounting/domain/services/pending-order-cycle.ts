import { instantToLocal } from "@lfd/contracts";

import type { BillingCycle } from "./billing-cycle.js";

/**
 * **Où en est la facture** — ce qu'il faut savoir pour dire dans quel cycle
 * un bon PAS ENCORE facturé le sera.
 */
export interface InvoicingProgress {
  /**
   * Le jour de Paris (`AAAA-MM-JJ`) de la mise en service de la facture, ou
   * `null` : un bon livré avant n'est jamais facturé (il se règle sur arrêté).
   */
  readonly floorDay: string | null;
  /**
   * La clôture la plus récente où la facture est PASSÉE — une issue rangée
   * (émise ou signalée), ou une tentative close « émise » / « rien à
   * facturer » — ou `null` si elle n'est encore jamais passée.
   */
  readonly lastRunClosure: Date | null;
}

/**
 * **Le relevé suit la facture** (décision de Hugo, 2026-10-22, « Après ZL »
 * de `plan-zero-faille.md`) : un bon non encore facturé appartient au cycle
 * dont la facture le PRENDRA, et à lui seul.
 *
 * La facture d'une clôture `c` prend tous les bons non facturés livrés avant
 * `c` (`billableOrderWhere(plancher, c)` moins les bons déjà portés par une
 * 380). Un bon non facturé ira donc dans la facture de la première clôture du
 * payeur qui suit sa livraison et où la facture n'est pas encore passée. Avec
 * `R` = `lastRunClosure`, le cycle `[s, c[` le porte si et seulement si :
 *
 * - il est livré avant `c` ;
 * - la facture n'est pas passée à `c` (`c > R`) ;
 * - et soit il est livré dans le cycle (`≥ s`), soit la facture est déjà
 *   passée à `s` (`s ≤ R`) — c'est le bon livré le 31 et constaté après
 *   l'émission d'octobre : il part en novembre.
 *
 * ## Exactement un cycle, jamais deux, jamais aucun
 *
 * Les cycles d'un payeur se suivent sans trou (`c` de l'un = `s` du suivant).
 * Soit `C*` le premier dont la clôture dépasse `R` : sa clôture d'avant est
 * `≤ R`. Un bon livré avant `C*` est dans `C*` seul (`d < c*`, `s* ≤ R`) ;
 * un bon livré dans ou après `C*` est dans son cycle naturel seul (les cycles
 * suivants ont `s > R` et `d < s`). Les cycles d'avant `C*` ont `c ≤ R`.
 * Tenir `R` comme UN instant — pas un ensemble de clôtures passées — est ce qui
 * rend la partition vraie même si une clôture a été sautée.
 *
 * Un bon livré avant le plancher n'est jamais facturé : il reste dans son
 * cycle naturel, quoi que dise `R`.
 *
 * ⚠️ Une PRÉVISION : la comptabilité peut rejouer une clôture passée. Un bon
 * déjà facturé, lui, ne se prévoit pas — il est au cycle de sa facture.
 *
 * @param deliveredDay le jour de Paris de la livraison (`orders.delivered_on`).
 */
export function pendingOrderIsInCycle(
  deliveredDay: string,
  cycle: BillingCycle,
  progress: InvoicingProgress,
): boolean {
  if (deliveredDay >= parisDay(cycle.closesAt)) {
    return false;
  }
  const natural = deliveredDay >= parisDay(cycle.startsAt);
  if (progress.floorDay === null || deliveredDay < progress.floorDay) {
    return natural;
  }
  const { lastRunClosure } = progress;
  if (lastRunClosure !== null && cycle.closesAt.getTime() <= lastRunClosure.getTime()) {
    return false;
  }
  return (
    natural || (lastRunClosure !== null && cycle.startsAt.getTime() <= lastRunClosure.getTime())
  );
}

/**
 * Le plus ancien jour de livraison qu'un bon non facturé du cycle peut porter
 * — la borne basse de la lecture SQL, qui ne fait que restreindre ce que
 * `pendingOrderIsInCycle` tranche ensuite.
 */
export function earliestPendingDay(cycle: BillingCycle, progress: InvoicingProgress): string {
  const startDay = parisDay(cycle.startsAt);
  const { floorDay, lastRunClosure } = progress;
  const catchesUp =
    floorDay !== null &&
    lastRunClosure !== null &&
    cycle.startsAt.getTime() <= lastRunClosure.getTime();
  return catchesUp && floorDay < startDay ? floorDay : startDay;
}

/** Le jour de Paris d'un instant, `AAAA-MM-JJ`. */
export function parisDay(instant: Date): string {
  return instantToLocal(instant).day;
}
