import type { CounterStockTracking } from "../domain/counter-stock-tracking.js";
import { StockTrackingDisabledError } from "../domain/counter-stock-settings-errors.js";

/**
 * Refuse la déclaration d'un stock faible ou d'une rupture sur un point qui
 * ne suit pas son stock (Réglages › Comptoir). La levée à la main, elle,
 * reste permise : une alerte ouverte doit pouvoir se fermer.
 */
export async function assertStockTracked(
  tracking: CounterStockTracking,
  siteId: string,
): Promise<void> {
  if (!(await tracking.isTrackedAt(siteId))) {
    throw new StockTrackingDisabledError(siteId);
  }
}
