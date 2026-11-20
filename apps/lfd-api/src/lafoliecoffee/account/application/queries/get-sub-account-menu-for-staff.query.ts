/** La carte d'un sous-compte, lue depuis sa fiche client (staff, `b2b_companies`). */
export class GetSubAccountMenuForStaffQuery {
  constructor(readonly companyId: string) {}
}
