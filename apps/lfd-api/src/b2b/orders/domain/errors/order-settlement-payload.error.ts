import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Un fait de règlement (`order.paid`, `order.refund_succeeded`) reçu hors de son contrat. */
export class OrderSettlementPayloadError extends TechnicalError {
  constructor(readonly factType: string) {
    super(
      "order_settlement.payload_invalid",
      `Le fait « ${factType} » reçu est illisible (commande ou remboursement manquant) : ` +
        "aucune facture ni aucun avoir n'a été émis pour lui. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
