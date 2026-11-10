import { BillingPayerNotFoundError, NotABillingPayerError } from "../errors/billing-mode-errors.js";
import type { NamedPayer } from "../entities/payer-billing-mode-history.js";
import type { PayerStanding } from "../ports/payer-standing.reader.js";
import { billingFollowAt } from "./billed-payer.js";

/**
 * **Le mode ne se pose que sur un payeur** (plan
 * `plan-rythme-de-facturation.md`, §16.6-5) : celui que `billedPayerOf`
 * désignerait pour une commande passée à `at`. Un site qui suit un autre
 * compte en `billing` à cet instant est refusé, en nommant les deux.
 *
 * @throws {BillingPayerNotFoundError} le compte n'existe pas.
 * @throws {NotABillingPayerError} le compte est facturé chez un autre.
 */
export function requireBillingPayer(
  companyId: string,
  standing: PayerStanding | null,
  at: Date,
): NamedPayer {
  if (standing === null) {
    throw new BillingPayerNotFoundError(companyId);
  }
  const follow = billingFollowAt(standing.companyId, at, standing.follows);
  if (follow !== null && follow.payerId !== standing.companyId) {
    throw new NotABillingPayerError(standing.name, follow.payerName);
  }
  return { id: standing.companyId, name: standing.name };
}

/**
 * Le critère de `requireBillingPayer`, sans refus : le compte ne suit aucun
 * autre compte en `billing` à `at` — il est facturé en son nom.
 */
export function isBillingPayerAt(standing: PayerStanding, at: Date): boolean {
  const follow = billingFollowAt(standing.companyId, at, standing.follows);
  return follow === null || follow.payerId === standing.companyId;
}
