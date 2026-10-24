import { z } from "zod";

/**
 * **Les attestations d'un lot de prélèvement** (plan
 * `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`
 * § 1.2, § 3.3, P3) — trois gestes faits hors de l'outil que rien ne peut
 * constater. La dernière ligne d'un (lot, sorte) fait foi ; une attestation
 * fausse se retire par une ligne de plus. Aucune ne conditionne un geste :
 * elles ne gouvernent que l'onglet 3 de la procédure.
 */

/**
 * `audit_reviewed` — « J'ai relu le contrôle CSV » (avant dépôt, facultatif) ;
 * `remittance_signed` — « J'ai signé la remise sur CENET » (après « J'ai
 * déposé ») : elle fait passer l'onglet 3 à « fait » ; `psr_read` — « J'ai lu
 * les comptes rendus PSR » (facultatif, Q5). Des VALEURS : stables.
 */
export const BATCH_ATTESTATION_KIND_VALUES = [
  "audit_reviewed",
  "remittance_signed",
  "psr_read",
] as const;
export type BatchAttestationKindView = (typeof BATCH_ATTESTATION_KIND_VALUES)[number];

/** L'attestation qui fait foi pour une sorte. */
export interface BatchAttestationView {
  /** ISO — l'instant du geste. */
  readonly at: string;
  /** « Prénom Nom » ; `null` si la fiche ne le dit plus. */
  readonly byName: string | null;
}

/** Les trois sortes d'un lot ; `null` : pas attestée (ou retirée). */
export type CollectionBatchAttestationsView = Readonly<
  Record<BatchAttestationKindView, BatchAttestationView | null>
>;

/** `POST admin/accounting/collection/batches/:id/attestations`. */
export const attestCollectionBatchPayloadSchema = z.object({
  kind: z.enum(BATCH_ATTESTATION_KIND_VALUES),
});
export type AttestCollectionBatchPayload = z.infer<typeof attestCollectionBatchPayloadSchema>;

/** `POST admin/accounting/collection/batches/:id/attestations/withdrawn` — une note dit pourquoi. */
export const withdrawCollectionBatchAttestationPayloadSchema = z.object({
  kind: z.enum(BATCH_ATTESTATION_KIND_VALUES),
  note: z.string().trim().min(1).max(500),
});
export type WithdrawCollectionBatchAttestationPayload = z.infer<
  typeof withdrawCollectionBatchAttestationPayloadSchema
>;
