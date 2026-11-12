/**
 * Port de LECTURE : le jour où un virement reçu a réglé une facture (V7),
 * pour que sa vue dise « réglée par un virement reçu le … ». Une seule
 * question, une seule ligne : la vue d'une facture n'a pas besoin des
 * prélèvements que lit `InvoiceSettlementFactsReader`.
 */
export abstract class InvoiceTransferSettlementReader {
  /** `AAAA-MM-JJ` (jour de Paris lu sur le relevé) ; `null` : aucun virement reçu ne la règle. */
  abstract receivedOnOf(invoiceId: string): Promise<string | null>;
}
