import type { CancelledOrdersReader } from "../domain/ports/cancelled-orders.reader.js";
import type { OrderBudgetCommitmentsReader } from "../domain/ports/order-budget-commitments.reader.js";
import type { OrderRowsLock } from "../domain/ports/order-rows-lock.js";
import {
  groupOrderIds,
  withoutCancelled,
  withoutMovedCommitments,
} from "../domain/services/invoice-group-under-lock.js";
import type { PayerInvoicePlan } from "../domain/services/monthly-invoicing.js";

/** Ce que la relecture d'un groupe sous verrou lit. */
export interface LiveGroupReaders {
  readonly rows: OrderRowsLock;
  readonly cancelled: CancelledOrdersReader;
  readonly commitments: OrderBudgetCommitmentsReader;
}

/**
 * **Le groupe d'une clôture sous le verrou de ses lignes `orders`**, moins
 * ses annulées et moins les bons dont l'engagement a été corrigé depuis la
 * préparation (C5.3, E4″) ; `null` s'il est vide. La facture et le devis
 * rangé à la clôture le relisent de la même façon. La correction
 * d'engagement prend le même verrou : elle passe avant (le bon sort d'ici)
 * ou attend la pièce.
 */
export async function liveGroupUnderLock(
  readers: LiveGroupReaders,
  planned: PayerInvoicePlan,
): Promise<PayerInvoicePlan | null> {
  const ids = groupOrderIds(planned);
  await readers.rows.lockAll(ids);
  // `cancelledAmong` rend des NUMÉROS de commande, pas des identifiants.
  const cancelledNumbers = await readers.cancelled.cancelledAmong(ids);
  const live = withoutCancelled(planned, new Set(cancelledNumbers));
  if (live === null) {
    return null;
  }
  return withoutMovedCommitments(live, await readers.commitments.commitmentsOf(ids));
}
