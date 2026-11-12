import { SEPA_CREDIT_TRANSFER } from "../domain/entities/invoice.types.js";
import type { CollectionMeans } from "../domain/value-objects/collection-means.js";
import { invoicePaymentMeansSchema } from "./invoice-json.schema.js";

/**
 * **Le moyen d'encaissement qu'une facture a figé** (plan
 * `plan-paiement-au-compte-par-virement.md`, K2, K10), relu sur sa colonne
 * `payment_means` : le virement pour le code 58. Tout le reste se lit
 * « prélèvement » — le code 59, et `NULL` (sans mandat, ou émise avant le
 * chantier), comme avant.
 *
 * Une forme illisible n'est PAS prise pour un virement : la facture reste
 * « prélèvement », et le lot la juge comme il l'a toujours fait (mandat,
 * ou « sans mandat » qui bloque le dépôt et la nomme).
 */
export function invoiceCollectionMeansOf(raw: unknown): CollectionMeans {
  const parsed = invoicePaymentMeansSchema.safeParse(raw);
  return parsed.success && parsed.data.code === SEPA_CREDIT_TRANSFER
    ? "bank_transfer"
    : "sepa_debit";
}
