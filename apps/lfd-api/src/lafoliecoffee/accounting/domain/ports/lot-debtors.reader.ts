import type { LotDebtorLine } from "../services/lot-debtor-bank-standing.js";

/**
 * Port de LECTURE : les débiteurs de quelques lots d'une entité — leur
 * mandat et la RUM figée sur la ligne (P4 révisé, plan
 * `plan-page-procedure-de-prelevement.md`). Séparé de
 * `CollectionBatchReader` : la vue d'un lot n'expose pas ses mandats, et
 * seule la procédure en a besoin.
 */
export abstract class LotDebtorsReader {
  /** Les lignes des lots demandés, murées par l'entité ; un lot d'une autre entité ne rend rien. */
  abstract ofBatches(
    legalEntityId: string,
    batchIds: readonly string[],
  ): Promise<readonly LotDebtorLine[]>;
}
