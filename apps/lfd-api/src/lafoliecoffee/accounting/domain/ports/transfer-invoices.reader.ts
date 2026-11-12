import type { TransferInvoice } from "../entities/received-bank-transfer.js";

/**
 * Port de LECTURE des factures qu'un virement reçu va régler (V7) : leur
 * moyen figé, leur reste dû, leurs bons, et le virement qui les règle déjà.
 * Une facture inconnue est absente du résultat ; c'est l'agrégat qui la
 * nomme introuvable.
 */
export abstract class TransferInvoicesReader {
  abstract ofIds(invoiceIds: readonly string[]): Promise<readonly TransferInvoice[]>;
}
