import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un fait de règlement (`order.paid`, `order.refund_succeeded`,
 * `order.payment_failed`, `order.paid_after_cancellation`) reçu hors de son contrat.
 */
export class OrderSettlementPayloadError extends TechnicalError {
  constructor(readonly factType: string) {
    super(
      "order_settlement.payload_invalid",
      `Le fait « ${factType} » reçu est illisible (commande, cause ou remboursement manquant ou inconnu) : ` +
        "aucun de ses effets (facture, avoir, courriel, cloche) n'a eu lieu pour lui. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
