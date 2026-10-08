/** Ce que la facture du mois retient d'un payeur. */
export interface MonthlyInvoiceOutcomeKey {
  readonly legalEntityId: string;
  /** `AAAA-MM`. */
  readonly month: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  /** Les références des bons signalés non facturables. */
  readonly unbillableOrders: readonly string[];
  readonly at: Date;
}

/**
 * **L'issue de la facture du mois, par payeur** (lot E4) : émise ou
 * signalée. Rien n'est avalé — un refus est RANGÉ, l'écran le lit.
 *
 * La base tient qu'une issue émise ne redevient jamais signalée
 * (`invoice_monthly_outcome_final`) : un rejeu ne défait rien.
 */
export abstract class MonthlyInvoiceOutcomes {
  /** Dans la transaction de l'émission : la facture et son issue partent ensemble. */
  abstract recordIssued(key: MonthlyInvoiceOutcomeKey, invoiceId: string): Promise<void>;

  /** Le refus en clair ; remplace un refus antérieur du même mois. */
  abstract recordBlocked(key: MonthlyInvoiceOutcomeKey, message: string): Promise<void>;
}
