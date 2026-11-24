import type { ServiceDay } from "../../../day/index.js";
import type { ProvisionalPrint } from "../entities/provisional-print.js";

/**
 * **Écrire les impressions provisoires** (plan
 * `documentation/fournil/plan-impression-provisoire.md`, § 2) — port
 * d'écriture, distinct de la lecture (ISP) : le tirage lit le dernier numéro
 * et écrit le sien, rien d'autre.
 */
export abstract class ProvisionalPrintLedger {
  /** Le dernier numéro tiré pour ce jour, `0` si aucun. */
  abstract lastRunOf(day: ServiceDay): Promise<number>;

  /**
   * Écrit l'impression. `false` quand l'unicité (journée, numéro) refuse :
   * une autre impression a pris ce numéro entre-temps, et l'appelant reprend
   * au suivant. Écrit dans la transaction de l'appelant, s'il en tient une.
   */
  abstract record(print: ProvisionalPrint): Promise<boolean>;
}
