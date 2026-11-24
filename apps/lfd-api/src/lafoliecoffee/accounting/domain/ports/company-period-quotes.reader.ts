import type { CompanyPeriodQuoteView } from "@lfd/contracts";

/**
 * Port de **lecture** des devis de période d'un payeur, pour sa fiche client
 * (QD7) : les versions vivantes (`awaiting`, `invoiced`), chacune avec le
 * total de la version qu'elle a remplacée et sa facture une fois émise. Une
 * version `superseded` n'est jamais listée : elle ne sert qu'à l'écart.
 */
export abstract class CompanyPeriodQuotesReader {
  /** Les versions vivantes de `payerCompanyId`, la clôture la plus récente d'abord. */
  abstract liveOf(payerCompanyId: string): Promise<readonly CompanyPeriodQuoteView[]>;
}
