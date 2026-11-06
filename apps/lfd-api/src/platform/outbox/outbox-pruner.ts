import type { PurgeCensus, PurgeTarget } from "../retention/purge-mode.js";

/**
 * Port de **purge** de la boîte d'envoi. Une interface à part du relais et du
 * rejeu (ISP) : seul le passage nocturne en dépend.
 */
export abstract class OutboxPruner implements PurgeTarget {
  /**
   * Combien de messages ont toutes leurs livraisons faites avant `cutoff`, et
   * l'instant du plus ancien — sans rien supprimer.
   */
  abstract census(cutoff: Date): Promise<PurgeCensus>;

  /**
   * Supprime au plus `limit` de ces messages, avec leurs livraisons ; rend
   * combien. Un compte inférieur à `limit` dit qu'il ne reste plus rien.
   */
  abstract pruneBatch(cutoff: Date, limit: number): Promise<number>;
}
