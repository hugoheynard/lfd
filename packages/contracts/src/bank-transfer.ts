import { z } from "zod";

/**
 * **Le virement reçu** et **les factures au virement à régler** (plan
 * `documentation/comptabilite/plan-paiement-au-compte-par-virement.md`, V7,
 * V8, C7). Montants en centimes, jours en `AAAA-MM-JJ` (Paris).
 */

/** Une référence de relevé SEPA : 140 caractères au plus. */
export const BANK_TRANSFER_REFERENCE_MAX = 140;

/** Un virement règle au plus autant de factures qu'une page en montre. */
export const BANK_TRANSFER_INVOICES_MAX = 100;

/**
 * `POST admin/accounting/legal-entities/:id/bank-transfers` — un virement lu
 * sur le relevé, et les factures au virement qu'il règle en entier. La forme
 * seulement : le domaine refuse un montant qui ne fait pas le reste dû des
 * factures, une facture qui n'est pas au virement ou déjà réglée.
 */
export const recordBankTransferPayloadSchema = z.strictObject({
  amountCents: z.number().int(),
  receivedOn: z.iso.date(),
  reference: z.string().max(BANK_TRANSFER_REFERENCE_MAX),
  invoiceIds: z.array(z.string().min(1)).min(1).max(BANK_TRANSFER_INVOICES_MAX),
});
export type RecordBankTransferPayload = z.infer<typeof recordBankTransferPayloadSchema>;

/**
 * `GET admin/accounting/legal-entities/:id/bank-transfers/preview?amountCents=…&invoiceIds=a,b`
 * — la forme seulement ; le domaine juge les factures comme à la saisie.
 */
export const bankTransferPreviewQuerySchema = z.strictObject({
  amountCents: z.coerce.number().int(),
  invoiceIds: z
    .string()
    .transform((value) => value.split(",").filter((id) => id !== ""))
    .pipe(z.array(z.string().min(1)).min(1).max(BANK_TRANSFER_INVOICES_MAX)),
});
export type BankTransferPreviewQuery = z.input<typeof bankTransferPreviewQuerySchema>;

/**
 * L'aperçu d'un virement avant de le saisir, calculé par la règle même de la
 * saisie : `gapCents` = reçu − reste dû (positif : en trop ; négatif :
 * manquant). La saisie n'aboutit qu'à écart nul.
 */
export interface BankTransferPreviewView {
  readonly amountCents: number;
  readonly invoicesDueCents: number;
  readonly gapCents: number;
}

/** Ce que rend le geste : l'identifiant du virement saisi. */
export interface RecordedBankTransferView {
  readonly transferId: string;
}

/**
 * Une facture au virement qu'aucun virement reçu n'a réglée. `overdue` dès le
 * lendemain de l'échéance (V8 : on la SIGNALE, rien ne bloque — Q2).
 */
export interface UnpaidTransferInvoiceView {
  readonly invoiceId: string;
  readonly number: string;
  readonly legalEntityId: string;
  readonly legalEntityName: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  readonly issuedOn: string;
  readonly dueOn: string;
  /** Le reste dû : ce qu'un virement doit apporter pour la régler. */
  readonly amountCents: number;
  readonly overdue: boolean;
  /** `0` tant que l'échéance n'est pas passée. */
  readonly daysLate: number;
}

/**
 * `GET admin/accounting/transfer-invoices/unpaid` — les plus en retard
 * d'abord. Filtres : `legalEntityId`, `payerCompanyId`, `overdue=true`.
 */
export interface UnpaidTransferInvoicesView {
  readonly invoices: readonly UnpaidTransferInvoiceView[];
  /** Le total dû des factures EN RETARD de la liste. */
  readonly overdueCents: number;
}
