import type { StaffSuggestionReader } from "@lfd/contracts";

import type { NotServedCause } from "../services/suggestion-alerts.js";

/**
 * Port de **lecture** : pourquoi le catalogue ne sert pas ces articles à une
 * clientèle — retiré, hors de sa gamme, ou masqué. Distinct du lecteur du
 * catalogue servi (ISP) : `resolveMany` dit QUOI est servi, celui-ci dit
 * POURQUOI le reste ne l'est pas, et seule l'alerte (RS10) le demande.
 */
export abstract class NotServedCauseReader {
  /**
   * @param shopSkus des SKU **de vente** que `resolveMany` n'a pas rendus
   * (une ancienne référence se juge comme sa cible).
   * @returns SKU → cause, une entrée par SKU demandé.
   */
  abstract causesOf(
    shopSkus: readonly string[],
    audience: StaffSuggestionReader,
  ): Promise<ReadonlyMap<string, NotServedCause>>;
}
