import type { StockAlertTrace } from "../domain/stock-alert.js";
import type { StockAlertRepository } from "../domain/stock-alert.repository.js";

/**
 * **Le point d'accroche de la réception** (lot R1b) : un article reçu au
 * point lève son alerte vivante, dans la transaction de l'appelant. C'est le
 * SEUL chemin de la levée par réception ; aujourd'hui l'appelle
 * `ReceiveResupplyLineHandler` (vérifié le 2026-10-21). Quand R2 refera la
 * réception (« Réceptionner » d'un geste, un reçu par réassort), c'est ici
 * qu'elle se branchera, une fois par ligne reçue.
 *
 * Une quantité reçue nulle ne lève rien : rien n'est arrivé en vitrine.
 */
export async function liftStockAlertOnReceipt(
  alerts: StockAlertRepository,
  received: { readonly siteId: string; readonly sku: string; readonly quantity: number },
  trace: StockAlertTrace,
): Promise<void> {
  if (received.quantity <= 0) {
    return;
  }
  const live = await alerts.liveFor(received.siteId, received.sku);
  if (live === null) {
    return;
  }
  live.liftOnReceipt(trace);
  await alerts.save(live);
}
