import {
  BudgetCommitmentNumberRequiredError,
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
 *   saisi ni proposé, aussi.
 *
 * @throws {InvalidBudgetCommitmentError} une forme refusée.
 * @throws {PrivatePayerBudgetCommitmentError} un engagement pour un payeur privé.
 * @throws {BudgetCommitmentNumberRequiredError} numéro exigé, absent.
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
  if (terms.commitmentRequired && number === "") {
    throw new BudgetCommitmentNumberRequiredError();
  }
  if (terms.serviceCodeRequired && serviceCode === "") {
    throw new BudgetCommitmentServiceCodeRequiredError();
  }
  return BudgetCommitment.entered({ number, serviceCode });
}
