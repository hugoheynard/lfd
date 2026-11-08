import type { PurgeCensus, PurgeTarget } from "../../../../platform/retention/purge-mode.js";

/**
 * Port de **purge des demandes d'accord jamais confirmées** (plan de
 * désinscription, règles 18 et 21) : les lignes `pending` demandées avant la
 * frontière (7 jours). Seul le passage nocturne du suivi en dépend, sous son
 * cran (`MAIL_REQUEST_PURGE`). Aucune autre ligne du registre n'est touchée.
 */
export abstract class PendingConsentPruner implements PurgeTarget {
  abstract census(cutoff: Date): Promise<PurgeCensus>;

  /** Supprime au plus `limit` de ces lignes ; rend combien. */
  abstract pruneBatch(cutoff: Date, limit: number): Promise<number>;
}
