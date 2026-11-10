import type { InvoiceDebitFact } from "../services/invoice-settlement.js";

/** Ce que la comptabilité sait du prélèvement d'UNE pièce. */
export interface InvoiceCollectionFacts {
  /** Ses lignes de prélèvement, lots annulés COMPRIS (le domaine les écarte). */
  readonly debits: readonly InvoiceDebitFact[];
  /** Un de ses bons a quitté l'état `due` sans qu'une ligne la porte. */
  readonly blocked: boolean;
}

/**
 * Port de LECTURE des faits de prélèvement de pièces déjà passées au mur
 * (« Mes factures », plan `plan-page-mes-factures.md` §7.1). Lu par LOT :
 * un nombre fixe de requêtes pour toutes les pièces, jamais une par pièce.
 * Une pièce sans fait est absente de la carte.
 *
 * Port à part de `CompanyInvoicesReader` (ISP) : le back-office lit les
 * pièces sans leur règlement.
 */
export abstract class InvoiceSettlementFactsReader {
  abstract factsOf(
    invoiceIds: readonly string[],
  ): Promise<ReadonlyMap<string, InvoiceCollectionFacts>>;
}
