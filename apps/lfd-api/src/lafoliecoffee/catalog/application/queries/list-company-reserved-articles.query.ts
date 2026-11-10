/** Les articles réservés à une société, et ceux hérités de son principal (L1a). */
export class ListCompanyReservedArticlesQuery {
  constructor(readonly companyId: string) {}
}
