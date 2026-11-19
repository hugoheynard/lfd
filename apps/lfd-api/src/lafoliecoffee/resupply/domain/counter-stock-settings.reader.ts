import type { CounterStockSetting } from "./counter-stock-setting.js";

/** Port de **lecture** des réglages posés, pour l'écran Réglages › Comptoir. */
export abstract class CounterStockSettingsReader {
  /** Les réglages des points demandés ; un point jamais réglé est absent. */
  abstract of(siteIds: readonly string[]): Promise<ReadonlyMap<string, CounterStockSetting>>;
}
