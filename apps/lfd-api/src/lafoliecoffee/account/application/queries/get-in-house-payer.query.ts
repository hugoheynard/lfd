/** La nature « maison » d'une société, lue depuis sa fiche client (staff, `b2b_companies`). */
export class GetInHousePayerQuery {
  constructor(readonly companyId: string) {}
}
