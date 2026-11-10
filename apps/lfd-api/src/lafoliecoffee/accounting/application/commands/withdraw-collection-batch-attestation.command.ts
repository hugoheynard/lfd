import type { BatchAttestationKind } from "../../domain/services/collection-batch-attestations.js";

/**
 * Retire une attestation fausse d'un lot — par une ligne de plus, jamais en
 * effaçant (plan `plan-page-procedure-de-prelevement.md` § 1.2).
 */
export class WithdrawCollectionBatchAttestationCommand {
  constructor(
    readonly batchId: string,
    readonly kind: BatchAttestationKind,
    readonly note: string,
    readonly staffUserId: string,
  ) {}
}
