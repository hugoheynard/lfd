/** La carte commune des sites d'un principal, lue depuis sa fiche client (staff, `b2b_companies`). */
export class GetPrincipalSitesMenuForStaffQuery {
  constructor(readonly companyId: string) {}
}
