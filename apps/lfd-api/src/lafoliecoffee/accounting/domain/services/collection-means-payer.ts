import type { NamedPayer } from "../entities/payer-billing-mode-history.js";
import { BillingPayerNotFoundError } from "../errors/billing-mode-errors.js";
import {
  NotACollectionMeansPayerError,
  PublicPayerDirectDebitRefusedError,
  PublicPayerMeansCancelRefusedError,
} from "../errors/collection-means-errors.js";
import type { PayerStanding } from "../ports/payer-standing.reader.js";
import type { CollectionMeans } from "../value-objects/collection-means.js";
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

/**
 * Un organisme public règle par virement : le prélèvement lui est refusé à
 * l'écriture, quel que soit l'auteur du geste.
 *
 * @throws {PublicPayerDirectDebitRefusedError}
 */
export function ensureMeansAllowedFor(standing: PayerStanding, means: CollectionMeans): void {
  if (standing.public && means === "sepa_debit") {
    throw new PublicPayerDirectDebitRefusedError(standing.name);
  }
}

/**
 * Un organisme public n'annule pas de moyen programmé : il n'a que le
 * virement, et l'annuler le rendrait au prélèvement.
 *
 * @throws {PublicPayerMeansCancelRefusedError}
 */
export function ensureMeansCancellableFor(standing: PayerStanding): void {
  if (standing.public) {
    throw new PublicPayerMeansCancelRefusedError(standing.name);
  }
}
