import type { DetachedUnpaidRow } from "../ports/detached-unpaid.reader.js";
import type { BillingFollow } from "../ports/statement-billing.reader.js";
import { billedPayerOf } from "./billed-payer.js";

/** Une commande écartée, et le payeur qui la réglait à la commande. */
export interface DetachedUnpaid {
  readonly row: DetachedUnpaidRow;
  readonly payerId: string;
}

/**
 * **Ce qu'une société voit des impayés de sites détachés** (§2.1 quater) :
 * ceux qu'elle a commandés en tant que site, et ceux qu'elle réglait en tant
 * que principal. Le payeur est celui de la commande (`billedPayerOf`) — le
 * suivi d'aujourd'hui n'y entre pas, puisqu'il n'existe plus.
 */
export function detachedUnpaidOf(
  companyId: string,
  rows: readonly DetachedUnpaidRow[],
  follows: readonly BillingFollow[],
): readonly DetachedUnpaid[] {
  return rows
    .map((row) => ({
      row,
      payerId: billedPayerOf(
        { companyId: row.site.id, placedAt: row.placedAt, billedCompanyId: row.billedCompanyId },
        follows,
      ),
    }))
    .filter((entry) => entry.row.site.id === companyId || entry.payerId === companyId);
}
