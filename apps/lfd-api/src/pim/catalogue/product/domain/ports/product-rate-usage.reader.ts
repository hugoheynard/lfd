import type { RateContextTally } from "../../../category/domain/ports/category-rate-usage.reader.js";

/**
 * **Combien de fiches visent chaque taux, contexte par contexte** — ce que
 * la fiche publie pour que la liste des taux dise ce qui les retient.
 * Un couple sans fiche est absent.
 */
export abstract class ProductRateUsageReader {
  abstract tallies(): Promise<readonly RateContextTally[]>;
}
