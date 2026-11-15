import { ProductionTrancheSettings } from "../entities/production-tranche-settings.js";
import {
  type DueNeed,
  rangeInTranches,
  type SkuNeeds,
  type TrancheThreshold,
} from "./production-tranches.js";

/**
 * **Les seuils de chaque SKU, rangés par le réglage des tranches** — une
 * fonction pure. Sans réglage posé, les réglages par défaut ; les tranches
 * fixes ne comptent qu'en mode `fixed`.
 *
 * La fiche d'atelier en fait ses paliers, le dossier du jour son calendrier :
 * chacun lit les besoins au commerce et le réglage par son port, puis appelle
 * cette règle.
 */
export function trancheThresholdsBySku(
  due: readonly SkuNeeds<DueNeed>[],
  posed: ProductionTrancheSettings | null,
): ReadonlyMap<string, readonly TrancheThreshold[]> {
  const settings = posed ?? ProductionTrancheSettings.defaults();
  const fixedTranches = settings.mode === "fixed" ? settings.fixedTranches : [];
  return new Map(
    rangeInTranches(due, settings.mode, fixedTranches).map(
      (line) => [line.sku, line.thresholds] as const,
    ),
  );
}
