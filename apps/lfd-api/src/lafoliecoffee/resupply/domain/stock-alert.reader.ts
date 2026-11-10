import type { StockAlertSnapshot } from "./stock-alert.js";

/**
 * Port de **lecture** des alertes vivantes — distinct du port d'écriture
 * (ISP) : le comptoir et le fournil les listent, ils ne les mutent pas. Une
 * alerte levée n'y est jamais ; aucune journée n'y entre (une alerte n'expire
 * pas).
 */
export abstract class StockAlertReader {
  /** Les alertes vivantes d'un point, les plus récemment déclarées d'abord. */
  abstract liveForSite(siteId: string): Promise<readonly StockAlertSnapshot[]>;

  /** Les alertes vivantes de tous les points, les plus récemment déclarées d'abord. */
  abstract liveEverywhere(): Promise<readonly StockAlertSnapshot[]>;
}
