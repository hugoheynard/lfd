/**
 * Le récapitulatif de commandes choisies, au TABLEUR
 * (`documentation/commandes/plan-recapitulatif-des-commandes.md`, lot R2) —
 * une LECTURE murée comme le récapitulatif à l'écran.
 */
export class ExportCompanyOrderSummaryCsvQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly orderIds: readonly string[],
  ) {}
}
