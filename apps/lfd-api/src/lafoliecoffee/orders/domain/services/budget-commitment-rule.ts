import type { CommitmentTiming } from "@lfd/contracts";

import {
  BudgetCommitmentNumberRequiredError,
  BudgetCommitmentOnQuoteError,
  BudgetCommitmentServiceCodeRequiredError,
  PrivatePayerBudgetCommitmentError,
} from "../errors/budget-commitment-errors.js";
import {
  BudgetCommitment,
  type EnteredBudgetCommitment,
} from "../value-objects/budget-commitment.js";

/**
 * **Ce que le payeur d'une commande dit de l'engagement budgétaire** — lu sur
 * sa forme juridique et sa fiche Chorus Pro (`PayerCommitmentRequirements`).
 */
export type PayerCommitmentTerms =
  | { readonly kind: "private" }
  | {
      readonly kind: "public";
      readonly commitmentRequired: boolean;
      readonly serviceCodeRequired: boolean;
      /** Vide quand la fiche n'en propose pas. */
      readonly defaultServiceCode: string;
      /**
       * `on_period_quote` : le numéro arrive sur le devis de la période, la
       * commande n'en porte pas.
       */
      readonly timing: CommitmentTiming;
    };

/** Un payeur privé — et toute commande sans société. */
export const PRIVATE_PAYER: PayerCommitmentTerms = { kind: "private" };

/**
 * **L'engagement que la commande portera** (E2′) :
 *
 * - payeur privé : aucun ; un numéro ou un code envoyé est refusé, rien ne se
 *   perd en silence ;
 * - payeur public : le numéro saisi, et le code saisi — sinon celui que sa
 *   fiche propose. Un numéro exigé et absent est refusé ; un code exigé, ni
 *   saisi ni proposé, aussi ;
 * - payeur public sur devis de période : aucun numéro — il arrive sur le
 *   devis, un numéro saisi est refusé. Le code service garde sa règle.
 *
 * @throws {InvalidBudgetCommitmentError} une forme refusée.
 * @throws {PrivatePayerBudgetCommitmentError} un engagement pour un payeur privé.
 * @throws {BudgetCommitmentNumberRequiredError} numéro exigé, absent.
 * @throws {BudgetCommitmentOnQuoteError} un numéro pour un payeur sur devis de période.
 * @throws {BudgetCommitmentServiceCodeRequiredError} code exigé, absent.
 */
export function budgetCommitmentFor(
  entered: EnteredBudgetCommitment | null,
  terms: PayerCommitmentTerms,
): BudgetCommitment | null {
  const typed = entered === null ? null : BudgetCommitment.entered(entered);
  if (terms.kind === "private") {
    if (typed !== null) {
      throw new PrivatePayerBudgetCommitmentError();
    }
    return null;
  }
  const number = typed?.number ?? "";
  const serviceCode = (typed?.serviceCode ?? "") || terms.defaultServiceCode;
  if (terms.timing === "on_period_quote" && number !== "") {
    throw new BudgetCommitmentOnQuoteError();
  }
  if (terms.timing === "at_order" && terms.commitmentRequired && number === "") {
    throw new BudgetCommitmentNumberRequiredError();
  }
  if (terms.serviceCodeRequired && serviceCode === "") {
    throw new BudgetCommitmentServiceCodeRequiredError();
  }
  return BudgetCommitment.entered({ number, serviceCode });
}
