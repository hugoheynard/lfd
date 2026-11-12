import type { PayerMeansEntry } from "../services/collection-means-timeline.js";

/**
 * Port de LECTURE groupée du moyen d'encaissement (plan
 * `plan-paiement-au-compte-par-virement.md`, V4', K10) : les segments de
 * plusieurs payeurs d'UNE entité, en une lecture — celle que l'émission, le
 * lot et le compte des clients font une fois par clôture, jamais par bon.
 *
 * À part de `PayerCollectionMeansReader` (un payeur, pour la fiche) : ISP,
 * chacun ne dépend que de la lecture qu'il fait.
 */
export abstract class PayersCollectionMeansReader {
  /** Les segments, annulés compris, par payeur ; un payeur absent n'a jamais rien changé. */
  abstract entriesOfPayers(
    legalEntityId: string,
    payerCompanyIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly PayerMeansEntry[]>>;
}
