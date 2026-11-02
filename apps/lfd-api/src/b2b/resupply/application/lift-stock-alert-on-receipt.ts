import type { StockAlertTrace } from "../domain/stock-alert.js";
import type { StockAlertRepository } from "../domain/stock-alert.repository.js";

/** Un article reçu au point, avec sa quantité reçue. */
export interface ReceivedArticle {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * **Le point d'accroche de la réception** (les alertes de stock, R1b) : les articles reçus au
 * point lèvent leurs alertes vivantes, dans la transaction de l'appelant.
 * C'est le SEUL chemin de la levée par réception ; l'appellent
 * `ReceiveSiteResupplyHandler` (« Réceptionner », toutes les lignes d'un
 * coup, la réception en un geste, R2) et `ReceiveResupplyLineHandler` (le réassort sans commande,
 * une ligne) — vérifié le 2026-11-02.
 *
 * Les alertes vivantes sont lues en UNE requête pour tous les articles
 * (audit du réassort, 2026-11-02 : une lecture par ligne auparavant) ; seule
 * une alerte effectivement levée s'écrit, sous sa version.
 *
 * Une quantité reçue nulle ne lève rien : rien n'est arrivé en vitrine.
 */
export async function liftStockAlertsOnReceipt(
  alerts: StockAlertRepository,
  siteId: string,
  received: readonly ReceivedArticle[],
  trace: StockAlertTrace,
): Promise<void> {
  const skus = [...new Set(received.filter((line) => line.quantity > 0).map((line) => line.sku))];
  if (skus.length === 0) {
    return;
  }
  for (const live of await alerts.liveForSkus(siteId, skus)) {
    live.liftOnReceipt(trace);
    await alerts.save(live);
  }
}
