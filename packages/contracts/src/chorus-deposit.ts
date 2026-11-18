import { z } from "zod";

/**
 * **Le dépôt sur Chorus Pro, à la main** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 quinquies). Une facture d'organisme public est téléchargée et déposée
 * sur le portail par la comptabilité, qui le note ici. Le délai de paiement
 * part du jour du dépôt. Jours en `AAAA-MM-JJ` (Paris), montants en centimes.
 */

/** Le motif d'un rejet : de quoi recopier celui du portail. */
export const CHORUS_REJECTION_REASON_MAX = 500;

/**
 * Où en est une facture publique sur Chorus : `to_deposit` (rien de noté),
 * `deposited`, `rejected` (sort des paiements attendus), `accepted` (mise en
 * paiement, informatif).
 */
export const CHORUS_DEPOSIT_STATES = ["to_deposit", "deposited", "rejected", "accepted"] as const;
export type ChorusDepositState = (typeof CHORUS_DEPOSIT_STATES)[number];

/**
 * `POST admin/accounting/chorus/invoices/:invoiceId/deposit` (« Déposée le … »)
 * et `…/acceptance` (« Mise en paiement ») — le jour du geste sur le portail.
 * La forme seulement : le domaine refuse un jour avant la facture (ou le
 * dépôt), un jour futur, un second dépôt.
 */
export const noteChorusDepositPayloadSchema = z.strictObject({
  occurredOn: z.iso.date(),
});
export type NoteChorusDepositPayload = z.infer<typeof noteChorusDepositPayloadSchema>;

/** `POST admin/accounting/chorus/invoices/:invoiceId/rejection` — le jour et le motif du portail. */
export const rejectChorusDepositPayloadSchema = z.strictObject({
  occurredOn: z.iso.date(),
  reason: z.string().max(CHORUS_REJECTION_REASON_MAX),
});
export type RejectChorusDepositPayload = z.infer<typeof rejectChorusDepositPayloadSchema>;

/**
 * L'état Chorus d'une facture publique, et son **échéance effective** : dépôt
 * + délai légal ; `null` tant qu'elle n'est pas déposée, et après un rejet.
 * Le retard se lit sur le règlement de la pièce (virement reçu ou non), pas ici.
 */
export interface ChorusDepositStatusView {
  readonly state: ChorusDepositState;
  /** Le délai légal figé à l'émission (30, ou 50 pour un établissement de santé). */
  readonly paymentDeadlineDays: number;
  readonly depositedOn: string | null;
  readonly rejectedOn: string | null;
  readonly rejectionReason: string | null;
  readonly acceptedOn: string | null;
  readonly effectiveDueOn: string | null;
}

/** Une facture d'organisme public, dans la page « Chorus Pro ». */
export interface ChorusInvoiceView {
  readonly invoiceId: string;
  readonly number: string;
  readonly legalEntityId: string;
  readonly legalEntityName: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  readonly issuedOn: string;
  readonly totalTtcCents: number;
  /** BT-13 et BT-10 — ce que le staff ressaisit sur le portail. */
  readonly budgetCommitmentNumber: string | null;
  readonly budgetCommitmentServiceCode: string | null;
  /** Le PDF Factur-X est rendu : `GET admin/accounting/invoices/:id/pdf` le sert. */
  readonly documentAvailable: boolean;
  readonly chorus: ChorusDepositStatusView;
}

/**
 * `GET admin/accounting/chorus/invoices/to-deposit` (les plus anciennes
 * d'abord) et `GET admin/accounting/chorus/invoices/deposited` (les plus
 * récemment déposées d'abord). Filtre facultatif : `legalEntityId`.
 */
export interface ChorusInvoicesView {
  readonly invoices: readonly ChorusInvoiceView[];
}
