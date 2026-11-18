import type { PayerCommitmentTerms } from "../services/budget-commitment-rule.js";

/**
 * **Ce que le payeur exige de l'engagement budgétaire** (plan
 * `plan-clients-publics-chorus.md`, § 6 quater, E2′) — la nature publique
 * (forme juridique) et la fiche Chorus Pro de la société. Port étroit,
 * déclaré par la commande, implémenté par le compte client (qui possède la
 * fiche) ; `appBootstrap/payer-commitment-requirements.module.ts` les relie.
 */
export abstract class PayerCommitmentRequirements {
  /** Une société inconnue, ou privée : `{ kind: "private" }`. */
  abstract of(payerCompanyId: string): Promise<PayerCommitmentTerms>;
}
