import { addDays } from "@lfd/contracts";

import { InvalidOrderListDayError } from "../../domain/errors/admin-order-list-errors.js";
import { InvertedOrderDayRangeError } from "../../domain/errors/order-summary-errors.js";

/** Les bornes du filtre de jour, vérifiées. */
export interface CompanyOrderDayRange {
  readonly from: string | null;
  readonly to: string | null;
}

/**
 * Le filtre de jour de « Mes commandes »
 * (`plan-recapitulatif-des-commandes.md`, §6.6). Le contrat n'a vérifié que
 * la forme `AAAA-MM-JJ` ; ici, le jour doit exister au calendrier
 * (`addDays(day, 0)` normalise `2026-02-30` en `2026-03-02`) et le début ne
 * peut suivre la fin. Les jours se comparent comme des chaînes ISO.
 */
export function companyOrderDayRangeOf(
  from: string | null,
  to: string | null,
): CompanyOrderDayRange {
  const checkedFrom = from === null ? null : existingDay("from", from);
  const checkedTo = to === null ? null : existingDay("to", to);
  if (checkedFrom !== null && checkedTo !== null && checkedFrom > checkedTo) {
    throw new InvertedOrderDayRangeError(checkedFrom, checkedTo);
  }
  return { from: checkedFrom, to: checkedTo };
}

function existingDay(field: string, day: string): string {
  if (addDays(day, 0) !== day) {
    throw new InvalidOrderListDayError(field, day);
  }
  return day;
}
