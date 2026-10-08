/**
 * Ce qu'un passage de la facture du mois a fait (E4) — la réponse du bouton
 * et ce que l'automatisme range. Ce qui est SIGNALÉ est aussi rangé en base
 * (`invoice_monthly_outcome`) : ce rapport n'en est que l'écho.
 */
export interface MonthlyInvoiceReport {
  /** `AAAA-MM`. */
  readonly month: string;
  /** `issuedOn` après le mois : émise en retard, au jour réel — jamais antidatée. */
  readonly issued: readonly {
    readonly payerCompanyId: string;
    readonly number: string;
    readonly issuedOn: string;
  }[];
  readonly blocked: readonly { readonly payerCompanyId: string; readonly message: string }[];
  /** Payeurs déjà facturés pour ce mois avant ce passage, laissés tels quels. */
  readonly alreadyInvoiced: number;
  /** Bons signalés non facturables, tous payeurs confondus. */
  readonly unbillableOrders: number;
}
