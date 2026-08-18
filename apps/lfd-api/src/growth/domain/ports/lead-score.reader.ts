import type { LeadScoreView } from "@lfd/contracts";

/**
 * Port de **lecture** du read-model `lead_score` (surface séparée de l'écriture,
 * cf. `LeadScoreStore` — ISP). Le cockpit lit **ce read-model matérialisé**, pas
 * le journal brut : les leads déjà scorés et triés, prêts à afficher.
 */
export abstract class LeadScoreReader {
  /** Les `limit` meilleurs coups (score décroissant), la queue du cockpit. */
  abstract topPlays(limit: number): Promise<LeadScoreView[]>;
}
