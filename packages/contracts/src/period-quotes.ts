/**
 * **Les devis de période d'un payeur**, pour sa fiche client (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD7). Un devis appartient au
 * PAYEUR : la fiche d'un site montre ceux du payeur qu'il suit.
 */

/** Les états vivants d'une version : `superseded` n'est jamais listé. */
export type CompanyPeriodQuoteState = "awaiting" | "invoiced";

/** Une version vivante d'un devis. */
export interface CompanyPeriodQuoteView {
  readonly quoteId: string;
  /** `D-<AAAAMMJJ>-<rang>` — partagé par les versions d'un même devis. */
  readonly number: string;
  readonly version: number;
  readonly state: CompanyPeriodQuoteState;
  /** ISO — le début de la période du payeur. */
  readonly periodStartsAt: string;
  /** ISO — la clôture de la période. */
  readonly periodClosesAt: string;
  /** Le code service des commandes ; `null` sans code. */
  readonly serviceCode: string | null;
  /** TTC de la facture annoncée, en centimes. */
  readonly totalCents: number;
  readonly orderCount: number;
  /**
   * ISO — le rangement de cette version, qui déclenche son envoi
   * automatique. Aucune date d'envoi n'est rangée sur le devis : un renvoi de
   * la même version ne la change pas.
   */
  readonly createdAt: string;
  /**
   * La version remplacée juste avant celle-ci — son TTC et l'écart (celle-ci
   * moins elle), en centimes, calculé ici : l'écran n'additionne aucun
   * montant. `null` pour une première version.
   */
  readonly replaced: { readonly totalCents: number; readonly gapCents: number } | null;
  /** La facture émise à « Engagement reçu » ; `null` tant que le devis attend. */
  readonly invoice: { readonly invoiceId: string; readonly number: string } | null;
}

/** `GET admin/companies/:companyId/period-quotes`. */
export interface CompanyPeriodQuotesView {
  /** Le payeur dont les devis sont listés : la société elle-même, ou le principal d'un site. */
  readonly payerCompanyId: string;
  readonly payerName: string;
  /** Les versions vivantes, la clôture la plus récente d'abord. */
  readonly quotes: readonly CompanyPeriodQuoteView[];
}
