import type { ProductAudienceCounterView } from "@lfd/contracts";

/**
 * Port de **lecture** des compteurs des suggestions CALCULÉES — la source
 * `data` seule, filtrée par la base (RS6, Hugo, 2026-10-18 : le calculé entre
 * dans l'attribution des commandes).
 *
 * Distinct de `StaffSuggestionCounterReader` (ISP) : l'écran des compteurs du
 * staff n'a pas à lire le calculé, et seuls les résultats lisent les deux.
 */
export abstract class ComputedSuggestionCounterReader {
  /** Les compteurs `data` de `from` à `to` (jours métier, bornes comprises). */
  abstract between(from: string, to: string): Promise<readonly ProductAudienceCounterView[]>;
}
