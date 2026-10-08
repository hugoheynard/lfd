import type { Invoice } from "../entities/invoice.js";

/**
 * **Les pièces qui portent une commande** — sa facture (380) et les avoirs
 * (381) qui la citent, dans l'ordre des numéros (lots E5b, E5c). Port à part
 * d'`InvoiceReader` (ISP) : le rapprochement des remboursements et la fiche
 * commande n'appellent que lui.
 */
export abstract class OrderInvoicesReader {
  abstract ofOrder(orderId: string): Promise<readonly Invoice[]>;
}
