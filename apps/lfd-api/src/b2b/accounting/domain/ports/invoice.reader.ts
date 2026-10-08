import type { Invoice } from "../entities/invoice.js";

/**
 * Port de LECTURE des **factures émises** — à part du port d'écriture, qui
 * n'a que `insert` et `attachDocument` (plan `plan-emission-de-la-facture.md`,
 * lot E2).
 *
 * Rend l'agrégat relu par `Invoice.restore` : la forme et les totaux sont
 * revalidés à chaque lecture, les parties ne sont pas rejugées. Une ligne
 * illisible est refusée (`UnreadableInvoiceError`), jamais rendue à moitié.
 */
export abstract class InvoiceReader {
  /** La facture, ou `null` si elle n'existe pas. */
  abstract byId(invoiceId: string): Promise<Invoice | null>;

  /** Les pièces d'un payeur légal, dans l'ordre des numéros. Le mur : `payer_company_id`. */
  abstract byPayer(payerCompanyId: string): Promise<readonly Invoice[]>;

  /** Les pièces d'une entité pour une année, dans l'ordre des rangs. */
  abstract byEntityAndYear(legalEntityId: string, year: number): Promise<readonly Invoice[]>;
}
