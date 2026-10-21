/**
 * Le récapitulatif de commandes choisies, IMPRIMÉ
 * (`documentation/commandes/plan-recapitulatif-des-commandes.md`, lot R2) —
 * une LECTURE murée comme le récapitulatif à l'écran.
 */
export class ExportCompanyOrderSummaryPdfQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly orderIds: readonly string[],
  ) {}
}
