/** La carte commune des sites, lue depuis le principal pour la régler (§ 6.1). */
export class GetPrincipalSitesMenuQuery {
  constructor(
    readonly userId: string,
    readonly principalId: string,
  ) {}
}
