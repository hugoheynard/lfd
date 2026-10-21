import { z } from "zod";

import type { IssuedInvoiceSummaryView } from "./issued-invoices.js";

/**
 * **« Mes factures » côté client** (plan
 * `documentation/comptabilite/facturation/plan-page-mes-factures.md`, §7).
 *
 * Une vue DISTINCTE d'`IssuedInvoiceSummaryView`, que le back-office lit :
 * le statut de règlement n'existe que pour le client, et il est DÉRIVÉ à la
 * lecture (aucune colonne, aucune écriture). Montants en centimes, jours en
 * `AAAA-MM-JJ`.
 */

/**
 * Le statut d'une facture, dans l'ordre de la table du §7.1 :
 *
 * - `card_paid` — acquittée par carte (`date` = le jour du paiement) ;
 * - `collection_planned` — prélèvement prévu (`date` = l'échéance du lot, ou
 *   l'échéance de la facture tant qu'aucun lot ne la porte) ;
 * - `collected` — prélevée (`date` = l'échéance du lot) ;
 * - `collection_rejected` — rejetée par la banque, à régulariser (`date` = le
 *   jour du retour) ;
 * - `recollection_planned` — re-présentée, le prochain lot la reprendra ;
 * - `settled` — réglée autrement ;
 * - `closed` — clôturée (passée en perte) ;
 * - `processing` — en cours de traitement chez nous (« notre équipe s'en
 *   occupe ») : elle attend une décision de l'équipe, pas un geste du client.
 */
export type MyInvoiceSettlementStatus =
  | "card_paid"
  | "collection_planned"
  | "collected"
  | "collection_rejected"
  | "recollection_planned"
  | "settled"
  | "closed"
  | "processing";

export interface MyInvoiceSettlementView {
  readonly status: MyInvoiceSettlementStatus;
  /** `AAAA-MM-JJ`, ou `null` quand le statut n'a pas de date à dire. */
  readonly date: string | null;
  /**
   * Les AUTRES factures du même prélèvement : un rejet porte sur toute la
   * ligne bancaire (« rejeté avec 2 autres factures du même prélèvement »).
   * `0` hors prélèvement.
   */
  readonly otherInvoicesOnDebit: number;
}

/** Une ligne de « Mes factures » : le résumé partagé, et son règlement. */
export interface MyIssuedInvoiceView extends IssuedInvoiceSummaryView {
  /** `null` pour un avoir : il n'a pas de statut de règlement. */
  readonly settlement: MyInvoiceSettlementView | null;
}

/**
 * Le total dû — l'état du COMPTE, pas celui de la liste filtrée : il ne suit
 * pas les filtres. Prélèvements prévus et rejetés, avoirs non soustraits,
 * pièces d'un autre payeur qui couvrent un bon de la société comprises.
 */
export interface MyAmountDueView {
  readonly totalCents: number;
  readonly invoiceCount: number;
  /** Dont rejetées — à régulariser. */
  readonly rejectedCount: number;
  readonly rejectedCents: number;
}

/** `GET companies/:companyId/invoices`. */
export interface MyIssuedInvoicesView {
  /** Les plus récentes d'abord, filtrées. */
  readonly invoices: readonly MyIssuedInvoiceView[];
  readonly amountDue: MyAmountDueView;
}

/**
 * Les filtres de la liste, en chaîne de requête — la FORME seulement. L'année
 * et le mois sont ceux de l'émission ; un mois sans année ne désigne rien.
 */
export const myInvoicesQuerySchema = z
  .object({
    year: z.coerce.number().int().positive().optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    kind: z.enum(["invoice", "credit_note"]).optional(),
  })
  .refine((query) => query.month === undefined || query.year !== undefined, {
    message: "un mois se choisit avec son année",
    path: ["month"],
  });
export type MyInvoicesQuery = z.infer<typeof myInvoicesQuerySchema>;
