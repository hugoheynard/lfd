import type { ProductAudienceCounterView } from "@lfd/contracts";

/**
 * Port de **lecture** des compteurs des suggestions DÉCIDÉES — la source
 * `staff` seule, filtrée par la base (RS6).
 *
 * Distinct d'`AudienceCounterReader` (ISP) : celui-là rend tout, pour l'écran
 * des compteurs ; les chiffres par règle n'ont besoin que des gestes `staff`,
 * et les lire tous pour en jeter la plupart en mémoire grossirait avec la
 * boutique, pas avec le nombre de règles.
 */
export abstract class StaffSuggestionCounterReader {
  /** Les compteurs `staff` de `from` à `to` (jours métier, bornes comprises). */
  abstract between(from: string, to: string): Promise<readonly ProductAudienceCounterView[]>;
}
