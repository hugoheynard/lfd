/** Ce que la facture du mois retient d'un payeur. */
export interface MonthlyInvoiceOutcomeKey {
  readonly legalEntityId: string;
  /** `AAAA-MM`. */
  readonly month: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  /**
   * Le mandat effectif de la facture (E4b : une facture par payeur ET par
   * mandat) ; `null` pour celle des bons sans mandat. Avec le payeur et le
   * mois, la clé de l'issue.
   */
  readonly mandateId: string | null;
  /** Sa RUM, pour que l'écran nomme le mandat d'un payeur signalé. */
  readonly mandateReference: string | null;
  /** Les références des bons signalés non facturables. */
  readonly unbillableOrders: readonly string[];
  readonly at: Date;
}

/**
 * **L'issue de la facture du mois, par payeur et par mandat** (lots E4, E4b) : émise ou
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
