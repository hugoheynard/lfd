import type { Invoice } from "../entities/invoice.js";

/**
 * Port d'ÉCRITURE des **factures et avoirs émis** (plan
 * `plan-emission-de-la-facture.md`, § 5, lot E2).
 *
 * 🔴 **Immuable par construction** : deux gestes, et rien d'autre. Pas de
 * `save` — une facture ne se recharge pas pour être mutée. La base le tient
 * aussi (déclencheur `invoice_immutable`, migration
 * `20261008190000_la_facture_emise`).
 */
export abstract class InvoiceRepository {
  /** Écrit la pièce et ses bons, dans la transaction de l'émission qui a pris son numéro. */
  abstract insert(invoice: Invoice): Promise<void>;

  /**
   * Écrit le document que `Invoice.attachDocument` vient de poser — une fois.
   *
   * @throws {InvoiceDocumentAlreadyAttachedError} un autre écrivain l'a posé entre-temps.
   */
  abstract attachDocument(invoice: Invoice): Promise<void>;
}
