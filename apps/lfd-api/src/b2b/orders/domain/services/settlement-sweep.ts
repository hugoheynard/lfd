import { addDays, localToInstant } from "@lfd/contracts";

import { SettlementSweepDayError } from "../errors/order-abandon-errors.js";

/**
 * Ce que la clôture d'un jour balaie (plan
 * `documentation/order/plan-abandon-du-reglement.md`, Q5, S6) : les commandes
 * dont le jour de retrait est `serviceDay`, **et** celles qui n'en ont pas et
 * qui ont été passées ce jour-là — à l'heure de Paris, jamais en UTC.
 *
 * `placedFrom` est inclus, `placedBefore` exclu : minuit de Paris à minuit
 * du lendemain, ce qui fait 23 ou 25 heures les jours de bascule.
 */
export interface SettlementSweepWindow {
  readonly serviceDay: string;
  readonly placedFrom: Date;
  readonly placedBefore: Date;
}

const MIDNIGHT = "00:00";

/**
 * Rattache une journée de service à sa fenêtre de passation.
 *
 * @throws {SettlementSweepDayError} le jour n'a pas de minuit lisible à Paris.
 */
export function settlementSweepWindow(serviceDay: string): SettlementSweepWindow {
  const placedFrom = localToInstant(serviceDay, MIDNIGHT);
  const placedBefore = localToInstant(addDays(serviceDay, 1), MIDNIGHT);
  if (placedFrom === null || placedBefore === null) {
    throw new SettlementSweepDayError(serviceDay);
  }
  return { serviceDay, placedFrom, placedBefore };
}
