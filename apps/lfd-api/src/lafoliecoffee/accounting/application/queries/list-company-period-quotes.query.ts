/**
 * Les devis de période d'une fiche client (QD7) : ceux de la société si elle
 * paie, ceux de son payeur si c'est un site qui le suit.
 */
export class ListCompanyPeriodQuotesQuery {
  constructor(readonly companyId: string) {}
}
