import type { BatchAttestationKind } from "../../domain/services/collection-batch-attestations.js";

/**
 * Atteste un geste fait hors de l'outil sur un lot — contrôle CSV relu,
 * remise signée sur CENET, accusés PSR lus (plan
 * `plan-page-procedure-de-prelevement.md` § 1.2, P3).
 */
export class AttestCollectionBatchCommand {
  constructor(
    readonly batchId: string,
    readonly kind: BatchAttestationKind,
    readonly staffUserId: string,
  ) {}
}
