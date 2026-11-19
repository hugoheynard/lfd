import type { CounterStockSetting } from "./counter-stock-setting.js";

/** Port d'**écriture** du réglage d'un point : pose la ligne, ou la réécrit. */
export abstract class CounterStockSettingsWriter {
  abstract put(setting: CounterStockSetting): Promise<void>;
}
