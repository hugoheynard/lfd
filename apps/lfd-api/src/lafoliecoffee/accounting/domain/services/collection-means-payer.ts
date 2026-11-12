import type { NamedPayer } from "../entities/payer-billing-mode-history.js";
import { BillingPayerNotFoundError } from "../errors/billing-mode-errors.js";
import { NotACollectionMeansPayerError } from "../errors/collection-means-errors.js";
import type { PayerStanding } from "../ports/payer-standing.reader.js";
import { billingFollowAt } from "./billed-payer.js";

/**
 * **Qui porte le moyen d'un compte à `at`** (V1) : le principal qu'il suit en
 * `billing` à cet instant, sinon lui-même — le même payeur que
 * `billedPayerOf` désignerait pour une commande passée à `at`.
 * `followed` nomme ce principal ; `null` : le compte règle seul.
 */
export function collectionMeansPayerOf(
  standing: PayerStanding,
  at: Date,
): { readonly payer: NamedPayer; readonly followed: boolean } {
  const follow = billingFollowAt(standing.companyId, at, standing.follows);
  if (follow !== null && follow.payerId !== standing.companyId) {
    return { payer: { id: follow.payerId, name: follow.payerName }, followed: true };
  }
  return { payer: { id: standing.companyId, name: standing.name }, followed: false };
}

/**
 * Le moyen ne se change que sur un payeur : un site qui suit la facturation
 * de son principal prend le moyen du principal (V1).
 *
 * @throws {BillingPayerNotFoundError} le compte n'existe pas.
 * @throws {NotACollectionMeansPayerError} le compte est facturé chez un autre.
 */
export function requireCollectionMeansPayer(
  companyId: string,
  standing: PayerStanding | null,
  at: Date,
): NamedPayer {
  if (standing === null) {
    throw new BillingPayerNotFoundError(companyId);
  }
  const { payer, followed } = collectionMeansPayerOf(standing, at);
  if (followed) {
    throw new NotACollectionMeansPayerError(standing.name, payer.name);
  }
  return payer;
}
