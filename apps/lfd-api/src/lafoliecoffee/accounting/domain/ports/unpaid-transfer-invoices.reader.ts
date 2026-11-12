/** Une facture au virement qu'aucun virement reçu n'a encore réglée. */
export interface UnpaidTransferInvoice {
  readonly invoiceId: string;
  readonly number: string;
  readonly legalEntityId: string;
  readonly legalEntityName: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  /** `AAAA-MM-JJ`. */
  readonly issuedOn: string;
  /** `AAAA-MM-JJ` ; une facture au virement en a toujours une. */
  readonly dueOn: string;
  readonly remainingCents: number;
}

/** Restreindre la liste : à une entité, à un payeur, ou rien. */
export interface UnpaidTransferFilter {
  readonly legalEntityId: string | null;
  readonly payerCompanyId: string | null;
}

/**
 * Port de LECTURE des factures au virement non réglées (V8, C7) : ce que le
 * suivi des impayés et la fiche client lisent. Le retard se juge dans le
 * domaine, à l'horloge ; la lecture ne rend que des faits.
 */
export abstract class UnpaidTransferInvoicesReader {
  abstract unpaid(filter: UnpaidTransferFilter): Promise<readonly UnpaidTransferInvoice[]>;
}
