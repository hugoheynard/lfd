import type { StockAlertLevel } from "../domain/stock-alert.js";

/** Déclare (ou redéclare) une rupture ou un stock faible sur un article d'un point. Acte staff. */
export class DeclareStockAlertCommand {
  constructor(
    readonly siteId: string,
    readonly sku: string,
    readonly level: StockAlertLevel,
    readonly staffUserId: string,
  ) {}
}
