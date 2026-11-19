import type { CounterStockTracking } from "../domain/counter-stock-tracking.js";
import { StockTrackingDisabledError } from "../domain/counter-stock-settings-errors.js";

/**
 * Refuse un geste qui pose OK · Faible · Rupture sur un point qui ne suit
 * pas son stock (Réglages › Comptoir). Partagé par la déclaration et la
 * levée à la main.
 */
export async function assertStockTracked(
  tracking: CounterStockTracking,
  siteId: string,
): Promise<void> {
  if (!(await tracking.isTrackedAt(siteId))) {
    throw new StockTrackingDisabledError(siteId);
  }
}
