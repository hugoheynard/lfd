import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Une commande remise et encaissée sans montants facturables (`billable_*`) :
 * le solde aurait dû être posé dans l'unité de travail de la remise (E6c1).
 * Les points se calculent sur ce qui est PARTI, jamais sur ce qui a été
 * commandé — sans solde, on refuse plutôt que d'inventer un repli (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 16).
 */
export class CompletedOrderUnsettledError extends TechnicalError {
  constructor(orderNumber: string) {
    super(
      "orders.completed.unsettled",
      `La commande ${orderNumber} est remise et réglée, mais ses montants facturables ne sont pas posés : ` +
        "ses points de fidélité n'ont pas été crédités. Lancer le rapprochement des bons de livraison, " +
        "qui pose le solde ; le rattrapage de nuit créditera ensuite les points.",
    );
  }
}
