/**
 * Le récapitulatif de commandes choisies d'une société et de ses sites
 * (`documentation/commandes/plan-recapitulatif-des-commandes.md`, lot R1) —
 * une LECTURE. `actorUserId` accompagne `companyId` : elle est murée.
 */
export class SummarizeCompanyOrdersQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly orderIds: readonly string[],
  ) {}
}
