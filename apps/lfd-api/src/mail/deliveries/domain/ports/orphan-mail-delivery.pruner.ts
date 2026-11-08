import type { PurgeCensus, PurgeTarget } from "../../../../platform/retention/purge-mode.js";

/**
 * Port de **purge** des retours orphelins (`le-suivi-des-e-mails.md`,
 * décision 2) : un retour reçu avant `cutoff` qu'aucune demande ne porte
 * (e-mail parti avant le suivi, ou d'un autre système). Troisième interface
 * de la table, à côté de l'écriture et des lectures (ISP).
 */
export abstract class OrphanMailDeliveryPruner implements PurgeTarget {
  abstract census(cutoff: Date): Promise<PurgeCensus>;
  abstract pruneBatch(cutoff: Date, limit: number): Promise<number>;
}
