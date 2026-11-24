import type { PayerCommitmentSheet } from "../services/public-commitment-blocker.js";

/**
 * Ce que la fiche Chorus Pro de ces payeurs exige sur leurs factures (E7), et
 * quand leur numéro d'engagement arrive (P2 bis) —
 * lu une fois pour tous les payeurs d'une émission. Un payeur absent de la
 * carte n'exige rien : il n'est pas public, ou sa fiche n'est pas relevée
 * (un organisme public sans fiche ne s'active pas, P1a).
 */
export abstract class PayerCommitmentRequirementsReader {
  abstract requirementsOf(
    payerIds: readonly string[],
  ): Promise<ReadonlyMap<string, PayerCommitmentSheet>>;
}
