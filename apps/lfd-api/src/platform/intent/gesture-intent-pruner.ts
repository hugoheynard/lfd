import type { PurgeCensus, PurgeTarget } from "../retention/purge-mode.js";

/**
 * Port de **purge** du registre des intentions. Une interface à part de
 * `GestureIntentLedger` (ISP) : les gestes réclament et résolvent, seul le
 * passage nocturne supprime.
 */
export abstract class GestureIntentPruner implements PurgeTarget {
  /** Combien d'intentions ont été réclamées avant `cutoff`, et la plus ancienne — sans rien supprimer. */
  abstract census(cutoff: Date): Promise<PurgeCensus>;

  /**
   * Supprime au plus `limit` de ces intentions, les plus anciennes d'abord ;
   * rend combien. Un compte inférieur à `limit` dit qu'il ne reste plus rien.
   */
  abstract pruneBatch(cutoff: Date, limit: number): Promise<number>;
}
