import type { StockAlert } from "./stock-alert.js";

/**
 * Port d'**écriture** des alertes de stock : l'agrégat entier, chargé puis
 * rendu. Le point est dans chaque clé — le mur par point : une alerte d'un
 * autre point est `null`. `save` refuse d'écraser une alerte modifiée
 * entre-temps (`StockAlertChangedMeanwhileError`).
 */
export abstract class StockAlertRepository {
  abstract load(siteId: string, alertId: string): Promise<StockAlert | null>;

  /** L'alerte VIVANTE de cet article à ce point, s'il y en a une. */
  abstract liveFor(siteId: string, sku: string): Promise<StockAlert | null>;

  /** Les alertes VIVANTES de ces articles à ce point — une requête pour la réception entière. */
  abstract liveForSkus(siteId: string, skus: readonly string[]): Promise<readonly StockAlert[]>;

  abstract save(alert: StockAlert): Promise<void>;
}
