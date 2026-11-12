import { InvalidCollectionMeansError } from "../errors/invalid-collection-means.error.js";

/**
 * **Comment un payeur au compte règle** (plan
 * `plan-paiement-au-compte-par-virement.md`, V1) : par prélèvement SEPA, ou
 * par virement à réception de facture. Des VALEURS : elles vivent en base.
 */
export type CollectionMeans = "sepa_debit" | "bank_transfer";

export const COLLECTION_MEANS_VALUES: readonly CollectionMeans[] = ["sepa_debit", "bank_transfer"];

/** Le moyen d'un payeur qui n'a jamais rien changé : le prélèvement, comme avant T1. */
export const DEFAULT_COLLECTION_MEANS: CollectionMeans = "sepa_debit";

/** Le moyen tel que la comptabilité le lit dans un refus. */
export const COLLECTION_MEANS_LABELS: Readonly<Record<CollectionMeans, string>> = {
  sepa_debit: "prélèvement SEPA",
  bank_transfer: "virement bancaire",
};

/** La longueur d'un motif : une phrase, pas une note. */
export const COLLECTION_MEANS_REASON_MAX = 500;

/**
 * Relit un moyen persisté ou reçu : une valeur inconnue est refusée, jamais
 * prise pour le prélèvement.
 *
 * @throws {InvalidCollectionMeansError} ni `sepa_debit` ni `bank_transfer`.
 */
export function collectionMeansOf(raw: string): CollectionMeans {
  const means = COLLECTION_MEANS_VALUES.find((known) => known === raw);
  if (means === undefined) {
    throw new InvalidCollectionMeansError(raw);
  }
  return means;
}
