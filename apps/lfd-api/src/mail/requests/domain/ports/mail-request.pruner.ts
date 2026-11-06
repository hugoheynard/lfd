import type { PurgeCensus, PurgeTarget } from "../../../../platform/retention/purge-mode.js";

/**
 * Port de **purge** du suivi des envois. Troisième interface de la table, à
 * côté de l'écriture des demandes (ISP) : seul le passage nocturne en dépend.
 */
export abstract class MailRequestPruner implements PurgeTarget {
  /** Combien de demandes sont closes avant `cutoff`, et la plus ancienne issue — sans rien supprimer. */
  abstract census(cutoff: Date): Promise<PurgeCensus>;

  /**
   * Supprime au plus `limit` de ces demandes ; rend combien. Un compte
   * inférieur à `limit` dit qu'il ne reste plus rien à purger.
   */
  abstract pruneBatch(cutoff: Date, limit: number): Promise<number>;
}
