import type { IdentityAttestation } from "../value-objects/identity-attestation.js";

/**
 * **La trace d'ouverture d'un compte au comptoir** (`plan-comptes-du-comptoir.md`,
 * § 3.5) — écriture seule, une fois : la base refuse toute réécriture
 * (déclencheur append-only), cocher engage l'agent.
 */
export abstract class CounterOpeningAttestations {
  /** Range la trace du compte `companyId`, dans la transaction de l'appelant. */
  abstract record(companyId: string, attestation: IdentityAttestation): Promise<void>;
}
