import type { RefundReport } from "../entities/order-refund.js";

/**
 * Fait de domaine : **un remboursement Stripe porte sur un paiement qu'aucune
 * commande ne connaît** — un lien libre, le plus souvent (arbitrage A11 du
 * plan `facture-carte-et-remboursements.md`). Les commandes n'en font
 * rien ; les paiements le notent et font sonner la cloche.
 */
export class RefundWithoutOrderEvent {
  constructor(readonly report: RefundReport) {}
}
