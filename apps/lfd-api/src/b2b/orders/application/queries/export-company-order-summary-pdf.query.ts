import type { RequestedSummaryPeriod } from "./company-order-summary-support.js";

/**
 * Le récapitulatif de commandes choisies, IMPRIMÉ
 * (`documentation/commandes/plan-recapitulatif-des-commandes.md`, lot R2) —
 * une LECTURE murée comme le récapitulatif à l'écran. `period` : les bornes du
 * filtre affiché, imprimées telles quelles (§9) — les ids font foi.
 */
export class ExportCompanyOrderSummaryPdfQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly orderIds: readonly string[],
    readonly period: RequestedSummaryPeriod | null = null,
  ) {}
}
